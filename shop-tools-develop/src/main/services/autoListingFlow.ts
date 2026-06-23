import os from 'node:os';
import path from 'node:path';
import type { AppSettings, FeishuBitableConfig, ListingShopMapping, TaskRun } from '../../shared/types';
import { FeishuBitableClient } from './feishuBitableService';
import {
  parseMiaoshouPricingTemplatesJson,
  publishMiaoshouListingRowByBrowser,
  resolvePricingTemplateForSite,
} from './miaoshouBrowserListingService';
import { assertMiaoshouCredentials, MiaoshouOpenApiClient } from './miaoshouOpenApiService';

export type AutoListingFlowResult = {
  reviewBatchId: string;
  approvedReviewCount: number;
  listingScannedCount: number;
  listingUpdatedCount: number;
  listingFailedCount: number;
  browserExecutedCount: number;
  browserFailedCount: number;
};

export async function runAutomaticMiaoshouListingFlow(input: {
  settings: AppSettings;
  run: TaskRun;
  batchId: string;
  appendLog?: (level: 'info' | 'warn' | 'error', message: string) => void;
}): Promise<AutoListingFlowResult> {
  const { settings, run } = input;
  const batchId = input.batchId.trim();
  if (!batchId) {
    throw new Error('缺少比价批次号，无法自动进入妙手上架');
  }
  if ((run.inputSource ?? 'excel') !== 'feishuBitable') {
    throw new Error('自动妙手上架只支持飞书三表任务');
  }
  assertMiaoshouCredentials({
    appKey: settings.miaoshouOpenApiAppKey,
    appSecret: settings.miaoshouOpenApiAppSecret,
  });

  const feishuClient = new FeishuBitableClient({
    appId: settings.feishuAppId,
    appSecret: settings.feishuAppSecret,
  });
  const tableInput = getPriceComparisonTableInput(settings, run);
  const approved = await feishuClient.approveLatestReviewBatch({
    ...tableInput,
    batchId,
    weightToleranceGram: settings.weightGroupToleranceGram,
  });
  input.appendLog?.('info', `自动妙手上架：表三批次 ${batchId} 已确认 ${approved.approvedReviewCount} 条。`);
  if (approved.approvedReviewCount <= 0) {
    return {
      reviewBatchId: batchId,
      approvedReviewCount: 0,
      listingScannedCount: 0,
      listingUpdatedCount: 0,
      listingFailedCount: 0,
      browserExecutedCount: 0,
      browserFailedCount: 0,
    };
  }

  const miaoshouClient = new MiaoshouOpenApiClient({
    baseUrl: settings.miaoshouOpenApiBaseUrl,
    appKey: settings.miaoshouOpenApiAppKey,
    appSecret: settings.miaoshouOpenApiAppSecret,
    accountId: settings.miaoshouOpenApiAccountId,
  });
  const listingEditResult = await feishuClient.generateMiaoshouListingEditTable({
    appToken: getCommerceAppToken(settings, run),
    taskId: run.taskId,
    batchId,
    limit: 1,
    priceReviewBitable: tableInput.reviewBitable,
    targetShopId: settings.targetShopId,
    targetShopName: settings.targetShopName,
    targetSite: settings.targetSite,
    shopMappings: parseListingShopMappings(settings.listingShopMappings),
    importLinks: async (links) => {
      const data = await miaoshouClient.importSourceLinks(links);
      return data.sourceItemIdAndDetailIdMap ?? {};
    },
    getCommonCollectBoxDetail: async (detailId) => miaoshouClient.getCommonCollectBoxDetail(detailId),
    claimToPlatform: async (detailIds, platform) => {
      const data = await miaoshouClient.claimCommonCollectBoxToPlatform(detailIds, platform);
      return data.platformCollectBoxDetailIdMap?.[platform] ?? {};
    },
    searchTiktokCollectBox: async (searchInput) => miaoshouClient.searchTiktokCollectBox(searchInput),
    claimToShop: async (claimInput) => miaoshouClient.claimTiktokCollectBoxToShop(claimInput),
    getShopCollectItemInfo: async (detailInput) => miaoshouClient.getShopCollectItemInfo(detailInput),
    getSiteCollectItemInfo: async (detailInput) => miaoshouClient.getSiteCollectItemInfo(detailInput),
  });
  input.appendLog?.(
    'info',
    `自动妙手上架：采集认领扫描 ${listingEditResult.scannedCount} 条，推进 ${listingEditResult.updatedCount} 条，失败 ${listingEditResult.failedCount} 条。`,
  );

  const listingResultTable = await feishuClient.ensureListingResultTable(getListingResultTableInput(settings));
  const templates = parseMiaoshouPricingTemplatesJson(settings.miaoshouPricingTemplatesJson);
  const screenshotDir = path.join(
    settings.defaultOutputDir || path.join(os.homedir(), 'Documents', 'TikTok AI Flow', 'outputs'),
    'miaoshou-browser-screenshots',
  );
  const browserResult = await feishuClient.publishMiaoshouListingProductsByBrowser({
    appToken: getCommerceAppToken(settings, run),
    taskId: run.taskId,
    batchId,
    limit: 1,
    listingResultBitable: listingResultTable.listingResultBitable,
    hasPricingTemplate: (row) => Boolean(resolvePricingTemplateForSite(
      templates,
      settings.miaoshouPricingTemplateMappings,
      row.targetShopSite || row.site,
    )),
    publishByBrowser: async (row) => publishMiaoshouListingRowByBrowser({
      settings,
      row: {
        recordId: row.recordId,
        key: row.key,
        productId: row.productId,
        site: row.targetShopSite || row.site,
        tiktokCollectBoxId: row.tiktokCollectBoxId,
        sourceItemId: row.collectSourceItemId || row.offerId || row.productId,
        sourcePrice: Number(row.unifiedSourcePrice),
        weightGram: Number(row.weightGram),
        lengthCm: Number(row.lengthCm) || 10,
        widthCm: Number(row.widthCm) || 10,
        heightCm: Number(row.heightCm) || 10,
        targetShopId: row.targetShopId,
        targetShopName: row.targetShopName,
      },
      template: resolvePricingTemplateForSite(templates, settings.miaoshouPricingTemplateMappings, row.targetShopSite || row.site),
      screenshotDir,
    }),
  });
  input.appendLog?.(
    browserResult.failedCount > 0 ? 'warn' : 'info',
    `自动妙手上架：浏览器保存并发布执行 ${browserResult.executedCount} 条，失败 ${browserResult.failedCount} 条。`,
  );

  return {
    reviewBatchId: batchId,
    approvedReviewCount: approved.approvedReviewCount,
    listingScannedCount: listingEditResult.scannedCount,
    listingUpdatedCount: listingEditResult.updatedCount,
    listingFailedCount: listingEditResult.failedCount,
    browserExecutedCount: browserResult.executedCount,
    browserFailedCount: browserResult.failedCount,
  };
}

