import { chromium, type Browser, type Page, type Response } from 'playwright-core';

export type ZhengheSku = {
  productId: string;
  skuId: string;
  skuName: string;
  price: number | '';
  stock: number | '';
  detailUpdateTime: string;
};

export type ZhengheProductMetrics = {
  productId: string;
  region: string;
  baseInfoTrusted: boolean;
  currencySymbol: string;
  productName: string;
  mainImageUrl: string;
  categoryId: string;
  categoryFullName: string;
  productRating: string;
  reviewCount: number | '';
  commissionRatio: number | '';
  createTime: string;
  soldCount: number | '';
  thirtyDaySales: number | '';
  thirtyDayGmv: number | '';
  thirtyDayPrice: number | '';
  infoWarning: string;
};

export type ZhengheProductData = {
  sourceProductId: string;
  region: string;
  productUrl: string;
  skus: ZhengheSku[];
  metrics: ZhengheProductMetrics;
};

type ZhengheResponse<T> = {
  status: number;
  message?: string;
  extData?: T;
};

const apiBaseUrl = 'https://tkapi-gl.zhenghedata.com';
const zhengheDetailBaseUrl = 'https://zhenghedata.com/product/search/detail-old';
const defaultChromeCdpUrl = 'http://127.0.0.1:9222';

export class ZhengheDataClient {
  async fetchProductData(input: { url: string; fallbackRegion?: string }) {
    const parsed = parseZhengheProductReference(input.url, input.fallbackRegion);
    if (!parsed.productId) {
      throw new Error('郑和数据链接缺少商品ID');
    }

    const loggedInData = await this.fetchProductDataFromLoggedInPage(parsed.productId, parsed.region);
    const [skus, metrics] = loggedInData
      ? await Promise.all([
          this.fetchSkus(parsed.productId),
          this.buildMetricsFromLoggedInBase(parsed.productId, parsed.region, loggedInData),
        ])
      : await Promise.all([
          this.fetchSkus(parsed.productId),
          this.fetchMetrics(parsed.productId, parsed.region),
        ]);
    const finalRegion = parsed.region || metrics.region;

    return {
      sourceProductId: parsed.productId,
      region: finalRegion,
      productUrl: buildTikTokProductUrl(parsed.productId, finalRegion),
      skus,
      metrics,
    };
  }

  private async fetchProductDataFromLoggedInPage(productId: string, region: string) {
    let browser: Browser | null = null;
    let page: Page | null = null;
    const capturedBaseResponses: Record<string, unknown>[] = [];
    const pendingCaptures: Promise<void>[] = [];
    let onResponse: ((response: Response) => void) | null = null;

    try {
      browser = await chromium.connectOverCDP(defaultChromeCdpUrl);
      const context = browser.contexts()[0];
      if (!context) {
        return null;
      }

      page = context.pages().find((candidate) => candidate.url().includes('zhenghedata.com')) ?? await context.newPage();
      page.setDefaultTimeout(60000);
      page.setDefaultNavigationTimeout(60000);

      onResponse = (response: Response) => {
        const capture = captureMatchingZhengheBaseResponse(response, productId, region).then((data) => {
          if (data) {
            capturedBaseResponses.push(data);
          }
        }).catch(() => undefined);
        pendingCaptures.push(capture);
      };
      page.on('response', onResponse);

      const detailUrl = new URL(zhengheDetailBaseUrl);
      detailUrl.searchParams.set('id', productId);
      if (region) {
        detailUrl.searchParams.set('region', region);
      }
      detailUrl.searchParams.set('keyword', '');
      await page.goto(detailUrl.toString(), { waitUntil: 'domcontentloaded' });
      await delay(15000);

      for (let attempt = 0; attempt < 10; attempt += 1) {
        await flushPendingCaptures(pendingCaptures);
        const data = capturedBaseResponses.slice().reverse().find((candidate) => isMatchingZhengheBaseData(candidate, productId, region));
        if (data) {
          return data;
        }
        await delay(5000);
      }
    } catch {
      return null;
    } finally {
      if (page && onResponse) {
        page.off('response', onResponse);
      }
      await browser?.close().catch(() => undefined);
    }

    return null;
  }

