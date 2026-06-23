import crypto from 'node:crypto';
import os from 'node:os';
import { app } from 'electron';
import type { AuthConfig, AuthLoginInput, AuthSession, AuthStatus } from '../../shared/types';

const clientAuthPath = '/api/client/auth';

export type ServerAuthStore = {
  getConfig: () => AuthConfig;
  setConfig: (config: AuthConfig) => void;
  getSession: () => AuthSession | undefined;
  setSession: (session: AuthSession | undefined) => void;
};

export class ServerAuthService {
  constructor(private readonly store: ServerAuthStore) {}

  getStatus(): AuthStatus {
    const config = this.store.getConfig();
    const session = this.store.getSession();
    const expired = session ? isExpired(session) : false;
    return {
      authenticated: Boolean(session?.accessToken) && !expired,
      config,
      session: session && !expired ? session : undefined,
      message: session && expired ? '登录已过期，请重新登录' : undefined,
    };
  }

  async login(input: AuthLoginInput): Promise<AuthStatus> {
    const config = normalizeAuthConfig({
      serverBaseUrl: input.serverBaseUrl || this.store.getConfig().serverBaseUrl,
      appKey: input.appKey || this.store.getConfig().appKey,
    });
    if (!input.username.trim() || !input.password) {
      throw new Error('请输入服务器账号和密码');
    }

    this.store.setConfig(config);
    const response = await authRequest(config, '/login', {
      appKey: config.appKey,
      username: input.username.trim(),
      password: input.password,
      machineId: getMachineId(),
      deviceName: getDeviceName(),
      appVersion: app.getVersion(),
      platform: process.platform,
    });
    this.store.setSession(normalizeSession(response, input.username.trim()));
    return this.getStatus();
  }

  async verify(): Promise<AuthStatus> {
    const config = this.store.getConfig();
    const session = this.store.getSession();
    if (!session?.accessToken) {
      return { authenticated: false, config, message: '未登录' };
    }
    if (isExpired(session)) {
      this.store.setSession(undefined);
      return { authenticated: false, config, message: '登录已过期，请重新登录' };
    }

    try {
      const response = await authRequest(config, '/verify', {
        appKey: config.appKey,
        machineId: getMachineId(),
        deviceName: getDeviceName(),
        appVersion: app.getVersion(),
        platform: process.platform,
      }, session.accessToken);
      const verifiedSession = normalizeSession(response, session.username, session.accessToken);
      this.store.setSession({
        ...session,
        ...verifiedSession,
        accessToken: verifiedSession.accessToken || session.accessToken,
        loggedInAt: session.loggedInAt,
        verifiedAt: new Date().toISOString(),
      });
      return this.getStatus();
    } catch (error) {
      const message = error instanceof Error ? error.message : '登录校验失败';
      if (isUnauthorizedMessage(message)) {
        this.store.setSession(undefined);
      }
      if (this.store.getSession()?.accessToken && isOptionalAuthEndpointMissing(message)) {
        this.store.setSession({ ...session, verifiedAt: new Date().toISOString() });
        return {
          ...this.getStatus(),
          message: '服务器暂未提供 verify 接口，已沿用本地登录会话',
        };
      }
      return {
        authenticated: false,
        config,
        session: this.store.getSession(),
        message,
      };
    }
  }

  async heartbeat(): Promise<AuthStatus> {
    const config = this.store.getConfig();
    const session = this.store.getSession();
    if (!session?.accessToken || isExpired(session)) {
      return this.verify();
    }

    try {
      const response = await authRequest(config, '/heartbeat', {
        appKey: config.appKey,
        machineId: getMachineId(),
        deviceName: getDeviceName(),
        appVersion: app.getVersion(),
        platform: process.platform,
      }, session.accessToken);
      const nextSession = normalizeSession(response, session.username, session.accessToken);
      this.store.setSession({
        ...session,
        ...nextSession,
        accessToken: nextSession.accessToken || session.accessToken,
        loggedInAt: session.loggedInAt,
        verifiedAt: new Date().toISOString(),
      });
      return this.getStatus();
    } catch (error) {
      const message = error instanceof Error ? error.message : '登录心跳失败';
      if (isOptionalAuthEndpointMissing(message)) {
        this.store.setSession({ ...session, verifiedAt: new Date().toISOString() });
        return {
          ...this.getStatus(),
          message: '服务器暂未提供 heartbeat 接口，已沿用本地登录会话',
        };
      }
      if (isUnauthorizedMessage(message)) {
        this.store.setSession(undefined);
      }
      return this.getStatus();
    }
  }

