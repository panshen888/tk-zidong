import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FeishuBitableClient } from '../src/main/services/feishuBitableService';
import { startTaskRun } from '../src/main/services/taskRunner';
import { timestampId, type TaskStore } from '../src/main/services/taskStore';
import type { AppSettings, Task, TaskLogEntry, TaskRun } from '../src/shared/types';

type StoreShape = {
  settings: AppSettings;
  tasks?: Task[];
  runs?: TaskRun[];
  logs?: Record<string, TaskLogEntry[]>;
};

function configPath() {
  return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'tiktok-ai-flow', 'config.json');
}

async function readStore() {
  return JSON.parse(await fs.readFile(configPath(), 'utf8')) as StoreShape;
}

async function writeStore(store: StoreShape) {
  const targetPath = configPath();
  const tempPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tempPath, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
  await renameWithRetry(tempPath, targetPath);
}

async function renameWithRetry(sourcePath: string, targetPath: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await fs.rename(sourcePath, targetPath);
      return;
    } catch (error) {
      lastError = error;
      const code = (error as { code?: string }).code;
      if (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES') {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 120 + attempt * 120));
    }
  }
  throw lastError;
}

function normalizeBitable(config: Partial<NonNullable<Task['inputBitable']>> | undefined, appToken = '') {
  return {
    appToken: config?.appToken || appToken,
    tableId: config?.tableId || '',
    viewId: config?.viewId || '',
  };
}

async function main() {
  let store = await readStore();
  const settings = store.settings;
  const task = (store.tasks ?? []).find((item) => item.inputSource === 'feishuBitable');
  if (!task?.inputBitable || !task.outputBitable) {
    throw new Error('未找到飞书比价任务或任务表配置不完整');
  }

  const appToken = settings.priceInputBitable.appToken || task.inputBitable.appToken || task.outputBitable.appToken;
  const inputBitable = normalizeBitable(settings.priceInputBitable.tableId ? settings.priceInputBitable : task.inputBitable, appToken);
  const outputBitable = normalizeBitable(settings.priceOutputBitable.tableId ? settings.priceOutputBitable : task.outputBitable, appToken);
  const reviewBitable = normalizeBitable(settings.priceReviewBitable, appToken);

  const feishuClient = new FeishuBitableClient({
    appId: settings.feishuAppId,
    appSecret: settings.feishuAppSecret,
  });
  const claimMode = process.argv.includes('--failed') ? 'failedOnly' : 'pendingOnly';
  const claimedRecord = await feishuClient.claimNextPendingSelectionRecord(inputBitable, claimMode, {
    inputBitable,
    outputBitable,
    reviewBitable,
  });
  if (!claimedRecord) {
    console.log(JSON.stringify({ status: 'skipped', reason: claimMode === 'failedOnly' ? '没有失败记录' : '没有待处理记录' }, null, 2));
    return;
  }

  const runId = timestampId('run_smoke');
  const createdAt = new Date().toISOString();
  const taskAssetDir = task.assetDir || path.join(settings.defaultAssetDir, `${task.name}-${task.id}`);
  const runAssetDir = path.join(taskAssetDir, 'runs', runId);
  await fs.mkdir(path.join(runAssetDir, 'input'), { recursive: true });
  await fs.mkdir(path.join(runAssetDir, 'images'), { recursive: true });
  await fs.mkdir(path.join(runAssetDir, 'output'), { recursive: true });
  await fs.mkdir(path.join(runAssetDir, 'logs'), { recursive: true });

  const run: TaskRun = {
    id: runId,
    taskId: task.id,
    name: `${task.name}-smoke-${new Date(createdAt).toLocaleString('zh-CN', { hour12: false })}`,
    status: 'pending',
    inputSource: 'feishuBitable',
    inputExcelPath: path.join(runAssetDir, 'input', 'source.xlsx'),
    outputExcelPath: path.join(runAssetDir, 'output', 'result.xlsx'),
    inputBitable,
    outputBitable,
    assetDir: runAssetDir,
    candidateLimit: Math.max(1, Number(task.candidateLimit) || Number(settings.candidateLimit) || 50),
    acceptedCandidateLimit: Math.max(1, Number(task.acceptedCandidateLimit) || Number(settings.acceptedCandidateLimit) || 3),
    sourcingMode: task.sourcingMode || settings.sourcingMode,
    parseDetail: true,
    searchAdapterMode: settings.searchAdapterMode,
    totalCount: 0,
    successCount: 0,
    failedCount: 0,
    createdAt,
    feishuInputRecordId: claimedRecord.recordId,
    feishuInputItem: claimedRecord.item,
    feishuClaimStatus: claimMode,
  };

  store = await readStore();
  store.runs = [run, ...(store.runs ?? [])];
  store.tasks = (store.tasks ?? []).map((item) =>
    item.id === task.id
      ? { ...item, status: 'pending', currentRunId: runId, latestRunId: runId, startedAt: undefined, finishedAt: undefined }
      : item,
  );
  store.logs = {
    ...(store.logs ?? {}),
    [runId]: [{
      id: timestampId('log'),
      taskId: task.id,
      runId,
      level: 'info',
      message: `smoke 已领取一行（${claimMode}）：${claimedRecord.item.sourceUrl}`,
      createdAt,
    }],
  };
  await writeStore(store);
  let persistQueue = Promise.resolve();
  const persistStore = () => {
    persistQueue = persistQueue
      .catch(() => undefined)
      .then(() => writeStore(store));
    return persistQueue;
  };

  const taskStore: TaskStore = {
    getSettings: () => store.settings,
    getTasks: () => store.tasks ?? [],
    setTasks: (tasks) => {
      store.tasks = tasks;
      void persistStore();
    },
    getTask: (taskId) => (store.tasks ?? []).find((item) => item.id === taskId),
    updateTask: (taskId, patch) => {
      const tasks = store.tasks ?? [];
      store.tasks = tasks.map((item) => item.id === taskId ? { ...item, ...patch } : item);
      void persistStore();
      const updated = store.tasks.find((item) => item.id === taskId);
      if (!updated) {
        throw new Error('任务不存在');
      }
      return updated;
    },
    getRuns: () => store.runs ?? [],
    setRuns: (runs) => {
      store.runs = runs;
      void persistStore();
    },
    getRun: (id) => (store.runs ?? []).find((item) => item.id === id),
    getTaskRuns: (taskId) => (store.runs ?? []).filter((item) => item.taskId === taskId),
    updateRun: (id, patch) => {
      const runs = store.runs ?? [];
      store.runs = runs.map((item) => item.id === id ? { ...item, ...patch } : item);
      void persistStore();
      const updated = store.runs.find((item) => item.id === id);
      if (!updated) {
        throw new Error('执行日志不存在');
      }
      return updated;
    },
    appendLog: (id, level, message) => {
      const entry: TaskLogEntry = {
        id: timestampId('log'),
        taskId: task.id,
        runId: id,
        level,
        message,
        createdAt: new Date().toISOString(),
      };
      store.logs = store.logs ?? {};
      store.logs[id] = [...(store.logs[id] ?? []), entry];
      void persistStore();
      console.log(`[${level}] ${message}`);
      return entry;
    },
  };

  const result = await startTaskRun(runId, taskStore);
  await persistQueue;
  await writeStore(store);
  console.log(JSON.stringify({
    runId,
    status: result.status,
    totalCount: result.totalCount,
    successCount: result.successCount,
    failedCount: result.failedCount,
    inputRecordId: claimedRecord.recordId,
    sourceUrl: claimedRecord.item.sourceUrl,
  }, null, 2));
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
