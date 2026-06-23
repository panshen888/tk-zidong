import { getSmokeLimit, loadMiaoshouSmokeContext } from './miaoshou-smoke-helpers';

async function main() {
  const { task, appToken, feishuClient } = await loadMiaoshouSmokeContext();

  const result = await feishuClient.prepareMiaoshouListingDraftRetry({
    taskId: task.id,
    appToken,
    targetShopId: '',
    targetShopName: '',
    targetSite: '',
    limit: getSmokeLimit(5),
  });

  console.log(JSON.stringify({
    scannedCount: result.scannedCount,
    preparedCount: result.preparedCount,
    skippedCount: result.skippedCount,
    failedCount: result.failedCount,
    listingEditTableId: result.listingEditBitable.tableId,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
