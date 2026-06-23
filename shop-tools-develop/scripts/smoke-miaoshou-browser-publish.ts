import os from 'node:os';
import path from 'node:path';
import { getSmokeLimit, loadMiaoshouSmokeContext } from './miaoshou-smoke-helpers';
import {
  parseMiaoshouPricingTemplatesJson,
  publishMiaoshouListingRowByBrowser,
  resolvePricingTemplateForSite,
} from '../src/main/services/miaoshouBrowserListingService';

async function main() {
  const { settings, task, appToken, feishuClient } = await loadMiaoshouSmokeContext();
  const templates = parseMiaoshouPricingTemplatesJson(settings.miaoshouPricingTemplatesJson);
  const screenshotDir = path.join(
    settings.defaultOutputDir || path.join(os.homedir(), 'Documents', 'TikTok AI Flow', 'outputs'),
    'miaoshou-browser-screenshots',
  );

  const result = await feishuClient.publishMiaoshouListingProductsByBrowser({
    taskId: task.id,
    appToken,
    listingResultBitable: settings.listingResultBitable,
    limit: getSmokeLimit(1),
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
      template: resolvePricingTemplateForSite(
        templates,
        settings.miaoshouPricingTemplateMappings,
        row.targetShopSite || row.site,
      ),
      screenshotDir,
    }),
  });

  console.log(JSON.stringify({
    scannedCount: result.scannedCount,
    executedCount: result.executedCount,
    skippedCount: result.skippedCount,
    failedCount: result.failedCount,
    listingEditTableId: result.listingEditBitable.tableId,
    listingResultTableId: result.listingResultBitable.tableId,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
