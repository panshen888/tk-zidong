import crypto from 'node:crypto';
import type { ListingProductRecord } from './feishuBitableService';
import type { MiaoshouCategoryNode, MiaoshouShop } from '../../shared/types';

export type MiaoshouOpenApiClientOptions = {
  baseUrl: string;
  appKey: string;
  appSecret: string;
  accountId?: string;
};

export type MiaoshouCreateCommonCollectBoxInput = {
  row: ListingProductRecord;
  stock: number;
};

export type MiaoshouCreateCommonCollectBoxResult = {
  raw: unknown;
  draftId?: string;
};

type MiaoshouApiResponse<T> = {
  result?: 'success' | 'fail';
  code?: string;
  message?: string;
  data?: T;
};

const defaultBaseUrl = 'https://openapi-erp.91miaoshou.com';
const queryShopListPath = '/open/v1/product/shop/shop/get_shop_list';
const fetchSourceItemPath = '/open/v1/product/common_collect_box/common_collect_box/fetch_item';
const createCommonCollectBoxPath = '/open/v1/product/common_collect_box/common_collect_box/add_common_collect_box_detail';
const getCommonCollectBoxDetailPath = '/open/v1/product/common_collect_box/common_collect_box/get_common_collect_box_detail';
const claimCommonToPlatformPath = '/open/v1/product/common_collect_box/common_collect_box/claimed';
const searchTiktokCollectBoxPath = '/open/v1/product/collect_box/tiktok/collect_box/search_collect_box_detail_list';
const claimTiktokCollectBoxToShopPath = '/open/v1/product/collect_box/tiktok/collect_box/claim_to_shop';
const getShopCollectItemInfoPath = '/open/v1/product/collect_box/tiktok/collect_box/get_shop_collect_item_info';
const saveShopCollectItemInfoPath = '/open/v1/product/collect_box/tiktok/collect_box/save_shop_collect_item_info';
const getSiteCollectItemInfoPath = '/open/v1/product/collect_box/tiktok/collect_box/get_site_collect_item_info';
const saveSiteCollectItemInfoPath = '/open/v1/product/collect_box/tiktok/collect_box/save_site_collect_item_info';
const publishCollectTaskPath = '/open/v1/product/collect_box/tiktok/collect_box/save_move_collect_task';
const getCategoryTreePath = '/open/v1/product/collect_box/tiktok/collect_box/get_category_tree_by_site';
const getCategoryMetadataPath = '/open/v1/product/collect_box/tiktok/collect_box/get_category_metadata';
const getShopWarehousePath = '/open/v1/product/collect_box/tiktok/collect_box/get_shop_warehouse_list';
const getResponsiblePersonPath = '/open/v1/product/collect_box/tiktok/collect_box/get_responsible_person_list';

export class MiaoshouOpenApiClient {
  private readonly baseUrl: string;

  constructor(private readonly options: MiaoshouOpenApiClientOptions) {
    this.baseUrl = (options.baseUrl || defaultBaseUrl).replace(/\/+$/, '');
  }

  async createCommonCollectBoxProduct(input: MiaoshouCreateCommonCollectBoxInput) {
    const body = this.buildCommonCollectBoxBody(input);
    const data = await this.request<unknown>(createCommonCollectBoxPath, body);
    return {
      raw: data,
      draftId: extractDraftId(data),
    } satisfies MiaoshouCreateCommonCollectBoxResult;
  }

  async queryShops(input: { platform?: string; site?: string }) {
    const data = await this.request<{ shopList?: MiaoshouShop[] }>(queryShopListPath, {
      platform: input.platform || 'tiktok',
      site: input.site || '',
      pageNo: 1,
      pageSize: 100,
    });
    return data.shopList ?? [];
  }

  async queryShopsBySites(sites: string[]) {
    const normalizedSites = uniqueStrings(sites.map((site) => site.trim().toUpperCase()));
    const shops: MiaoshouShop[] = [];
    for (const site of normalizedSites) {
      shops.push(...await this.queryShops({ platform: 'tiktok', site }));
    }
    return dedupeShops(shops);
  }

  async importSourceLinks(links: string[]) {
    return this.request<{ sourceItemIdAndDetailIdMap?: Record<string, string | number> }>(fetchSourceItemPath, {
      collectLinks: uniqueStrings(links),
    });
  }

  async getCommonCollectBoxDetail(detailId: string | number) {
    return this.request<unknown>(getCommonCollectBoxDetailPath, {
      commonCollectBoxDetailId: Number(detailId),
    });
  }

