import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

type StoreShape = {
  settings: {
    feishuAppId: string;
    feishuAppSecret: string;
    priceOutputBitable: { appToken: string; tableId: string; viewId?: string };
  };
};

async function getToken(appId: string, appSecret: string) {
  const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const payload = await response.json() as { code?: number; msg?: string; tenant_access_token?: string };
  if (!response.ok || payload.code !== 0 || !payload.tenant_access_token) {
    throw new Error(`飞书 token 获取失败：${payload.code} ${payload.msg}`);
  }
  return payload.tenant_access_token;
}

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

async function main() {
  const storePath = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'tiktok-ai-flow', 'config.json');
  const store = JSON.parse(await fs.readFile(storePath, 'utf8')) as StoreShape;
  const token = await getToken(store.settings.feishuAppId, store.settings.feishuAppSecret);
  const { appToken, tableId, viewId } = store.settings.priceOutputBitable;
  const response = await fetch(`https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/search?page_size=50`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ view_id: viewId || undefined }),
  });
  const payload = await response.json() as { code?: number; msg?: string; data?: { items?: Array<{ record_id: string; fields: Record<string, unknown> }> } };
  if (!response.ok || payload.code !== 0) {
    throw new Error(`飞书表二读取失败：${payload.code} ${payload.msg}`);
  }
  const rows = (payload.data?.items ?? []).map((record) => ({
    recordId: record.record_id,
    商品ID: text(record.fields['商品ID']),
    国家站点: text(record.fields['国家/站点']),
    候选序号: text(record.fields['候选序号']),
    状态: text(record.fields['状态']),
    商品组状态: text(record.fields['商品组状态']),
    失败归因: text(record.fields['失败归因']),
    比价批次号: text(record.fields['比价批次号']),
    链接: text(record.fields['1688链接']),
    offerId: text(record.fields['offerId']),
    风险备注: text(record.fields['风险备注']),
  }));
  console.log(JSON.stringify({ appToken, tableId, count: rows.length, rows }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