  async logout(): Promise<AuthStatus> {
    const config = this.store.getConfig();
    const session = this.store.getSession();
    if (session?.accessToken) {
      try {
        await authRequest(config, '/logout', {
          appKey: config.appKey,
          machineId: getMachineId(),
        }, session.accessToken);
      } catch {
        // Local logout should still clear the token if the optional endpoint fails.
      }
    }
    this.store.setSession(undefined);
    return this.getStatus();
  }

  async assertFeature(feature: string) {
    const status = await this.verify();
    if (!status.authenticated || !status.session) {
      throw new Error(status.message || '请先登录服务器账号后再执行任务');
    }
    const features = status.session.permission?.features ?? {};
    const value = features[feature];
    if (value === false || value === 0 || value === 'false' || value === '0') {
      throw new Error(`当前账号未开通功能：${feature}`);
    }
    return status;
  }
}

export function normalizeAuthConfig(config: Partial<AuthConfig>): AuthConfig {
  return {
    serverBaseUrl: (config.serverBaseUrl || 'http://caiseller.top').trim().replace(/\/+$/, ''),
    appKey: (config.appKey || 'tiktok-ai-flow').trim(),
  };
}

function getMachineId() {
  const raw = [
    os.hostname(),
    os.userInfo().username,
    process.platform,
    app.getPath('userData'),
    'tiktok-ai-flow',
  ].join('|');
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function getDeviceName() {
  return `${os.hostname()} (${process.platform})`;
}

async function authRequest(config: AuthConfig, path: string, payload: Record<string, unknown>, token?: string) {
  const url = `${normalizeAuthConfig(config).serverBaseUrl}${clientAuthPath}${path}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let body: unknown = {};
  if (text.trim()) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { message: text };
    }
  }
  if (!response.ok) {
    throw new Error(`服务器请求失败 ${response.status}：${extractMessage(body)}`);
  }
  if (isRecord(body) && (body.success === false || isFailureCode(body.code))) {
    throw new Error(extractMessage(body));
  }
  return unwrapData(body);
}

function unwrapData(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }
  if (isRecord(value.data)) {
    return value.data;
  }
  return value;
}

function normalizeSession(value: Record<string, unknown>, username: string, fallbackToken = ''): AuthSession {
  const accessToken = String(
    value.accessToken ?? value.token ?? value.access_token ?? value.jwt ?? fallbackToken ?? '',
  );
  if (!accessToken) {
    throw new Error('服务器登录成功但未返回 accessToken/token');
  }
  const user = isRecord(value.user) ? value.user : undefined;
  const permission = normalizePermission(value.permission ?? value.permissions);
  const expiresAt = String(value.expiresAt ?? permission?.expiresAt ?? '');
  return {
    accessToken,
    username: String(value.username ?? user?.username ?? username ?? ''),
    user,
    app: isRecord(value.app) ? value.app : undefined,
    permission,
    device: isRecord(value.device) ? value.device : undefined,
    loggedInAt: new Date().toISOString(),
    verifiedAt: new Date().toISOString(),
    expiresAt: expiresAt || undefined,
  };
}

function normalizePermission(value: unknown) {
  if (!isRecord(value)) {
    return undefined;
  }
  const features = isRecord(value.features) ? value.features : {};
  return {
    ...value,
    expiresAt: typeof value.expiresAt === 'string' ? value.expiresAt : undefined,
    maxDevices: Number.isFinite(Number(value.maxDevices)) ? Number(value.maxDevices) : undefined,
    features,
  };
}

function isExpired(session: AuthSession) {
  const expiresAt = session.expiresAt || session.permission?.expiresAt;
  if (!expiresAt) {
    return false;
  }
  const time = Date.parse(expiresAt);
  return Number.isFinite(time) && time <= Date.now();
}

function isFailureCode(code: unknown) {
  if (code === undefined || code === null || code === '' || code === 0 || code === '0') {
    return false;
  }
  return code !== 200 && code !== '200' && code !== 'SUCCESS' && code !== 'success';
}

function isOptionalAuthEndpointMissing(message: string) {
  return message.includes('404') && /verify|heartbeat|logout|Route not found/i.test(message);
}

function isUnauthorizedMessage(message: string) {
  return message.includes('401') || message.includes('403') || message.includes('过期') || message.includes('未授权');
}

function extractMessage(value: unknown) {
  if (isRecord(value)) {
    return String(value.message ?? value.msg ?? value.error ?? '未知错误');
  }
  return String(value || '未知错误');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