  async claimCommonCollectBoxToPlatform(detailIds: Array<string | number>, platform = 'tiktok') {
    return this.request<{ platformCollectBoxDetailIdMap?: Record<string, Record<string, string | number>> }>(claimCommonToPlatformPath, {
      detailSerialNumberPlatformList: detailIds.map((detailId) => ({
        detailId: Number(detailId),
        platform,
        serialNumber: 1,
      })),
    });
  }

  async searchTiktokCollectBox(input: { pageNo?: number; pageSize?: number; sourceItemIdKeyword?: string; status?: string } = {}) {
    const data = await this.request<unknown>(searchTiktokCollectBoxPath, {
      pageNo: input.pageNo ?? 1,
      pageSize: input.pageSize ?? 20,
      filter: {
        status: input.status ?? 'notPublished',
        sourceItemIdKeyword: input.sourceItemIdKeyword ?? '',
      },
    });
    return extractArrayByKeys(data, ['data', 'detailList', 'list', 'items']);
  }

  async claimTiktokCollectBoxToShop(input: { detailIds: Array<string | number>; shopIds: Array<string | number> }) {
    return this.request<unknown>(claimTiktokCollectBoxToShopPath, {
      detailIds: input.detailIds.map(Number).filter((value) => Number.isFinite(value)),
      shopIds: input.shopIds.map(Number).filter((value) => Number.isFinite(value)),
    });
  }

  async getShopCollectItemInfo(input: { detailId: string | number; shopId: string | number }) {
    return this.request<unknown>(getShopCollectItemInfoPath, {
      detailId: Number(input.detailId),
      shopId: Number(input.shopId),
    });
  }

  async saveShopCollectItemInfo(input: {
    detailId: string | number;
    shopId: string | number;
    ossMd5: string;
    shopCollectItemInfo: unknown;
  }) {
    return this.request<unknown>(saveShopCollectItemInfoPath, {
      detailId: Number(input.detailId),
      shopId: Number(input.shopId),
      ossMd5: input.ossMd5,
      shopCollectItemInfo: input.shopCollectItemInfo,
    });
  }

  async getSiteCollectItemInfo(input: { detailId: string | number; site: string }) {
    return this.request<unknown>(getSiteCollectItemInfoPath, {
      detailId: Number(input.detailId),
      site: input.site,
    });
  }

  async saveSiteCollectItemInfo(input: {
    detailId: string | number;
    site: string;
    ossMd5: string;
    siteCollectItemInfo: unknown;
  }) {
    return this.request<unknown>(saveSiteCollectItemInfoPath, {
      detailId: Number(input.detailId),
      site: input.site,
      ossMd5: input.ossMd5,
      siteCollectItemInfo: input.siteCollectItemInfo,
    });
  }

  async publishCollectTask(input: { detailIds: Array<string | number>; shopIds: Array<string | number> }) {
    return this.request<unknown>(publishCollectTaskPath, {
      detailIds: input.detailIds.map(Number).filter((value) => Number.isFinite(value)),
      shopIds: input.shopIds.map(Number).filter((value) => Number.isFinite(value)),
    });
  }

  async getCategoryTreeBySite(site: string): Promise<MiaoshouCategoryNode[]> {
    const data = await this.request<unknown>(getCategoryTreePath, {
      site: site.trim().toUpperCase(),
    });
    return flattenCategoryTree(data);
  }

  async getCategoryMetadata(input: { site: string; cid: string; shopIds: Array<string | number> }) {
    return this.request<unknown>(getCategoryMetadataPath, {
      site: input.site,
      cid: input.cid,
      shopIds: input.shopIds.map(Number).filter((value) => Number.isFinite(value)),
    });
  }

  async getShopWarehouses(shopIds: Array<string | number>) {
    return this.request<{ shopWarehouseList?: unknown[] }>(getShopWarehousePath, {
      shopIds: shopIds.map(Number).filter((value) => Number.isFinite(value)),
    });
  }

  async getResponsiblePersons(shopId: string | number) {
    return this.request<{ responsiblePersonList?: unknown[] }>(getResponsiblePersonPath, {
      shopId: Number(shopId),
    });
  }

