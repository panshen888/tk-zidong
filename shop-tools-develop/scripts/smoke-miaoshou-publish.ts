import { getSmokeLimit, loadMiaoshouSmokeContext } from './miaoshou-smoke-helpers';

async function main() {
  const { task, appToken, feishuClient, miaoshouClient } = await loadMiaoshouSmokeContext();

  const result = await feishuClient.publishMiaoshouListingProducts({
    taskId: task.id,
    appToken,
    targetShopId: '',
    targetShopName: '',
    targetSite: '',
    limit: getSmokeLimit(1),
    confirmPublish: true,
    publishProducts: async (input) => miaoshouClient.publishCollectTask(input),
  });

  console.log(JSON.stringify({
    scannedCount: result.scannedCount,
    publishedCount: result.publishedCount,
    skippedCount: result.skippedCount,
    failedCount: result.failedCount,
    listingEditTableId: result.listingEditBitable.tableId,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
