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

async function main() {
  const recordId = process.argv[2];
  if (!recordId) {
    throw new Error('用法：npx tsx scripts/reset-price-input-record.ts <recordId> [site]');
  }
  const site = process.argv[3] || 'sg';
  const storePath = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'tiktok-ai-flow', 'config.json');
  const store = JSON.parse(await fs.readFile(storePath, 'utf8')) as StoreShape;
  const token = await getToken(store.settings.feishuAppId, store.settings.feishuAppSecret);
  const { appToken, tableId } = store.settings.priceInputBitable;
  const response = await fetch(`https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      fields: {
        '国家/站点': site,
        状态: '待处理',
        失败归因: null,
        重复位置: null,
        重复记录ID: null,
        备注: null,
      },
    }),
  });
  const payload = await response.json() as { code?: number; msg?: string };
  if (!response.ok || payload.code !== 0) {
    throw new Error(`飞书记录更新失败：${payload.code} ${payload.msg}`);
  }
  console.log(JSON.stringify({ recordId, site, status: '待处理' }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
