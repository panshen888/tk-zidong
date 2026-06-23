import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FeishuBitableClient } from '../src/main/services/feishuBitableService';
import { runAutomaticMiaoshouListingFlow } from '../src/main/services/autoListingFlow';
import type { AppSettings, Task, TaskRun } from '../src/shared/types';

type StoreShape = {
  settings: AppSettings;
  tasks?: Task[];
  runs?: TaskRun[];
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

async function request<T>(token: string, appToken: string, pathPart: string, init: RequestInit) {
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

async function searchRecords(token: string, appToken: string, tableId: string, pageSize = 100) {
  const data = await request<{ items?: FeishuRecord[] }>(
    token,
    appToken,
    `/tables/${tableId}/records/search?page_size=${pageSize}`,
    { method: 'POST', body: JSON.stringify({}) },
  );
  return data.items ?? [];
}

async function updateRecord(token: string, appToken: string, tableId: string, recordId: string, fields: Record<string, unknown>) {
  await request<unknown>(
    token,
    appToken,
    `/tables/${tableId}/records/${recordId}`,
    { method: 'PUT', body: JSON.stringify({ fields }) },
  );
}

async function main() {
  const configPath = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'tiktok-ai-flow', 'config.json');
  const store = JSON.parse(await fs.readFile(configPath, 'utf8')) as StoreShape;
  const settings = store.settings;
  const task = (store.tasks ?? []).find((item) => item.inputSource === 'feishuBitable');
  const latestRun = (store.runs ?? []).find((run) => run.feishuReviewBatchId);
  if (!task) throw new Error('未找到飞书比价任务');
  const appToken = settings.priceOutputBitable.appToken || settings.priceInputBitable.appToken || task.outputBitable?.appToken || '';
  const targetSite = (settings.targetSite || 'VN').trim().toUpperCase();
  if (!appToken) throw new Error('飞书 appToken 为空');

  const token = await getToken(settings);
  const outputRecords = await searchRecords(token, appToken, settings.priceOutputBitable.tableId);
  const latestBatch = outputRecords
    .map((record) => text(record.fields['比价批次号']))
    .filter(Boolean)
    .sort()
    .at(-1);
  if (!latestBatch) throw new Error('未找到最新比价批次');

  let patchedOutputCount = 0;
  for (const record of outputRecords) {
    if (text(record.fields['比价批次号']) !== latestBatch) continue;
    if (text(record.fields['国家/站点'] ?? record.fields['国家']).trim()) continue;
    await updateRecord(token, appToken, settings.priceOutputBitable.tableId, record.record_id, {
      '国家/站点': targetSite,
    });
    patchedOutputCount += 1;
  }

  const inputRecords = await searchRecords(token, appToken, settings.priceInputBitable.tableId);
  let patchedInputCount = 0;
  for (const record of inputRecords) {
    if (text(record.fields['当前比价批次号']) !== latestBatch) continue;
    if (text(record.fields['国家/站点'] ?? record.fields['国家']).trim()) continue;
    await updateRecord(token, appToken, settings.priceInputBitable.tableId, record.record_id, {
      '国家/站点': targetSite,
    });
    patchedInputCount += 1;
  }

  const feishuClient = new FeishuBitableClient({
    appId: settings.feishuAppId,
    appSecret: settings.feishuAppSecret,
  });
  const tableInput = {
    appToken,
    inputBitable: { ...settings.priceInputBitable, appToken: settings.priceInputBitable.appToken || appToken },
    outputBitable: { ...settings.priceOutputBitable, appToken: settings.priceOutputBitable.appToken || appToken },
    reviewBitable: { ...settings.priceReviewBitable, appToken: settings.priceReviewBitable.appToken || appToken },
  };
  const review = await feishuClient.confirmLatestPriceBatchAndGenerateReviewTable({
    ...tableInput,
    batchId: latestBatch,
    weightToleranceGram: settings.weightGroupToleranceGram,
  });
  const run: TaskRun = latestRun ?? {
    id: 'manual-resume',
    taskId: task.id,
    name: 'manual-resume',
    status: 'pending',
    inputSource: 'feishuBitable',
    inputExcelPath: '',
    outputExcelPath: '',
    inputBitable: settings.priceInputBitable,
    outputBitable: settings.priceOutputBitable,
    assetDir: '',
    candidateLimit: Number(settings.candidateLimit) || 50,
    acceptedCandidateLimit: Number(settings.acceptedCandidateLimit) || 3,
    sourcingMode: settings.sourcingMode,
    parseDetail: true,
    searchAdapterMode: settings.searchAdapterMode,
    totalCount: 0,
    successCount: 0,
    failedCount: 0,
    createdAt: new Date().toISOString(),
  };
  const listing = await runAutomaticMiaoshouListingFlow({
    settings,
    run: {
      ...run,
      taskId: task.id,
      inputSource: 'feishuBitable',
      inputBitable: settings.priceInputBitable,
      outputBitable: settings.priceOutputBitable,
      feishuReviewBatchId: latestBatch,
    },
    batchId: latestBatch,
    appendLog: (level, message) => console.log(`[${level}] ${message}`),
  });

  console.log(JSON.stringify({
    latestBatch,
    targetSite,
    patchedInputCount,
    patchedOutputCount,
    review,
    listing,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
