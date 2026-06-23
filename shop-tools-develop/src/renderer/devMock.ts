import { defaultSettings } from '../shared/defaults';
import type { AppApi, AppSettings, AuthStatus, CreateTaskInput, Task, TaskLogEntry, TaskRun } from '../shared/types';

const memory = {
  settings: {
    ...defaultSettings,
    defaultOutputDir: '/preview/outputs',
    defaultAssetDir: '/preview/tasks',
    feishuAppId: '',
    feishuAppSecret: '',
    listingShopMappings: '',
    lastFeishuInputBitable: { appToken: '', tableId: '', viewId: '' },
    lastFeishuOutputBitable: { appToken: '', tableId: '', viewId: '' },
    listingResultBitable: { appToken: '', tableId: '', viewId: '' },
  },
  tasks: [] as Task[],
  runs: [] as TaskRun[],
  logs: {} as Record<string, TaskLogEntry[]>,
  authStatus: {
    authenticated: true,
    config: {
      serverBaseUrl: defaultSettings.authServerBaseUrl,
      appKey: defaultSettings.authAppKey,
    },
    session: {
      accessToken: 'preview-token',
      username: 'preview',
      loggedInAt: new Date().toISOString(),
      verifiedAt: new Date().toISOString(),
      permission: {
        features: {
          aiPrice: true,
          aiListing: true,
          miaoshouApi: true,
          miaoshouBrowserPublish: true,
        },
      },
    },
  } as AuthStatus,
};

