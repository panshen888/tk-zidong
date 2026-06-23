import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { FeishuBitableClient } from '../src/main/services/feishuBitableService';
import { MiaoshouOpenApiClient } from '../src/main/services/miaoshouOpenApiService';
import type { AppSettings, ListingShopMapping, Task } from '../src/shared/types';

type StoreShape = {
  settings: AppSettings;
  tasks?: Task[];
};

export async function loadMiaoshouSmokeContext() {
  const configPath = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'tiktok-ai-flow', 'config.json');
  const store = JSON.parse(await fs.readFile(configPath, 'utf8')) as StoreShape;
  const settings = store.settings;
  const task = (store.tasks ?? []).find((item) => item.inputSource === 'feishuBitable');
  if (!task) {
    throw new Error('未找到飞书比价任务');
  }
  const appToken = task.outputBitable?.appToken || settings.priceReviewBitable.appToken || settings.priceInputBitable.appToken;
  if (!appToken) {
    throw new Error('飞书 appToken 为空');
  }

  return {
    settings,
    task,
    appToken,
    feishuClient: new FeishuBitableClient({
      appId: settings.feishuAppId,
      appSecret: settings.feishuAppSecret,
    }),
    miaoshouClient: new MiaoshouOpenApiClient({
      baseUrl: settings.miaoshouOpenApiBaseUrl,
      appKey: settings.miaoshouOpenApiAppKey,
      appSecret: settings.miaoshouOpenApiAppSecret,
      accountId: settings.miaoshouOpenApiAccountId,
    }),
  };
}

export function parseListingShopMappings(value: unknown): ListingShopMapping[] {
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

export function getSmokeLimit(defaultLimit = 1) {
  const value = Number(process.env.SMOKE_LIMIT ?? defaultLimit);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : defaultLimit;
}
