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

async function main() {
  const configPath = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'tiktok-ai-flow', 'config.json');
  const store = JSON.parse(await fs.readFile(configPath, 'utf8')) as StoreShape;
  const settings = store.settings;
  const task = (store.tasks ?? []).find((item) => item.inputSource === 'feishuBitable');
  const appToken = task?.outputBitable?.appToken || settings.priceReviewBitable.appToken;
  const tableId = process.argv[2] || 'tblZAcboSuBPVuJ4';
  const recordId = process.argv[3] || 'recvmnZbu42uzS';

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

  await request<unknown>(
    `https://open.feishu.cn/open-apis/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/records/${encodeURIComponent(recordId)}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          编辑状态: '待保存草稿',
          失败原因: '',
          最后更新时间: Date.now(),
        },
      }),
    },
  );

  console.log(JSON.stringify({ tableId, recordId, editStatus: '待保存草稿' }, null, 2));
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

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
