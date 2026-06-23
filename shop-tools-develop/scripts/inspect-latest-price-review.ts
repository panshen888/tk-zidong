import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

type BitableConfig = { appToken: string; tableId: string; viewId?: string };

type StoreShape = {
  settings: {
    feishuAppId: string;
    feishuAppSecret: string;
    priceOutputBitable: BitableConfig;
    priceReviewBitable: BitableConfig;
  };
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

async function readRecords(token: string, bitable: BitableConfig, pageSize = 100) {
  const response = await fetch(
    `https://open.feishu.cn/open-apis/bitable/v1/apps/${bitable.appToken}/tables/${bitable.tableId}/records/search?page_size=${pageSize}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ view_id: bitable.viewId || undefined }),
    },
  );
  const payload = await response.json() as { code?: number; msg?: string; data?: { items?: FeishuRecord[] } };
  if (!response.ok || payload.code !== 0) {
    throw new Error(`飞书读取失败：${payload.code} ${payload.msg}`);
  }
  return payload.data?.items ?? [];
}

async function main() {
  const storePath = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'tiktok-ai-flow', 'config.json');
  const store = JSON.parse(await fs.readFile(storePath, 'utf8')) as StoreShape;
  const token = await getToken(store.settings.feishuAppId, store.settings.feishuAppSecret);
  const outputRecords = await readRecords(token, store.settings.priceOutputBitable);
  const outputRows = outputRecords.map((record) => ({
    recordId: record.record_id,
    商品ID: text(record.fields['商品ID'] ?? record.fields['原商品ID']),
    国家站点: text(record.fields['国家/站点'] ?? record.fields['国家']),
    商品组状态: text(record.fields['商品组状态']),
    候选状态: text(record.fields['候选状态'] ?? record.fields['状态']),
    失败归因: text(record.fields['失败归因']),
    比价批次号: text(record.fields['比价批次号']),
    候选序号: text(record.fields['候选序号']),
    链接: text(record.fields['1688链接'] ?? record.fields['推荐1688链接']),
    offerId: text(record.fields['offerId']),
    SKU名称: text(record.fields['SKU名称']),
    采购成本价: text(record.fields['采购成本价'] ?? record.fields['采购总成本']),
    克重: text(record.fields['克重']),
    尺寸: text(record.fields['尺寸']),
    风险备注: text(record.fields['风险备注']),
  }));
  const latestBatch = outputRows.map((row) => row.比价批次号).filter(Boolean).sort().at(-1) ?? '';
  const reviewRecords = await readRecords(token, store.settings.priceReviewBitable);
  const reviewRows = reviewRecords.map((record) => ({
    recordId: record.record_id,
    商品ID: text(record.fields['商品ID'] ?? record.fields['原商品ID']),
    国家站点: text(record.fields['国家/站点'] ?? record.fields['国家']),
    状态: text(record.fields['状态']),
    失败归因: text(record.fields['失败归因'] ?? record.fields['失败原因']),
    比价批次号: text(record.fields['比价批次号'] ?? record.fields['当前比价批次号']),
    推荐1688链接: text(record.fields['推荐1688链接'] ?? record.fields['1688链接']),
    offerId: text(record.fields['offerId']),
    SKU名称: text(record.fields['推荐SKU名称'] ?? record.fields['SKU名称']),
    采购总成本: text(record.fields['采购总成本'] ?? record.fields['采购成本价']),
    克重: text(record.fields['克重']),
    尺寸: text(record.fields['尺寸']),
    选择依据: text(record.fields['选择依据']),
    风险备注: text(record.fields['风险备注']),
  }));

  console.log(JSON.stringify({
    latestBatch,
    outputRows: outputRows.filter((row) => !latestBatch || row.比价批次号 === latestBatch),
    reviewRows: reviewRows.filter((row) => !latestBatch || row.比价批次号 === latestBatch),
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
