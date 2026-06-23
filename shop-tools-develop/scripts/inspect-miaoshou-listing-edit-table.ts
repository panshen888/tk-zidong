import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { AppSettings, Task } from '../src/shared/types';

type StoreShape = {
  settings: AppSettings;
  tasks?: Task[];
};

type FeishuResponse<T> = {
  code?: number;
  msg?: string;
  data?: T;
  tenant_access_token?: string;
};

type FeishuRecord = {
  record_id: string;
  fields: Record<string, unknown>;
};

async function main() {
  const configPath = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'tiktok-ai-flow', 'config.json');
  const store = JSON.parse(await fs.readFile(configPath, 'utf8')) as StoreShape;
  const settings = store.settings;
  const task = (store.tasks ?? []).find((item) => item.inputSource === 'feishuBitable');
  const appToken = task?.outputBitable?.appToken || settings.priceReviewBitable.appToken;
  const tableId = process.argv[2] || 'tblZAcboSuBPVuJ4';

  if (!settings.feishuAppId || !settings.feishuAppSecret || !appToken) {
    throw new Error('飞书配置不完整');
  }

  const tokenPayload = await request<{ tenant_access_token: string }>('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: settings.feishuAppId,
      app_secret: settings.feishuAppSecret,
    }),
  });
  const token = tokenPayload.tenant_access_token;

  const recordsPayload = await request<{ items?: FeishuRecord[] }>(
    `https://open.feishu.cn/open-apis/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/records/search?page_size=50`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    },
  );

  const fieldsToPrint = [
    '商品ID',
    '国家/站点',
    '目标店铺ID',
    '目标店铺名称',
    '公共采集箱ID',
    'TikTok采集箱ID',
    '编辑模式',
    '采集状态',
    '认领状态',
    '店铺认领状态',
    '编辑状态',
    '发布准备状态',
    '发布复核状态',
    '发布复核时间',
    '妙手发布状态',
    '妙手发布任务ID',
    'TikTok商品ID',
    '已发布商品链接',
    '维护状态',
    '维护备注',
    '统一货源价格',
    '展示价格',
    '本地展示价',
    '包裹重量g',
    '包裹长度cm',
    '包裹宽度cm',
    '包裹高度cm',
    '失败原因',
  ];

  const rows = (recordsPayload.items ?? []).map((record) => ({
    recordId: record.record_id,
    ...Object.fromEntries(fieldsToPrint.map((name) => [name, fieldValueToText(record.fields[name])])),
  }));

  console.log(JSON.stringify({
    appToken,
    tableId,
    count: rows.length,
    rows,
  }, null, 2));
}

async function request<T>(url: string, options: RequestInit) {
  const response = await fetch(url, options);
  const payload = await response.json() as FeishuResponse<T>;
  if (!response.ok || (typeof payload.code === 'number' && payload.code !== 0)) {
    throw new Error(`飞书接口失败：${response.status} ${payload.code ?? ''} ${payload.msg ?? ''}`);
  }
  if (payload.data) {
    return payload.data;
  }
  return payload as T;
}

function fieldValueToText(value: unknown): string {
  if (value == null) {
    return '';
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(fieldValueToText).filter(Boolean).join('');
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return String(record.text ?? record.link ?? record.url ?? record.name ?? '');
  }
  return String(value);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
