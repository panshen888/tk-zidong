import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AppSettings } from '../src/shared/types';

type StoreShape = {
  settings: AppSettings;
};

type FeishuRecord = {
  record_id: string;
  fields: Record<string, unknown>;
};

function text(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join('');
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return text(record.text ?? record.name ?? record.link ?? record.url ?? record.value ?? '');
  }
  return String(value);
}

async function getToken(settings: AppSettings) {
  const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: settings.feishuAppId, app_secret: settings.feishuAppSecret }),
  });
  const payload = await response.json() as { code?: number; msg?: string; tenant_access_token?: string };
  if (!response.ok || payload.code !== 0 || !payload.tenant_access_token) {
    throw new Error(`飞书 token 获取失败：${payload.code} ${payload.msg}`);
  }
  return payload.tenant_access_token;
}

async function feishuRequest<T>(token: string, appToken: string, pathPart: string, init: RequestInit) {
  const response = await fetch(`https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}${pathPart}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
  const payload = await response.json() as { code?: number; msg?: string; data?: T };
  if (!response.ok || payload.code !== 0) {
    throw new Error(`飞书接口失败：${payload.code} ${payload.msg}`);
  }
  return payload.data as T;
}

function extractOfferId(value: string) {
  return value.match(/offer\/(\d+)\.html/i)?.[1] ?? value.match(/[?&]offerId=(\d+)/i)?.[1] ?? '';
}

async function main() {
  const configPath = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'tiktok-ai-flow', 'config.json');
  const store = JSON.parse(await fs.readFile(configPath, 'utf8')) as StoreShape;
  const settings = store.settings;
  const appToken = settings.priceReviewBitable.appToken || settings.priceOutputBitable.appToken || settings.priceInputBitable.appToken;
  const tableId = 'tblZAcboSuBPVuJ4';
  const token = await getToken(settings);
  const recordsData = await feishuRequest<{ items?: FeishuRecord[] }>(
    token,
    appToken,
    `/tables/${tableId}/records/search?page_size=100`,
    { method: 'POST', body: JSON.stringify({}) },
  );
  const rows = recordsData.items ?? [];
  let patchedCount = 0;
  for (const record of rows) {
    const productId = text(record.fields['商品ID']);
    const sourceId = text(record.fields['采集源货源ID']);
    const offerId = text(record.fields['offerId']) || extractOfferId(text(record.fields['推荐1688链接']));
    const editStatus = text(record.fields['编辑状态']);
    if (!productId.startsWith('img_') || !offerId || sourceId === offerId) {
      continue;
    }
    await feishuRequest(
      token,
      appToken,
      `/tables/${tableId}/records/${record.record_id}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          fields: {
            采集源货源ID: offerId,
            货源ID: offerId,
            编辑状态: editStatus === '需人工处理' ? '待保存草稿' : editStatus,
            发布准备状态: '待浏览器保存并发布',
            失败原因: '',
          },
        }),
      },
    );
    patchedCount += 1;
  }
  console.log(JSON.stringify({ tableId, patchedCount }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
