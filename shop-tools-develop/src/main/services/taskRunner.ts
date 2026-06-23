import path from 'node:path';
import { getTaskStatus, type TaskStore, writeJsonFile } from './taskStore';
import { processExcelTask, processProductItems } from './excelService';
import { createMockDetailPageAdapter, createReal1688DetailPageAdapter } from './detailAdapter';
import { assertFeishuBitableConfig, assertFeishuCredentials, FeishuBitableClient } from './feishuBitableService';
import { createAiUsageStats, createImageSimilarityService } from './imageSimilarityService';
import { createMockImageSearchAdapter, createReal1688ImageSearchAdapter } from './searchAdapter';
import { createAsyncLimiter } from './concurrency';
import { runAutomaticMiaoshouListingFlow } from './autoListingFlow';
import { defaultSettings } from '../../shared/defaults';
import type { AiUsageStats, AppSettings, FeishuBitableConfig, TaskRun } from '../../shared/types';

export async function startTaskRun(runId: string, taskStore: TaskStore, signal?: AbortSignal): Promise<TaskRun> {
  const run = taskStore.getRun(runId);
  if (!run) {
    throw new Error('执行日志不存在');
  }

  const task = taskStore.getTask(run.taskId);
  if (!task) {
    throw new Error('任务不存在');
  }

  if (run.status === 'running' && run.startedAt) {
    return run;
  }

  taskStore.updateRun(runId, {
    status: 'running',
    startedAt: new Date().toISOString(),
    finishedAt: undefined,
  });
  taskStore.updateTask(run.taskId, {
    status: 'running',
    currentRunId: runId,
    latestRunId: runId,
    startedAt: new Date().toISOString(),
    finishedAt: undefined,
  });
  taskStore.appendLog(runId, 'info', '任务开始：读取输入数据并缓存图片。');

  const aiUsageStats = createAiUsageStats(taskStore.getSettings().aiModel || defaultSettings.aiModel);

  try {
    throwIfAborted(signal);
    const settings = taskStore.getSettings();
    if ((run.inputSource ?? 'excel') === 'feishuBitable' && !run.feishuInputItem) {
      assertFeishuCredentials(settings.feishuAppId, settings.feishuAppSecret);
      assertFeishuBitableConfig('输入', run.inputBitable);
      assertFeishuBitableConfig('输出', run.outputBitable);
      taskStore.appendLog(runId, 'info', '开始从飞书多维表格读取选品数据。');
      const feishuClient = new FeishuBitableClient({
        appId: settings.feishuAppId,
        appSecret: settings.feishuAppSecret,
      });
      const exportResult = run.feishuInputRecordId
        ? await feishuClient.exportSelectionRecordToExcel({
            bitable: run.inputBitable,
            outputExcelPath: run.inputExcelPath,
            recordId: run.feishuInputRecordId,
          })
        : await feishuClient.exportSelectionTableToExcel({
            bitable: run.inputBitable,
            outputExcelPath: run.inputExcelPath,
          });
      taskStore.appendLog(
        runId,
        'info',
        run.feishuInputRecordId
          ? `飞书输入表单行读取完成：${exportResult.recordCount} 条记录，已生成临时 Excel。`
          : `飞书输入表读取完成：${exportResult.recordCount} 条记录，已生成临时 Excel。`,
      );
    }
    const searchAdapterMode = settings.searchAdapterMode ?? run.searchAdapterMode ?? defaultSettings.searchAdapterMode;
    const headless = (settings.taskBrowserMode ?? defaultSettings.taskBrowserMode) === 'headless';
    const lowDisturbance = !headless;
    const excelRowConcurrency = Math.max(1, Number(settings.excelRowConcurrency) || defaultSettings.excelRowConcurrency);
    const detailPageConcurrency = Math.max(1, Number(settings.detailPageConcurrency) || defaultSettings.detailPageConcurrency);
    const aiRequestConcurrency = Math.max(1, Number(settings.aiRequestConcurrency) || defaultSettings.aiRequestConcurrency);
    const aiListBatchSize = Math.max(1, Number(settings.aiListBatchSize) || defaultSettings.aiListBatchSize);
    const retryCount = Math.max(0, Number(settings.retryCount) || 0);
    const enable1688RealFactoryFilter = typeof settings.enable1688RealFactoryFilter === 'boolean'
      ? settings.enable1688RealFactoryFilter
      : defaultSettings.enable1688RealFactoryFilter;
    const enable1688StrengthFactoryFilter = typeof settings.enable1688StrengthFactoryFilter === 'boolean'
      ? settings.enable1688StrengthFactoryFilter
      : defaultSettings.enable1688StrengthFactoryFilter;
    const enable1688AnnualSalesFilter = typeof settings.enable1688AnnualSalesFilter === 'boolean'
      ? settings.enable1688AnnualSalesFilter
      : defaultSettings.enable1688AnnualSalesFilter;
    const min1688AnnualSales = Math.max(0, Number(settings.min1688AnnualSales) || defaultSettings.min1688AnnualSales);
    const enable1688MonthlySalesFilter = typeof settings.enable1688MonthlySalesFilter === 'boolean'
      ? settings.enable1688MonthlySalesFilter
      : defaultSettings.enable1688MonthlySalesFilter;
    const min1688MonthlySales = Math.max(0, Number(settings.min1688MonthlySales) || defaultSettings.min1688MonthlySales);
    const enable1688SalesReference = typeof settings.enable1688SalesReference === 'boolean'
      ? settings.enable1688SalesReference
      : defaultSettings.enable1688SalesReference;
    const min1688SalesVolume = Math.max(0, Number(settings.min1688SalesVolume) || defaultSettings.min1688SalesVolume);
    const missing1688SalesAction = settings.missing1688SalesAction ?? defaultSettings.missing1688SalesAction;
    const sourcingMode = run.sourcingMode ?? settings.sourcingMode ?? defaultSettings.sourcingMode;
    const chromeMode = settings.chromeMode ?? defaultSettings.chromeMode;
    const chromeCdpUrl = settings.chromeCdpUrl || defaultSettings.chromeCdpUrl;
    const acceptedCandidateLimit = Math.min(
      sourcingMode === 'fast' ? 3 : 10,
      Math.max(1, Number(run.acceptedCandidateLimit) || defaultSettings.acceptedCandidateLimit),
    );
    const searchAdapter =
      searchAdapterMode === 'real1688'
        ? createReal1688ImageSearchAdapter({
            chromeMode,
            chromeCdpUrl,
            chromeExecutablePath: settings.chromeExecutablePath,
            chromeUserDataDir: settings.chromeUserDataDir,
            imageSearchUrl: settings.imageSearchUrl,
            pageTimeoutMs: settings.pageTimeoutMs,
            headless,
            lowDisturbance,
          })
        : createMockImageSearchAdapter();

    taskStore.appendLog(
      runId,
      'info',
      searchAdapterMode === 'real1688'
        ? `搜图适配器：真实 1688 / Chrome（${chromeMode === 'connect' ? '连接现有调试端口' : headless ? '无头后台' : '有头低打扰'}模式）。${chromeMode === 'connect' ? `连接 ${chromeCdpUrl} 中已登录的项目浏览器。` : headless ? '若已打开可见登录浏览器，会先关闭应用独立 Chrome 再无头复用登录态。' : '会尝试最小化/屏幕外启动，降低新窗口打扰。'}`
        : '搜图适配器：Mock 测试模式。',
    );
    aiUsageStats.model = settings.aiModel;
    const imageSimilarityService = createImageSimilarityService({
      baseUrl: settings.aiBaseUrl,
      apiKey: settings.aiApiKey,
      model: settings.aiModel,
      threshold: settings.aiSimilarityThreshold,
      limiter: createAsyncLimiter(aiRequestConcurrency),
      usage: aiUsageStats,
    });
    const detailAdapter =
      searchAdapterMode === 'real1688'
        ? createReal1688DetailPageAdapter({
            chromeMode,
            chromeCdpUrl,
            chromeExecutablePath: settings.chromeExecutablePath,
            chromeUserDataDir: settings.chromeUserDataDir,
            pageTimeoutMs: settings.pageTimeoutMs,
            headless,
            lowDisturbance,
            ai: {
              baseUrl: settings.aiBaseUrl,
              apiKey: settings.aiApiKey,
              model: settings.aiModel,
              threshold: settings.aiSimilarityThreshold,
              usage: aiUsageStats,
            },
          })
        : createMockDetailPageAdapter();

    const commonProcessInput = {
      taskId: run.taskId,
      assetDir: run.assetDir,
      candidateLimit: run.candidateLimit,
      acceptedCandidateLimit,
      sourcingMode,
      detailPageConcurrency,
      aiListBatchSize,
      retryCount,
      enable1688RealFactoryFilter,
      enable1688StrengthFactoryFilter,
      enable1688AnnualSalesFilter,
      min1688AnnualSales,
      enable1688MonthlySalesFilter,
      min1688MonthlySales,
      enable1688SalesReference,
      min1688SalesVolume,
      missing1688SalesAction,
      searchAdapter,
      detailAdapter,
      imageSimilarityService,
      signal,
      appendLog: (level: 'info' | 'warn' | 'error', message: string) => taskStore.appendLog(runId, level, message),
    };
    const settingsRows = [
      { name: '执行模式', value: sourcingMode === 'fast' ? '快速模式' : '精准模式' },
      { name: '候选链接数', value: run.candidateLimit },
      { name: '采纳下钻条数', value: acceptedCandidateLimit },
      { name: 'Excel 行并发数', value: excelRowConcurrency },
      { name: '详情页并发数', value: detailPageConcurrency },
      { name: 'AI 请求并发数', value: aiRequestConcurrency },
      { name: 'AI 列表批量大小', value: aiListBatchSize },
      { name: '页面超时 ms', value: settings.pageTimeoutMs },
      { name: '失败重试次数', value: retryCount },
      { name: '1688真实工厂认证筛选', value: enable1688RealFactoryFilter ? '启用' : '关闭' },
      { name: '1688实力认证筛选', value: enable1688StrengthFactoryFilter ? '启用' : '关闭' },
      { name: '1688年销量筛选', value: enable1688AnnualSalesFilter ? `启用，最低 ${min1688AnnualSales}` : '关闭' },
      { name: '1688月代销筛选', value: enable1688MonthlySalesFilter ? `启用，最低 ${min1688MonthlySales}` : '关闭' },
      { name: '1688已售数量兜底', value: enable1688SalesReference ? `启用，最低 ${min1688SalesVolume}` : '关闭' },
      { name: '1688已售数量缺失处理', value: missing1688SalesAction },
      { name: '持续执行间隔秒', value: settings.realtimePollIntervalSeconds },
      { name: '搜图适配器', value: searchAdapterMode },
      { name: '任务浏览器模式', value: settings.taskBrowserMode ?? defaultSettings.taskBrowserMode },
    ];
    const defaultInputSite = settings.targetSite?.trim() || defaultSettings.targetSite;
    const result = (run.inputSource ?? 'excel') === 'feishuBitable' && run.feishuInputItem
      ? await processProductItems({
          ...commonProcessInput,
          items: [applyDefaultSiteForImageOnlyInput(run.feishuInputItem, defaultInputSite)],
        })
      : await processExcelTask({
          ...commonProcessInput,
          inputExcelPath: run.inputExcelPath,
          outputExcelPath: run.outputExcelPath,
          excelRowConcurrency,
          rowLimit: run.localRowLimit,
          statusFilter: run.localStatusFilter,
          syncResultToInputExcel: (run.inputSource ?? 'excel') === 'excel',
          settingsRows,
        });
    throwIfAborted(signal);

    await writeJsonFile(path.join(run.assetDir, 'logs', 'items.json'), result.items);
    throwIfAborted(signal);

    let feishuBatchId = '';
    let postComparisonFailed = false;
    if ((run.inputSource ?? 'excel') === 'feishuBitable' && run.outputBitable) {
      taskStore.appendLog(runId, 'info', '开始写入飞书输出货源表。');
      const feishuClient = new FeishuBitableClient({
        appId: settings.feishuAppId,
        appSecret: settings.feishuAppSecret,
      });
      const batchId = createComparisonBatchId();
      feishuBatchId = batchId;
      const writeResult = await feishuClient.writeOutputRows({
        bitable: run.outputBitable,
        items: result.items,
        batchId,
        candidateOutputLimit: run.acceptedCandidateLimit,
        inputRecordId: run.feishuInputRecordId,
      });
      taskStore.appendLog(
        runId,
        'info',
        `飞书输出表写入完成：${writeResult.recordCount} 条记录，批次号 ${batchId}。${writeResult.skippedCount ? `跳过 ${writeResult.skippedCount} 条空字段记录。` : ''}`,
      );
      const shouldGenerateReviewTable = settings.autoGenerateListingReviewTable || settings.enableMiaoshouListingApi;
      if (shouldGenerateReviewTable) {
        try {
          const tableInput = getPriceComparisonTableInput(settings, run);
          const reviewResult = await feishuClient.confirmLatestPriceBatchAndGenerateReviewTable({
            ...tableInput,
            batchId,
            weightToleranceGram: settings.weightGroupToleranceGram,
          });
          feishuBatchId = reviewResult.batchId;
          taskStore.updateRun(runId, { feishuReviewBatchId: reviewResult.batchId });
          taskStore.appendLog(
            runId,
            'info',
            `表三已由本次比价批次自动生成：批次号 ${reviewResult.batchId}，已核实表二 ${reviewResult.verifiedOutputCount} 条，表三成功 ${reviewResult.generatedCount} 条，失败 ${reviewResult.failedCount} 条。`,
          );

          if (settings.enableMiaoshouListingApi && result.successCount > 0) {
            taskStore.appendLog(runId, 'info', '已启用妙手自动上架：继续从表三进入采集、认领和浏览器保存发布，当前版本每次只推进 1 条。');
            const listingResult = await runAutomaticMiaoshouListingFlow({
              settings,
              run: {
                ...run,
                feishuReviewBatchId: reviewResult.batchId,
              },
              batchId: reviewResult.batchId,
              appendLog: (level, message) => taskStore.appendLog(runId, level, message),
            });
            taskStore.updateRun(runId, {
              feishuReviewBatchId: listingResult.reviewBatchId,
              feishuListingAutoRun: true,
            });
            if (listingResult.listingFailedCount > 0 || listingResult.browserFailedCount > 0) {
              postComparisonFailed = true;
            }
            taskStore.appendLog(
              runId,
              listingResult.listingFailedCount > 0 || listingResult.browserFailedCount > 0 ? 'warn' : 'info',
              `妙手自动上架完成：表三确认 ${listingResult.approvedReviewCount} 条，采集认领推进 ${listingResult.listingUpdatedCount} 条，采集认领失败 ${listingResult.listingFailedCount} 条，浏览器发布 ${listingResult.browserExecutedCount} 条，浏览器失败 ${listingResult.browserFailedCount} 条。`,
            );
          }
        } catch (error) {
          postComparisonFailed = true;
          taskStore.appendLog(
            runId,
            settings.enableMiaoshouListingApi ? 'error' : 'warn',
            `比价后续流程失败：${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }
    if ((run.inputSource ?? 'excel') === 'feishuBitable' && run.inputBitable && run.feishuInputRecordId) {
      const feishuClient = new FeishuBitableClient({
        appId: settings.feishuAppId,
        appSecret: settings.feishuAppSecret,
      });
      const firstItem = result.items[0];
      if (result.successCount > 0 && firstItem?.status === 'success') {
        await feishuClient.markInputRecordEnteredComparison(run.inputBitable, run.feishuInputRecordId, feishuBatchId);
        taskStore.appendLog(runId, 'info', '飞书输入表状态已更新为：已进入比价');
      } else {
        await feishuClient.markInputRecordFailed(
          run.inputBitable,
          run.feishuInputRecordId,
          firstItem?.errorMessage || '比价未成功生成可用候选',
        );
        taskStore.appendLog(runId, 'warn', '飞书输入表状态已更新为：失败');
      }
    } else if ((run.inputSource ?? 'excel') === 'feishuBitable' && run.inputBitable) {
      const feishuClient = new FeishuBitableClient({
        appId: settings.feishuAppId,
        appSecret: settings.feishuAppSecret,
      });
      const syncResult = await feishuClient.syncInputStatusesByItems(run.inputBitable, result.items);
      taskStore.appendLog(runId, 'info', `飞书输入表状态同步完成：${syncResult.updatedCount} 条记录。`);
    }
    throwIfAborted(signal);

    const finalFailedCount = result.failedCount + (postComparisonFailed ? 1 : 0);
    const nextStatus = getTaskStatus(result.successCount, finalFailedCount);
    const updatedRun = taskStore.updateRun(runId, {
      status: nextStatus,
      totalCount: result.totalCount,
      successCount: result.successCount,
      failedCount: finalFailedCount,
      finishedAt: new Date().toISOString(),
    });
    taskStore.updateTask(run.taskId, {
      status: nextStatus,
      totalCount: result.totalCount,
      successCount: result.successCount,
      failedCount: finalFailedCount,
      currentRunId: undefined,
      latestRunId: runId,
      finishedAt: new Date().toISOString(),
    });

    taskStore.appendLog(
      runId,
      nextStatus === 'failed' ? 'error' : 'info',
      `任务完成：${result.successCount}/${result.totalCount} 行图片缓存成功，总耗时 ${formatDuration(Date.now() - Date.parse(updatedRun.startedAt ?? updatedRun.createdAt))}。`,
    );
    taskStore.appendLog(runId, 'info', formatAiUsageSummary(aiUsageStats));

    return updatedRun;
  } catch (error) {
    if (isAbortError(error)) {
      const latestRun = taskStore.getRun(runId);
      const updatedRun = taskStore.updateRun(runId, {
        status: 'cancelled',
        totalCount: latestRun?.totalCount ?? 0,
        successCount: latestRun?.successCount ?? 0,
        failedCount: latestRun?.failedCount ?? 0,
        finishedAt: new Date().toISOString(),
      });
      taskStore.updateTask(run.taskId, {
        status: 'cancelled',
        totalCount: updatedRun.totalCount,
        successCount: updatedRun.successCount,
        failedCount: updatedRun.failedCount,
        currentRunId: undefined,
        latestRunId: runId,
        finishedAt: updatedRun.finishedAt,
      });
      taskStore.appendLog(runId, 'warn', '任务已中断。已保留当前已落盘的输入、资产和日志。');
      taskStore.appendLog(runId, 'info', formatAiUsageSummary(aiUsageStats));
      return updatedRun;
    }

    const updatedRun = taskStore.updateRun(runId, {
      status: 'failed',
      finishedAt: new Date().toISOString(),
    });
    if ((run.inputSource ?? 'excel') === 'feishuBitable' && run.inputBitable && run.feishuInputRecordId) {
      try {
        const settings = taskStore.getSettings();
        const feishuClient = new FeishuBitableClient({
          appId: settings.feishuAppId,
          appSecret: settings.feishuAppSecret,
        });
        await feishuClient.markInputRecordFailed(
          run.inputBitable,
          run.feishuInputRecordId,
          error instanceof Error ? error.message : String(error),
        );
      } catch (statusError) {
        taskStore.appendLog(runId, 'warn', `飞书输入表状态更新失败：${statusError instanceof Error ? statusError.message : String(statusError)}`);
      }
    }
    taskStore.updateTask(run.taskId, {
      status: 'failed',
      currentRunId: undefined,
      latestRunId: runId,
      finishedAt: updatedRun.finishedAt,
    });
    taskStore.appendLog(runId, 'error', error instanceof Error ? error.message : String(error));
    taskStore.appendLog(runId, 'info', formatAiUsageSummary(aiUsageStats));
    return updatedRun;
  }
}

function createComparisonBatchId() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  const datePart = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    '_',
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('');
  const randomPart = Math.random().toString(36).slice(2, 6);
  return `cmp_${datePart}_${randomPart}`;
}

function normalizeBitableConfig(config?: Partial<FeishuBitableConfig>): FeishuBitableConfig {
  return {
    appToken: config?.appToken?.trim() ?? '',
    tableId: config?.tableId?.trim() ?? '',
    viewId: config?.viewId?.trim() ?? '',
  };
}

function getPriceComparisonTableInput(settings: AppSettings, run: TaskRun) {
  const inputBitable = normalizeBitableConfig(
    settings.priceInputBitable.tableId ? settings.priceInputBitable : run.inputBitable,
  );
  const outputBitable = normalizeBitableConfig(
    settings.priceOutputBitable.tableId ? settings.priceOutputBitable : run.outputBitable,
  );
  const reviewBitable = normalizeBitableConfig(settings.priceReviewBitable);
  const appToken =
    inputBitable.appToken ||
    outputBitable.appToken ||
    reviewBitable.appToken ||
    settings.lastFeishuOutputBitable.appToken;
  if (!appToken) {
    throw new Error('缺少飞书三表 app_token，无法自动生成表三');
  }

  return {
    appToken,
    inputBitable: { ...inputBitable, appToken: inputBitable.appToken || appToken },
    outputBitable: { ...outputBitable, appToken: outputBitable.appToken || appToken },
    reviewBitable: { ...reviewBitable, appToken: reviewBitable.appToken || appToken },
  };
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException('任务已中断', 'AbortError');
  }
}

function applyDefaultSiteForImageOnlyInput<T extends { country?: string; zhengheDataUrl?: string; sourceUrl?: string; sourceImageUrl?: string; imageUrl?: string }>(
  item: T,
  defaultSite: string,
) {
  if (item.country?.trim() || item.zhengheDataUrl?.trim() || item.sourceUrl?.trim() || !defaultSite.trim()) {
    return item;
  }

  if (!item.sourceImageUrl?.trim() && !item.imageUrl?.trim()) {
    return item;
  }

  return {
    ...item,
    country: defaultSite.trim().toUpperCase(),
  };
}

function formatDuration(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`;
}

function formatAiUsageSummary(stats: AiUsageStats) {
  const requestCount = stats.singleImageCalls + stats.batchImageCalls + stats.attributeCalls;
  const tokenText = stats.totalTokens > 0
    ? `，tokens：输入 ${stats.promptTokens} / 输出 ${stats.completionTokens} / 合计 ${stats.totalTokens}`
    : '，tokens：接口未返回用量';
  const providerText = stats.provider === 'mock' ? 'Mock（不产生 AI 接口费用）' : 'OpenAI兼容接口';

  return [
    `AI费用统计：供应商 ${providerText}`,
    `模型 ${stats.model || '未配置'}`,
    `请求 ${requestCount} 次（列表/SKU批量 ${stats.batchImageCalls}，单图 ${stats.singleImageCalls}，文本抽取 ${stats.attributeCalls}）`,
    `图片计数 ${stats.imageCount} 张${tokenText}`,
    '实际金额请按你的 AI 中转站/模型单价换算。',
  ].join('；');
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}