function createId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}`;
}

export function installDevMockApi() {
  if (window.appApi) {
    return;
  }

  const api: AppApi = {
    getAuthStatus: async () => memory.authStatus,
    loginAuth: async (input) => {
      memory.authStatus = {
        authenticated: true,
        config: {
          serverBaseUrl: input.serverBaseUrl || defaultSettings.authServerBaseUrl,
          appKey: input.appKey || defaultSettings.authAppKey,
        },
        session: {
          accessToken: 'preview-token',
          username: input.username,
          loggedInAt: new Date().toISOString(),
          verifiedAt: new Date().toISOString(),
          permission: {
            features: {
              aiPrice: true,
              aiListing: true,
              miaoshouApi: true,
              miaoshouBrowserPublish: true,
            },
          },
        },
      };
      return memory.authStatus;
    },
    verifyAuth: async () => memory.authStatus,
    heartbeatAuth: async () => memory.authStatus,
    logoutAuth: async () => {
      memory.authStatus = {
        authenticated: false,
        config: memory.authStatus.config,
      };
      return memory.authStatus;
    },
    getSettings: async () => memory.settings,
    saveSettings: async (settings: AppSettings) => {
      memory.settings = settings;
      return memory.settings;
    },
    listTasks: async () => memory.tasks,
    createTask: async (input: CreateTaskInput) => {
      const id = createId('preview_task');
      const task: Task = {
        id,
        name: input.inputSource === 'feishuBitable'
          ? `feishu-${input.inputBitable?.tableId || 'preview'}`
          : input.inputExcelPath?.split('/').pop()?.replace(/\.(xlsx|xls)$/i, '') || 'preview-task',
        status: 'pending',
        inputSource: input.inputSource ?? 'excel',
        inputExcelPath: input.inputSource === 'feishuBitable'
          ? `feishu://${input.inputBitable?.appToken}/${input.inputBitable?.tableId}`
          : input.inputExcelPath ?? '',
        inputBitable: input.inputBitable,
        outputBitable: input.outputBitable,
        assetDir: memory.settings.defaultAssetDir,
        candidateLimit: input.candidateLimit ?? memory.settings.candidateLimit,
        acceptedCandidateLimit: input.acceptedCandidateLimit ?? memory.settings.acceptedCandidateLimit,
        sourcingMode: input.sourcingMode ?? memory.settings.sourcingMode,
        parseDetail: input.parseDetail ?? memory.settings.parseDetailByDefault,
        searchAdapterMode: memory.settings.searchAdapterMode,
        totalCount: 0,
        successCount: 0,
        failedCount: 0,
        createdAt: new Date().toISOString(),
      };
      memory.tasks = [task, ...memory.tasks];
      return task;
    },
    startTask: async (taskId: string) => {
      const task = memory.tasks.find((item) => item.id === taskId);
      if (!task) {
        throw new Error('任务不存在');
      }
      const runId = createId('preview_run');
      const run: TaskRun = {
        id: runId,
        taskId,
        name: `${task.name}-预览执行`,
        status: 'success',
        inputSource: task.inputSource,
        inputExcelPath: task.inputExcelPath,
        outputExcelPath: `${memory.settings.defaultOutputDir}/result.xlsx`,
        inputBitable: task.inputBitable,
        outputBitable: task.outputBitable,
        assetDir: `${task.assetDir}/runs/${runId}`,
        candidateLimit: task.candidateLimit,
        acceptedCandidateLimit: task.acceptedCandidateLimit,
        sourcingMode: task.sourcingMode,
        parseDetail: task.parseDetail,
        searchAdapterMode: task.searchAdapterMode,
        totalCount: 3,
        successCount: 2,
        failedCount: 1,
        createdAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
      };
      const nextTask = {
        ...task,
        status: 'success' as const,
        totalCount: 3,
        successCount: 2,
        failedCount: 1,
        latestRunId: runId,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
      };
      memory.tasks = memory.tasks.map((item) => (item.id === taskId ? nextTask : item));
      memory.runs = [run, ...memory.runs];
      memory.logs[runId] = [
        {
          id: createId('preview_log'),
          taskId,
          runId,
          createdAt: new Date().toISOString(),
          level: 'info',
          message: '预览模式：已模拟完成 Excel 读取与图片缓存。',
        },
      ];
      return run;
    },
    retryFailedTask: async (taskId: string) => api.startTask(taskId),
    startRealtimeTask: async (taskId: string) => {
      const task = memory.tasks.find((item) => item.id === taskId);
      if (!task) {
        throw new Error('任务不存在');
      }
      const nextTask = { ...task, realtimeEnabled: true };
      memory.tasks = memory.tasks.map((item) => (item.id === taskId ? nextTask : item));
      return nextTask;
    },
    stopRealtimeTask: async (taskId: string) => {
      const task = memory.tasks.find((item) => item.id === taskId);
      if (!task) {
        throw new Error('任务不存在');
      }
      const nextTask = { ...task, realtimeEnabled: false };
      memory.tasks = memory.tasks.map((item) => (item.id === taskId ? nextTask : item));
      return nextTask;
    },
    cancelTask: async (taskId: string) => {
      const task = memory.tasks.find((item) => item.id === taskId);
      if (!task) {
        throw new Error('任务不存在');
      }
      const nextTask = {
        ...task,
        status: 'cancelled' as const,
        finishedAt: new Date().toISOString(),
      };
      memory.tasks = memory.tasks.map((item) => (item.id === taskId ? nextTask : item));
      return nextTask;
    },
    deleteTask: async (taskId: string) => {
      memory.tasks = memory.tasks.filter((task) => task.id !== taskId);
      for (const run of memory.runs.filter((item) => item.taskId === taskId)) {
        delete memory.logs[run.id];
      }
      memory.runs = memory.runs.filter((run) => run.taskId !== taskId);
      return memory.tasks;
    },
    clearTasks: async () => {
      memory.tasks = [];
      memory.runs = [];
      memory.logs = {};
      return memory.tasks;
    },
    listTaskRuns: async (taskId: string) => memory.runs.filter((run) => run.taskId === taskId),
    deleteTaskRun: async (runId: string) => {
      const run = memory.runs.find((item) => item.id === runId);
      memory.runs = memory.runs.filter((item) => item.id !== runId);
      delete memory.logs[runId];
      return run ? memory.runs.filter((item) => item.taskId === run.taskId) : [];
    },
    getTaskLogs: async (taskId: string) => {
      const run = memory.runs.find((item) => item.taskId === taskId);
      return run ? memory.logs[run.id] ?? [] : [];
    },
    getRunLogEntries: async (runId: string) => memory.logs[runId] ?? [],
    selectExcelFile: async () => '/preview/选品表.xlsx',
    selectChromeExecutable: async () => '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    selectDirectory: async () => '/preview/tasks',
    openLoginBrowser: async () => memory.settings,
    openPath: async () => undefined,
    openUserGuide: async () => undefined,
    ensurePriceComparisonTables: async () => ({
      inputBitable: { appToken: 'preview', tableId: 'tbl_price_input', viewId: '' },
      outputBitable: { appToken: 'preview', tableId: 'tbl_price_output', viewId: '' },
      reviewBitable: { appToken: 'preview', tableId: 'tbl_price_review', viewId: '' },
    }),
    exportLocalThreeTableTemplate: async () => ({
      outputExcelPath: '/preview/tasks/ai-price-three-table-template.xlsx',
    }),
    generateLocalPriceComparisonReviewTable: async (input) => ({
      outputExcelPath: input.workbookPath,
      scannedGroupCount: 1,
      generatedCount: 1,
      failedCount: 0,
    }),
    generatePriceComparisonReviewTable: async () => ({
      inputBitable: { appToken: 'preview', tableId: 'tbl_price_input', viewId: '' },
      outputBitable: { appToken: 'preview', tableId: 'tbl_price_output', viewId: '' },
      reviewBitable: { appToken: 'preview', tableId: 'tbl_price_review', viewId: '' },
      scannedGroupCount: 1,
      generatedCount: 1,
      failedCount: 0,
    }),
    confirmLatestPriceBatchAndGenerateReviewTable: async () => ({
      inputBitable: { appToken: 'preview', tableId: 'tbl_price_input', viewId: '' },
      outputBitable: { appToken: 'preview', tableId: 'tbl_price_output', viewId: '' },
      reviewBitable: { appToken: 'preview', tableId: 'tbl_price_review', viewId: '' },
      scannedGroupCount: 1,
      generatedCount: 1,
      failedCount: 0,
      batchId: 'cmp_preview',
      verifiedOutputCount: 3,
      pricingSyncedCount: 1,
    }),
    queryMiaoshouShops: async () => ({
      shops: [
        {
          shopId: 10001,
          site: 'US',
          siteName: 'United States',
          shopNick: 'Preview TikTok Shop',
          platform: 'tiktok',
          status: 'normal',
        },
      ],
    }),
    exportMiaoshouShopConfig: async () => ({
      outputExcelPath: '/preview/tasks/miaoshou-shop-config.xlsx',
      shopCount: 5,
    }),
    refreshMiaoshouPricingTemplates: async () => ({
      templates: [
        {
          priceTemplateId: 'tpl_preview_my',
          name: 'MY 5%利润模板',
          site: 'MY',
          currency: 'MYR',
          profitPercent: 0.05,
        },
      ],
    }),
    syncListingPricingConfigToReviewTable: async () => ({
      reviewBitable: { appToken: 'preview', tableId: 'tbl_price_review', viewId: '' },
      scannedCount: 0,
      updatedCount: 0,
      skippedCount: 0,
    }),
    ensureMiaoshouListingResultTable: async () => ({
      listingResultBitable: { appToken: 'preview', tableId: 'tbl_listing_result', viewId: '' },
    }),
    checkMiaoshouPublishReadiness: async () => ({
      collectBoxCount: 1,
      warehouseCount: 1,
      categoryMetadataLoaded: true,
      missing: [],
    }),
    generateMiaoshouListingEditTable: async () => ({
      listingBitable: { appToken: 'preview', tableId: 'tbl_listing', viewId: '' },
      listingAuditBitable: { appToken: 'preview', tableId: 'tbl_listing_audit', viewId: '' },
      publicationBitable: { appToken: 'preview', tableId: 'tbl_publication', viewId: '' },
      purchaseBitable: { appToken: 'preview', tableId: 'tbl_purchase', viewId: '' },
      listingEditBitable: { appToken: 'preview', tableId: 'tbl_listing_edit', viewId: '' },
      scannedCount: 1,
      createdCount: 1,
      updatedCount: 1,
      skippedCount: 0,
      failedCount: 0,
    }),
    prepareMiaoshouListingDraftRetry: async () => ({
      listingBitable: { appToken: 'preview', tableId: 'tbl_listing', viewId: '' },
      listingAuditBitable: { appToken: 'preview', tableId: 'tbl_listing_audit', viewId: '' },
      publicationBitable: { appToken: 'preview', tableId: 'tbl_publication', viewId: '' },
      purchaseBitable: { appToken: 'preview', tableId: 'tbl_purchase', viewId: '' },
      listingEditBitable: { appToken: 'preview', tableId: 'tbl_listing_edit', viewId: '' },
      scannedCount: 1,
      preparedCount: 1,
      skippedCount: 0,
      failedCount: 0,
    }),
    saveMiaoshouListingDrafts: async () => ({
      listingBitable: { appToken: 'preview', tableId: 'tbl_listing', viewId: '' },
      listingAuditBitable: { appToken: 'preview', tableId: 'tbl_listing_audit', viewId: '' },
      publicationBitable: { appToken: 'preview', tableId: 'tbl_publication', viewId: '' },
      purchaseBitable: { appToken: 'preview', tableId: 'tbl_purchase', viewId: '' },
      listingEditBitable: { appToken: 'preview', tableId: 'tbl_listing_edit', viewId: '' },
      scannedCount: 1,
      savedCount: 1,
      skippedCount: 0,
      failedCount: 0,
    }),
    publishMiaoshouListingProducts: async () => ({
      listingBitable: { appToken: 'preview', tableId: 'tbl_listing', viewId: '' },
      listingAuditBitable: { appToken: 'preview', tableId: 'tbl_listing_audit', viewId: '' },
      publicationBitable: { appToken: 'preview', tableId: 'tbl_publication', viewId: '' },
      purchaseBitable: { appToken: 'preview', tableId: 'tbl_purchase', viewId: '' },
      listingEditBitable: { appToken: 'preview', tableId: 'tbl_listing_edit', viewId: '' },
      scannedCount: 1,
      publishedCount: 1,
      skippedCount: 0,
      failedCount: 0,
    }),
    publishMiaoshouListingProductsByBrowser: async () => ({
      listingEditBitable: { appToken: 'preview', tableId: 'tbl_listing_edit', viewId: '' },
      listingResultBitable: { appToken: 'preview', tableId: 'tbl_listing_result', viewId: '' },
      scannedCount: 1,
      executedCount: 1,
      skippedCount: 0,
      failedCount: 0,
    }),
    verifyMiaoshouPublishResults: async () => ({
      listingBitable: { appToken: 'preview', tableId: 'tbl_listing', viewId: '' },
      listingAuditBitable: { appToken: 'preview', tableId: 'tbl_listing_audit', viewId: '' },
      publicationBitable: { appToken: 'preview', tableId: 'tbl_publication', viewId: '' },
      purchaseBitable: { appToken: 'preview', tableId: 'tbl_purchase', viewId: '' },
      listingEditBitable: { appToken: 'preview', tableId: 'tbl_listing_edit', viewId: '' },
      scannedCount: 1,
      verifiedCount: 1,
      publishedCount: 1,
      pendingCount: 0,
      notFoundCount: 0,
      failedCount: 0,
    }),
    preparePublishedListingMaintenance: async () => ({
      listingBitable: { appToken: 'preview', tableId: 'tbl_listing', viewId: '' },
      listingAuditBitable: { appToken: 'preview', tableId: 'tbl_listing_audit', viewId: '' },
      publicationBitable: { appToken: 'preview', tableId: 'tbl_publication', viewId: '' },
      purchaseBitable: { appToken: 'preview', tableId: 'tbl_purchase', viewId: '' },
      listingEditBitable: { appToken: 'preview', tableId: 'tbl_listing_edit', viewId: '' },
      scannedCount: 1,
      preparedCount: 1,
      skippedCount: 0,
      failedCount: 0,
    }),
  };

  window.appApi = api;
}
