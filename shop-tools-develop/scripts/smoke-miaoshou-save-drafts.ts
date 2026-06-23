import { getSmokeLimit, loadMiaoshouSmokeContext } from './miaoshou-smoke-helpers';

async function main() {
  const { task, appToken, feishuClient, miaoshouClient } = await loadMiaoshouSmokeContext();

  const result = await feishuClient.saveMiaoshouListingDrafts({
    taskId: task.id,
    appToken,
    targetShopId: '',
    targetShopName: '',
    targetSite: '',
    limit: getSmokeLimit(1),
    getShopCollectItemInfo: async (input) => miaoshouClient.getShopCollectItemInfo(input),
    getSiteCollectItemInfo: async (input) => miaoshouClient.getSiteCollectItemInfo(input),
    saveShopCollectItemInfo: async (input) => miaoshouClient.saveShopCollectItemInfo(input),
    saveSiteCollectItemInfo: async (input) => miaoshouClient.saveSiteCollectItemInfo(input),
  });

  console.log(JSON.stringify({
    scannedCount: result.scannedCount,
    savedCount: result.savedCount,
    skippedCount: result.skippedCount,
    failedCount: result.failedCount,
    listingEditTableId: result.listingEditBitable.tableId,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
