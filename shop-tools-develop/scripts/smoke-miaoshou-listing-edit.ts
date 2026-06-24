import { getSmokeLimit, loadMiaoshouSmokeContext, parseListingShopMappings } from './miaoshou-smoke-helpers';

async function main() {
  const { settings, task, appToken, feishuClient, miaoshouClient } = await loadMiaoshouSmokeContext();

  console.log(JSON.stringify({
    taskId: task.id,
    targetSite: settings.targetSite,
    targetShopName: settings.targetShopName,
    targetShopId: settings.targetShopId,
    listingShopMappings: settings.listingShopMappings,
    priceReviewTableId: settings.priceReviewBitable.tableId,
  }, null, 2));

  const result = await feishuClient.generateMiaoshouListingEditTable({
    taskId: task.id,
    appToken,
    priceReviewBitable: settings.priceReviewBitable,
    targetShopId: settings.targetShopId,
    targetShopName: settings.targetShopName,
    targetSite: settings.targetSite,
    categoryTreeCacheJson: settings.miaoshouCategoryTreeCacheJson,
    sizeChartImageUrl: settings.miaoshouSizeChartImageUrl,
    requiredAttributeDefaults: settings.miaoshouRequiredAttributeDefaults,
    shopMappings: parseListingShopMappings(settings.listingShopMappings),
    limit: getSmokeLimit(1),
    importLinks: async (links) => {
      const data = await miaoshouClient.importSourceLinks(links);
      return data.sourceItemIdAndDetailIdMap ?? {};
    },
    getCommonCollectBoxDetail: async (detailId) => miaoshouClient.getCommonCollectBoxDetail(detailId),
    claimToPlatform: async (detailIds, platform) => {
      const data = await miaoshouClient.claimCommonCollectBoxToPlatform(detailIds, platform);
      return data.platformCollectBoxDetailIdMap?.[platform] ?? {};
    },
    searchTiktokCollectBox: async (input) => miaoshouClient.searchTiktokCollectBox(input),
    claimToShop: async (input) => miaoshouClient.claimTiktokCollectBoxToShop(input),
    getShopCollectItemInfo: async (input) => miaoshouClient.getShopCollectItemInfo(input),
    getSiteCollectItemInfo: async (input) => miaoshouClient.getSiteCollectItemInfo(input),
    getCategoryTreeBySite: async (site) => miaoshouClient.getCategoryTreeBySite(site),
    getCategoryMetadata: async (input) => miaoshouClient.getCategoryMetadata(input),
    saveShopCollectItemInfo: async (input) => miaoshouClient.saveShopCollectItemInfo(input),
  });

  console.log(JSON.stringify({
    scannedCount: result.scannedCount,
    createdCount: result.createdCount,
    updatedCount: result.updatedCount,
    skippedCount: result.skippedCount,
    failedCount: result.failedCount,
    listingEditTableId: result.listingEditBitable.tableId,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