  private buildCommonCollectBoxBody(input: MiaoshouCreateCommonCollectBoxInput) {
    const row = input.row;
    const stock = Math.max(1, Math.floor(Number(input.stock) || 100));
    const weightKg = gramsToKg(row.weightGram);
    const packageSize = parsePackageSize(row.dimensions);
    const skuName = row.skuName || '默认规格';
    const skuKey = `;${skuName};`;
    const imgUrls = uniqueStrings([row.sourceImageUrl, row.skuImageUrl]).slice(0, 15);
    const sourceAttrs = [
      { name: '1688 offerId', value: row.offerId },
      { name: '1688 SKU', value: row.skuName },
      { name: '供应商', value: row.supplier },
      { name: '风险备注', value: row.riskNote },
    ].filter((item) => item.value);

    return {
      title: normalizeTitle(row.title || row.skuName || row.productId),
      itemNum: row.key || row.productId,
      notesText: buildPlainDescription(row),
      notes: buildHtmlDescription(row),
      sourceAttrs,
      price: toPositiveNumber(row.itemPrice || row.purchaseCost, 0.01),
      stock,
      imgUrls,
      weight: weightKg,
      packageLength: packageSize.length,
      packageWidth: packageSize.width,
      packageHeight: packageSize.height,
      colorPropName: '规格',
      colorMap: {
        [skuName]: {
          name: skuName,
          imgUrls: row.skuImageUrl ? [row.skuImageUrl] : imgUrls.slice(0, 1),
          imgUrl: row.skuImageUrl || imgUrls[0] || '',
        },
      },
      skuMap: {
        [skuKey]: {
          itemNum: row.key || row.productId,
          packageHeight: packageSize.height,
          packageLength: packageSize.length,
          packageWidth: packageSize.width,
          price: toPositiveNumber(row.itemPrice || row.purchaseCost, 0.01),
          stock,
          weight: weightKg,
          oriPrice: toPositiveNumber(row.purchaseCost || row.itemPrice, 0.01),
          oriStock: stock,
        },
      },
      sourceList: [
        {
          remark: row.skuName || '',
          sourceItemId: row.offerId,
          source: '1688',
          sourceSite: 'CN',
          sourceItemUrl: row.offerUrl,
        },
      ].filter((item) => item.sourceItemUrl),
    };
  }

