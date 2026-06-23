import { getSmokeLimit, loadMiaoshouSmokeContext } from './miaoshou-smoke-helpers';

async function main() {
  const { task, appToken, feishuClient, miaoshouClient } = await loadMiaoshouSmokeContext();

  const result = await feishuClient.verifyMiaoshouPublishResults({
    taskId: task.id,
    appToken,
    targetShopId: '',
    targetSite: '',
    limit: getSmokeLimit(5),
    searchTiktokCollectBox: async (input) => miaoshouClient.searchTiktokCollectBox(input),
  });

  console.log(JSON.stringify({
    scannedCount: result.scannedCount,
    verifiedCount: result.verifiedCount,
    publishedCount: result.publishedCount,
    pendingCount: result.pendingCount,
    notFoundCount: result.notFoundCount,
    failedCount: result.failedCount,
    listingEditTableId: result.listingEditBitable.tableId,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