  private async buildMetricsFromLoggedInBase(productId: string, requestedRegion: string, base: Record<string, unknown>) {
    const overview = await this.fetchOverview(productId).catch(() => ({} as Record<string, unknown>));
    const returnedProductId = textValue(base.productId);
    const returnedRegion = textValue(base.region);
    const productIdMismatch = Boolean(returnedProductId && returnedProductId !== productId);
    const regionMismatch = Boolean(requestedRegion && returnedRegion && returnedRegion.toLowerCase() !== requestedRegion.toLowerCase());
    return buildMetricsFromBase(productId, requestedRegion || returnedRegion, base, overview, [
      returnedProductId && returnedProductId !== productId ? `登录态基础信息返回商品ID不一致：${returnedProductId}` : '',
      requestedRegion && returnedRegion && returnedRegion.toLowerCase() !== requestedRegion.toLowerCase()
        ? `登录态基础信息返回站点不一致：${returnedRegion}`
        : '',
    ], !productIdMismatch && !regionMismatch);
  }

  private async fetchSkus(productId: string): Promise<ZhengheSku[]> {
    const payload = await this.request<unknown[]>(`/product/sku?productId=${encodeURIComponent(productId)}`);
    return (payload.extData ?? []).map((item) => normalizeSku(item as Record<string, unknown>));
  }

  private async fetchMetrics(productId: string, region: string): Promise<ZhengheProductMetrics> {
    const [baseResult, overviewResult] = await Promise.allSettled([
      this.request<Record<string, unknown>>(`/product/info/base?productId=${encodeURIComponent(productId)}&language=zh`),
      this.fetchOverview(productId),
    ]);
    const base = baseResult.status === 'fulfilled' ? baseResult.value.extData ?? {} : {};
    const overview = overviewResult.status === 'fulfilled' ? overviewResult.value : {};
    const returnedProductId = textValue(base.productId);
    const returnedRegion = textValue(base.region);
    const productIdMismatch = Boolean(returnedProductId && returnedProductId !== productId);
    const regionMismatch = Boolean(returnedRegion && region && returnedRegion.toLowerCase() !== region.toLowerCase());
    const warnings = [
      returnedProductId && returnedProductId !== productId ? `基础信息返回商品ID不一致：${returnedProductId}` : '',
      returnedRegion && region && returnedRegion.toLowerCase() !== region.toLowerCase() ? `基础信息返回站点不一致：${returnedRegion}` : '',
      baseResult.status === 'rejected' ? `基础信息读取失败：${baseResult.reason instanceof Error ? baseResult.reason.message : String(baseResult.reason)}` : '',
      overviewResult.status === 'rejected' ? `近30天趋势读取失败：${overviewResult.reason instanceof Error ? overviewResult.reason.message : String(overviewResult.reason)}` : '',
    ].filter(Boolean);

    return buildMetricsFromBase(productId, region, base, overview, warnings, !productIdMismatch && !regionMismatch);
  }

  private async fetchOverview(productId: string) {
    const end = new Date();
    end.setDate(end.getDate() - 1);
    const start = new Date(end);
    start.setDate(start.getDate() - 29);
    const payload = await this.request<Record<string, unknown>>('/product/overview', {
      method: 'POST',
      body: JSON.stringify({
        productId,
        startDate: formatDate(start),
        endDate: formatDate(end),
      }),
    });
    return payload.extData ?? {};
  }

