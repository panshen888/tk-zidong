import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

type StoreShape = {
  settings: {
    feishuAppId: string;
    feishuAppSecret: string;
    priceInputBitable: { appToken: string; tableId: string; viewId?: string };
  };
};

type FeishuResponse<T> = {
  code?: number;
  msg?: string;
  data?: T;
};

type FeishuRecord = {
  record_id: string;
  fields: Record<string, unknown>;
};

async function request<T>(url: string, init: RequestInit, token?: string): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  const payload = await response.json() as FeishuResponse<T>;
  if (!response.ok || payload.code !== 0) {
    throw new Error(`飞书接口失败：${payload.code} ${payload.msg}`);
  }
  return payload.data as T;
}

function text(value: unknown): string {
  if (value == null) {
    return '';
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(text).filter(Boolean).join('');
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return text(record.text ?? record.name ?? record.link ?? record.url ?? record.value ?? '');
  }
  return String(value);
}

async function main() {
  const storePath = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'tiktok-ai-flow', 'config.json');
  const store = JSON.parse(await fs.readFile(storePath, 'utf8')) as StoreShape;
  const { feishuAppId, feishuAppSecret, priceInputBitable } = store.settings;
  const tokenResponse = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: feishuAppId, app_secret: feishuAppSecret }),
  });
  const tokenPayload = await tokenResponse.json() as { code?: number; msg?: string; tenant_access_token?: string };
  if (!tokenResponse.ok || tokenPayload.code !== 0) {
    throw new Error(`飞书 token 获取失败：${tokenPayload.code} ${tokenPayload.msg}`);
  }
  const token = tokenPayload.tenant_access_token;
  if (!token) {
    throw new Error('飞书 tenant_access_token 为空');
  }
  const recordsData = await request<{ items?: FeishuRecord[] }>(
    `https://open.feishu.cn/open-apis/bitable/v1/apps/${priceInputBitable.appToken}/tables/${priceInputBitable.tableId}/records/search?page_size=20`,
    {
      method: 'POST',
      body: JSON.stringify({
        view_id: priceInputBitable.viewId || undefined,
        sort: [{ field_name: '最后更新时间', desc: true }],
      }),
    },
    token,
  );
  const rows = (recordsData.items ?? []).map((record) => ({
    recordId: record.record_id,
    商品ID: text(record.fields['商品ID'] ?? record.fields['原商品ID']),
    国家站点: text(record.fields['国家/站点'] ?? record.fields['国家'] ?? record.fields['站点']),
    状态: text(record.fields['状态']),
    失败归因: text(record.fields['失败归因']),
    重复位置: text(record.fields['重复位置']),
    重复记录ID: text(record.fields['重复记录ID']),
    当前比价批次号: text(record.fields['当前比价批次号']),
    郑和数据链接: text(record.fields['郑和数据链接']),
    原商品链接: text(record.fields['原商品链接']),
    原商品主图URL: text(record.fields['原商品主图URL']),
  }));
  console.log(JSON.stringify({
    appToken: priceInputBitable.appToken,
    tableId: priceInputBitable.tableId,
    viewId: priceInputBitable.viewId || '',
    count: rows.length,
    rows,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