function normalizeBitableConfig(config?: Partial<FeishuBitableConfig>): FeishuBitableConfig {
  return {
    appToken: config?.appToken?.trim() ?? '',
    tableId: config?.tableId?.trim() ?? '',
    viewId: config?.viewId?.trim() ?? '',
  };
}

function getPriceComparisonTableInput(settings: AppSettings, run: TaskRun) {
  const inputBitable = normalizeBitableConfig(settings.priceInputBitable.tableId ? settings.priceInputBitable : run.inputBitable);
  const outputBitable = normalizeBitableConfig(settings.priceOutputBitable.tableId ? settings.priceOutputBitable : run.outputBitable);
  const reviewBitable = normalizeBitableConfig(settings.priceReviewBitable);
  const appToken =
    inputBitable.appToken ||
    outputBitable.appToken ||
    reviewBitable.appToken ||
    settings.lastFeishuOutputBitable.appToken;
  if (!appToken) {
    throw new Error('缺少飞书三表 app_token，无法生成表三');
  }
  return {
    appToken,
    inputBitable: { ...inputBitable, appToken: inputBitable.appToken || appToken },
    outputBitable: { ...outputBitable, appToken: outputBitable.appToken || appToken },
    reviewBitable: { ...reviewBitable, appToken: reviewBitable.appToken || appToken },
  };
}

function getCommerceAppToken(settings: AppSettings, run: TaskRun) {
  return (
    settings.priceReviewBitable.appToken ||
    settings.priceOutputBitable.appToken ||
    settings.priceInputBitable.appToken ||
    run.outputBitable?.appToken ||
    run.inputBitable?.appToken ||
    settings.lastFeishuOutputBitable.appToken
  );
}

function getListingResultTableInput(settings: AppSettings) {
  const listingResultBitable = normalizeBitableConfig(settings.listingResultBitable);
  const appToken =
    listingResultBitable.appToken ||
    settings.priceReviewBitable.appToken ||
    settings.priceOutputBitable.appToken ||
    settings.priceInputBitable.appToken ||
    settings.lastFeishuOutputBitable.appToken ||
    settings.lastFeishuInputBitable.appToken;
  if (!appToken) {
    throw new Error('请先在 AI比价配置创建三表，或在 AI上架配置填写 AI上架结果表 app_token');
  }
  return {
    appToken,
    listingResultBitable: {
      ...listingResultBitable,
      appToken: listingResultBitable.appToken || appToken,
    },
  };
}

function parseListingShopMappings(value: unknown): ListingShopMapping[] {
  const lines = String(value ?? '')
    .split(/\r?\n|;/)
    .map((line) => line.trim())
    .filter(Boolean);
  const mappings: ListingShopMapping[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const normalizedLine = line.replace(/[，｜]/g, (match) => (match === '，' ? ',' : '|'));
    let site = '';
    let shopId = '';
    let shopName = '';
    if (normalizedLine.includes('=')) {
      const [left, right = ''] = normalizedLine.split(/=(.*)/s);
      site = left.trim();
      const [id = '', name = ''] = right.split('|');
      shopId = id.trim();
      shopName = name.trim();
    } else {
      const [left = '', id = '', name = ''] = normalizedLine.split(',');
      site = left.trim();
      shopId = id.trim();
      shopName = name.trim();
    }
    const normalizedSite = site.toUpperCase();
    if (!normalizedSite || !shopId || seen.has(normalizedSite)) {
      continue;
    }
    seen.add(normalizedSite);
    mappings.push({ site: normalizedSite, shopId, shopName });
  }
  return mappings;
}
