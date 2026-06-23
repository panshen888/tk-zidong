import { loadMiaoshouSmokeContext } from './miaoshou-smoke-helpers';

async function main() {
  const { settings, task, appToken, feishuClient, miaoshouClient } = await loadMiaoshouSmokeContext();

  const result = await feishuClient.checkMiaoshouPublishReadiness({
    taskId: task.id,
    appToken,
    site: settings.targetSite,
    shopId: settings.targetShopId,
    checkRemote: async ({ shopId }) => {
      const [collectBoxItems, warehouses] = await Promise.all([
        miaoshouClient.searchTiktokCollectBox({ pageSize: 20 }),
        miaoshouClient.getShopWarehouses([shopId]),
      ]);
      const warehouseList = warehouses.shopWarehouseList ?? [];
      return {
        collectBoxCount: collectBoxItems.length,
        warehouseCount: warehouseList.length,
        categoryMetadataLoaded: false,
        missing: [
          ...(collectBoxItems.length === 0 ? ['TikTok collect box pending products'] : []),
          ...(warehouseList.length === 0 ? ['shop warehouse'] : []),
        ],
      };
    },
  });

  console.log(JSON.stringify({
    collectBoxCount: result.collectBoxCount,
    warehouseCount: result.warehouseCount,
    missing: result.missing,
    scannedCount: result.scannedCount,
    readyCount: result.readyCount,
    alreadySubmittedCount: result.alreadySubmittedCount,
    failedCount: result.failedCount,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