  private async request<T>(apiPath: string, body: unknown) {
    assertMiaoshouCredentials(this.options);
    const bodyJson = JSON.stringify(body);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const sign = generateMiaoshouSign(this.options.appSecret, apiPath, timestamp, this.options.appKey, bodyJson);
    const response = await fetch(`${this.baseUrl}${apiPath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-key': this.options.appKey,
        'x-timestamp': timestamp,
        'x-sign': sign,
        ...(this.options.accountId ? { 'x-account-id': this.options.accountId } : {}),
      },
      body: bodyJson,
    });

    const text = await response.text();
    let payload: MiaoshouApiResponse<T>;
    try {
      payload = text ? (JSON.parse(text) as MiaoshouApiResponse<T>) : {};
    } catch {
      throw new Error(`妙手接口返回非 JSON：${text.slice(0, 200)}`);
    }

    if (!response.ok) {
      throw new Error(`妙手接口请求失败：${response.status} ${response.statusText} ${payload.message ?? ''}`.trim());
    }

    if (payload.result === 'fail' || (payload.code && !isSuccessCode(payload.code))) {
      throw new Error(`妙手接口返回错误：${payload.message || payload.code}`);
    }

    return payload.data ?? (payload as T);
  }
}

function isSuccessCode(code: string) {
  return ['success', '0', '200'].includes(String(code).toLowerCase());
}

export function assertMiaoshouCredentials(options: Pick<MiaoshouOpenApiClientOptions, 'appKey' | 'appSecret'>) {
  if (!options.appKey.trim() || !options.appSecret.trim()) {
    throw new Error('请先在AI上架配置填写妙手开放平台 AppKey 和 AppSecret');
  }
}

function generateMiaoshouSign(appSecret: string, apiPath: string, timestamp: string, appKey: string, bodyJson: string) {
  const content = `${appSecret}${apiPath}${timestamp}${appKey}${bodyJson}${appSecret}`;
  return crypto.createHmac('sha256', appSecret).update(content, 'utf8').digest('hex');
}

function gramsToKg(value: number | '') {
  const grams = Number(value);
  if (!Number.isFinite(grams) || grams <= 0) {
    return 0.01;
  }

  return Math.max(0.01, Math.round((grams / 1000) * 1000) / 1000);
}

function parsePackageSize(value: string) {
  const numbers = value.match(/\d+(?:\.\d+)?/g)?.map(Number).filter((item) => Number.isFinite(item) && item > 0) ?? [];
  return {
    length: numbers[0] || 1,
    width: numbers[1] || 1,
    height: numbers[2] || 1,
  };
}

function toPositiveNumber(value: number | '', fallback: number) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? Math.round(numberValue * 100) / 100 : fallback;
}

function normalizeTitle(value: string) {
  const title = value.trim() || 'TikTok Shop Product';
  return title.length > 255 ? title.slice(0, 255) : title;
}

function buildPlainDescription(row: ListingProductRecord) {
  return [
    row.title,
    row.skuName ? `SKU: ${row.skuName}` : '',
    row.offerUrl ? `1688: ${row.offerUrl}` : '',
    row.riskNote ? `风险备注: ${row.riskNote}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildHtmlDescription(row: ListingProductRecord) {
  const lines = buildPlainDescription(row).split('\n').map(escapeHtml);
  return lines.map((line) => `<p>${line}</p>`).join('');
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function uniqueStrings(values: Array<string | undefined>) {
  return [...new Set(values.map((value) => value?.trim() ?? '').filter(Boolean))];
}

function dedupeShops(shops: MiaoshouShop[]) {
  const seen = new Set<string>();
  return shops.filter((shop) => {
    const key = String(shop.shopId ?? '');
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function flattenCategoryTree(value: unknown): MiaoshouCategoryNode[] {
  const root = findNestedCategoryTree(value) ?? value;
  const output: MiaoshouCategoryNode[] = [];
  const walk = (
    nodeValue: unknown,
    parentPath: string[],
    parentPathChinese: string[],
  ) => {
    if (!nodeValue || typeof nodeValue !== 'object') {
      return;
    }

    const node = nodeValue as Record<string, unknown>;
    const cid = toCategoryText(node.cid ?? node.categoryId ?? node.id);
    const name = toCategoryText(node.name);
    const nameChinese = toCategoryText(node.nameChinese ?? node.chineseName ?? node.cnName);
    const children = node.children;

    if (cid || name || nameChinese) {
      const nextPath = [...parentPath, name || nameChinese || cid].filter(Boolean);
      const nextPathChinese = [...parentPathChinese, nameChinese || name || cid].filter(Boolean);
      output.push({
        cid,
        aid: toCategoryText(node.aid),
        fid: toCategoryText(node.fid ?? node.parentId),
        name,
        nameChinese,
        isLastLevel: toCategoryBoolean(node.isLastLevel),
        disabled: toCategoryBoolean(node.disabled),
        path: nextPath.join(' > '),
        pathChinese: nextPathChinese.join(' > '),
      });
      walkChildren(children, nextPath, nextPathChinese, walk);
      return;
    }

    walkChildren(nodeValue, parentPath, parentPathChinese, walk);
  };

  walkChildren(root, [], [], walk);
  return output.filter((item) => item.cid);
}

function walkChildren(
  value: unknown,
  parentPath: string[],
  parentPathChinese: string[],
  walk: (nodeValue: unknown, parentPath: string[], parentPathChinese: string[]) => void,
) {
  if (Array.isArray(value)) {
    for (const item of value) {
      walk(item, parentPath, parentPathChinese);
    }
    return;
  }
  if (!value || typeof value !== 'object') {
    return;
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    walk(child, parentPath, parentPathChinese);
  }
}

function findNestedCategoryTree(value: unknown): unknown {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  for (const key of ['cateTree', 'categoryTree', 'categories', 'list']) {
    if (record[key]) {
      return record[key];
    }
  }
  for (const nested of Object.values(record)) {
    const found = findNestedCategoryTree(nested);
    if (found) {
      return found;
    }
  }
  return undefined;
}

function toCategoryText(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function toCategoryBoolean(value: unknown) {
  if (typeof value === 'boolean') {
    return value;
  }
  const text = String(value ?? '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'y'].includes(text);
}

function extractDraftId(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  for (const key of ['commonCollectBoxDetailId', 'detailId', 'id', 'serialNumber']) {
    const candidate = record[key];
    if (typeof candidate === 'string' || typeof candidate === 'number') {
      return String(candidate);
    }
  }

  for (const candidate of Object.values(record)) {
    const nestedId = extractDraftId(candidate);
    if (nestedId) {
      return nestedId;
    }
  }

  return undefined;
}

function extractArrayByKeys(value: unknown, keys: string[]): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const candidate = record[key];
    if (Array.isArray(candidate)) {
      return candidate;
    }
    const nested = extractArrayByKeys(candidate, keys);
    if (nested.length > 0) {
      return nested;
    }
  }

  return [];
}
