import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { MiaoshouOpenApiClient } from '../src/main/services/miaoshouOpenApiService';
import type { AppSettings } from '../src/shared/types';

type StoreShape = {
  settings: AppSettings;
};

function pick(value: unknown) {
  if (!value || typeof value !== 'object') {
    return value;
  }
  const record = value as Record<string, unknown>;
  return {
    collectBoxDetailId: record.collectBoxDetailId,
    detailId: record.detailId,
    itemNum: record.itemNum,
    title: record.title,
    status: record.status,
    editModel: record.editModel,
    commonCollectBoxDetailId: record.commonCollectBoxDetailId,
    claimToShopIds: record.claimToShopIds,
    collectBoxDetailShopList: record.collectBoxDetailShopList,
  };
}

function findNestedValue(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (key in record) {
    return record[key];
  }
  for (const nested of Object.values(record)) {
    const found = findNestedValue(nested, key);
    if (found != null) {
      return found;
    }
  }
  return undefined;
}

function summarizeDetail(value: unknown) {
  if (value && typeof value === 'object' && 'error' in value) {
    return value;
  }
  return {
    editModel: findNestedValue(value, 'editModel'),
    ossMd5: Boolean(findNestedValue(value, 'ossMd5')),
    cid: findNestedValue(value, 'cid'),
    title: findNestedValue(value, 'title'),
    skuMapKeys: Object.keys((findNestedValue(value, 'skuMap') as Record<string, unknown> | undefined) ?? {}),
    shopCollectItemInfoCid: findNestedValue(findNestedValue(value, 'shopCollectItemInfo'), 'cid'),
    siteCollectItemInfoCid: findNestedValue(findNestedValue(value, 'siteCollectItemInfo'), 'cid'),
  };
}

async function main() {
  const detailId = process.argv[2];
  if (!detailId) {
    throw new Error('用法：node dist/tools/inspect-miaoshou-collect-detail.mjs <tiktokCollectBoxDetailId>');
  }
  const configPath = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'tiktok-ai-flow', 'config.json');
  const store = JSON.parse(await fs.readFile(configPath, 'utf8')) as StoreShape;
  const settings = store.settings;
  const miaoshouClient = new MiaoshouOpenApiClient({
    baseUrl: settings.miaoshouOpenApiBaseUrl,
    appKey: settings.miaoshouOpenApiAppKey,
    appSecret: settings.miaoshouOpenApiAppSecret,
    accountId: settings.miaoshouOpenApiAccountId,
  });

  const list = await miaoshouClient.searchTiktokCollectBox({
    sourceItemIdKeyword: detailId,
    pageSize: 20,
  });
  const shopDetail = await miaoshouClient.getShopCollectItemInfo({
    detailId,
    shopId: settings.targetShopId,
  }).catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));
  const siteDetail = await miaoshouClient.getSiteCollectItemInfo({
    detailId,
    site: settings.targetSite,
  }).catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));

  console.log(JSON.stringify({
    targetShopId: settings.targetShopId,
    targetSite: settings.targetSite,
    listCount: list.length,
    list: list.map(pick),
    shopDetail: summarizeDetail(shopDetail),
    siteDetail: summarizeDetail(siteDetail),
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