  private async request<T>(apiPath: string, init: RequestInit = {}) {
    const response = await fetch(`${apiBaseUrl}${apiPath}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Origin: 'https://zhenghedata.com',
        Referer: 'https://zhenghedata.com/',
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) {
      throw new Error(`郑和数据接口请求失败：${response.status} ${response.statusText}`);
    }

    const payload = (await response.json()) as ZhengheResponse<T>;
    if (payload.status !== 0) {
      throw new Error(`郑和数据接口返回错误：${payload.message || payload.status}`);
    }
    return payload;
  }
}

export function parseZhengheProductReference(value: string, fallbackRegion = '') {
  const text = value.trim();
  if (!text) {
    return { productId: '', region: fallbackRegion.toLowerCase() };
  }

  try {
    const url = new URL(text);
    const idFromQuery = url.searchParams.get('id') || url.searchParams.get('productId') || '';
    const idFromPath = url.pathname.match(/(?:product|pdp)\/([^/?]+)/i)?.[1] ?? '';
    const region = url.searchParams.get('region') || fallbackRegion;
    return {
      productId: (idFromQuery || idFromPath).trim(),
      region: (region || '').trim().toLowerCase(),
    };
  } catch {
    return { productId: text, region: fallbackRegion.toLowerCase() };
  }
}

export function buildTikTokProductUrl(productId: string, region: string) {
  const normalizedRegion = region.toLowerCase();
  const baseUrl = normalizedRegion === 'us'
    ? 'https://www.tiktok.com/shop/pdp'
    : normalizedRegion === 'gb'
      ? 'https://shop-uk.tiktokw.eu/pdp'
      : 'https://shop.tiktok.com/view/product';
  const query = normalizedRegion ? `?source=agency&region=${encodeURIComponent(normalizedRegion)}` : '?source=agency';
  return `${baseUrl}/${encodeURIComponent(productId)}${query}`;
}

export function regionToCurrencySymbol(region: string) {
  const normalizedRegion = region.toLowerCase();
  const symbols: Record<string, string> = {
    my: 'RM',
    us: '$',
    gb: '£',
    sg: 'S$',
    th: '฿',
    ph: '₱',
    id: 'Rp',
    vn: '₫',
  };
  return symbols[normalizedRegion] ?? '';
}

function normalizeSku(item: Record<string, unknown>): ZhengheSku {
  const skuPropInfoList = Array.isArray(item.skuPropInfoList) ? item.skuPropInfoList : [];
  const skuName = skuPropInfoList
    .map((part) => {
      const record = part as Record<string, unknown>;
      const name = textValue(record.propName);
      const value = textValue(record.propValue);
      return name && value ? `${name}:${value}` : value;
    })
    .filter(Boolean)
    .join(' / ');

  return {
    productId: textValue(item.productId),
    skuId: textValue(item.skuId),
    skuName,
    price: numberValue(item.priceVal),
    stock: numberValue(item.stock),
    detailUpdateTime: textValue(item.detailUpdateTime),
  };
}

function getMainImageUrl(base: Record<string, unknown>) {
  const productImgs = Array.isArray(base.productImgs) ? base.productImgs.map(textValue).find(Boolean) : '';
  const imgUrlList = Array.isArray(base.imgUrlList) ? base.imgUrlList.map(textValue).find(Boolean) : textValue(base.imgUrlList);
  return productImgs || imgUrlList || '';
}

function buildMetricsFromBase(
  productId: string,
  region: string,
  base: Record<string, unknown>,
  overview: Record<string, unknown>,
  warnings: string[],
  baseInfoTrusted = true,
): ZhengheProductMetrics {
  return {
    productId,
    region,
    baseInfoTrusted,
    currencySymbol: textValue(base.currencySymbol) || regionToCurrencySymbol(region),
    productName: textValue(base.productName),
    mainImageUrl: getMainImageUrl(base),
    categoryId: textValue(base.categoryId),
    categoryFullName: fixMojibake(textValue(base.categoryFullName)),
    productRating: textValue(base.productRating),
    reviewCount: numberValue(base.reviewCount),
    commissionRatio: numberValue(base.commissionRatio),
    createTime: textValue(base.createTime),
    soldCount: numberValue(base.soldCount),
    thirtyDaySales: numberValue(overview.sales),
    thirtyDayGmv: numberValue(overview.salesVolume),
    thirtyDayPrice: numberValue(overview.salePriceDecimal),
    infoWarning: warnings.filter(Boolean).join('；'),
  };
}

async function captureMatchingZhengheBaseResponse(response: Response, productId: string, region: string) {
  const url = response.url();
  if (!url.includes('/product/info/base') || !url.includes(`productId=${encodeURIComponent(productId)}`)) {
    return null;
  }

  try {
    const payload = await response.json() as ZhengheResponse<Record<string, unknown>>;
    const data = payload.extData;
    if (payload.status !== 0 || !data) {
      return null;
    }

    return isMatchingZhengheBaseData(data, productId, region) ? data : null;
  } catch {
    return null;
  }
}

function isMatchingZhengheBaseData(data: Record<string, unknown>, productId: string, region: string) {
  const normalizedRegion = region.trim().toLowerCase();
  const returnedProductId = textValue(data.productId);
  const returnedRegion = textValue(data.region).toLowerCase();
  if (returnedProductId && returnedProductId !== productId) {
    return false;
  }
  if (normalizedRegion && returnedRegion && returnedRegion !== normalizedRegion) {
    return false;
  }

  return true;
}

async function flushPendingCaptures(pendingCaptures: Promise<void>[]) {
  const captures = pendingCaptures.splice(0, pendingCaptures.length);
  if (captures.length > 0) {
    await Promise.allSettled(captures);
  }
}

function textValue(value: unknown) {
  return value == null ? '' : String(value).trim();
}

function numberValue(value: unknown): number | '' {
  const normalized = String(value ?? '').replace(/,/g, '').trim();
  const number = Number(normalized);
  return Number.isFinite(number) ? number : '';
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fixMojibake(value: string) {
  if (!/[ÃÂçäåéè]/.test(value)) {
    return value;
  }

  try {
    return Buffer.from(value, 'latin1').toString('utf8');
  } catch {
    return value;
  }
}
