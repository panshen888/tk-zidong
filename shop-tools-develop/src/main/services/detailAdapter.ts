import crypto from 'node:crypto';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import type { ProductItem, SkuMatchResult, SupplierCandidate } from '../../shared/types';
import { buildOpenAICompatibleChatCompletionsUrl, recordAttributeAiUsage, type ImageSimilarityResult, type ImageSimilarityService, type OpenAICompatibleSimilarityOptions } from './imageSimilarityService';
import { assertAppChromeCdpOwnership, getOrCreateAppChromeContext } from './chromeSession';

export type DetailPageAdapter = {
  inspectCandidate: (input: DetailInspectInput) => Promise<SkuMatchResult | null>;
};

export type DetailInspectInput = {
  item: ProductItem;
  candidate: SupplierCandidate;
  originalImagePath: string;
  sourcingMode?: 'fast' | 'accurate';
  imageSimilarityService?: ImageSimilarityService;
  appendLog?: (level: 'info' | 'warn' | 'error', message: string) => void;
  signal?: AbortSignal;
};

export type Real1688DetailAdapterOptions = {
  chromeMode: 'connect' | 'launch';
  chromeCdpUrl: string;
  chromeExecutablePath: string;
  chromeUserDataDir: string;
  pageTimeoutMs: number;
  headless?: boolean;
  lowDisturbance?: boolean;
  ai: OpenAICompatibleSimilarityOptions;
};

type DetailSelectors = {
  skuOptions: string[];
  mainImages: string[];
  quantityInputs: string[];
  priceTexts: string[];
  shippingTexts: string[];
  discountTexts: string[];
  attributeTexts: string[];
};

type SkuSnapshot = {
  skuId: string;
  skuName: string;
  skuImageUrl: string;
  skuParts: string[];
  select: () => Promise<void>;
};

type AttributeExtractionResult = {
  dimensions?: string;
  weightGram?: number;
  weightSource?: SkuMatchResult['weightSource'];
  weightConfidence?: SkuMatchResult['weightConfidence'];
  reason?: string;
};

type PricingExtractionResult = {
  itemPrice?: number;
  shippingFee?: number;
  firstOrderDiscountText?: string;
};

type PackInfoRow = {
  headers: string[];
  values: string[];
};

const defaultDetailSelectors: DetailSelectors = {
  skuOptions: [
    '[class*="sku"] [role="button"]',
    '[class*="sku"] button',
    '[class*="sku"] li',
    '[class*="Sku"] [role="button"]',
    '[class*="spec"] [role="button"]',
    '[class*="spec"] li',
    '[class*="saleProp"] li',
    '[data-sku-id]',
    '[data-sku]',
  ],
  mainImages: [
    '[class*="main"] img[src*="alicdn.com"]',
    '[class*="gallery"] img[src*="alicdn.com"]',
    '[class*="preview"] img[src*="alicdn.com"]',
    'img[src*="alicdn.com/img/ibank"]',
  ],
  quantityInputs: [
    'input[type="number"]',
    'input[class*="quantity"]',
    'input[class*="amount"]',
    '[class*="quantity"] input',
    '[class*="amount"] input',
  ],
  priceTexts: [
    '[class*="price"]',
    '[class*="Price"]',
    '[class*="sku"]',
  ],
  shippingTexts: [
    '[class*="freight"]',
    '[class*="shipping"]',
    '[class*="logistic"]',
    '[class*="delivery"]',
    'body',
  ],
  discountTexts: [
    '[class*="discount"]',
    '[class*="coupon"]',
    '[class*="promotion"]',
    '[class*="promo"]',
    'body',
  ],
  attributeTexts: [
    '[class*="attribute"]',
    '[class*="param"]',
    '[class*="property"]',
    '[class*="spec"]',
    '[class*="detail"]',
    'body',
  ],
};
const attributeAiTimeoutMs = 60000;
const minimumOrderQualifierPattern = '[^\\d起批]{0,8}';

export function createMockDetailPageAdapter(): DetailPageAdapter {
  return {
    async inspectCandidate(input) {
      throwIfAborted(input.signal);
      if (input.candidate.suggestion === '不建议') {
        return null;
      }

      const seed = crypto
        .createHash('sha1')
        .update(`${input.item.productId}:${input.candidate.offerId}:${input.originalImagePath}`)
        .digest('hex');
      const fallbackSimilarity = input.candidate.score >= 90
        ? 0.92
        : Number((0.9 - Number.parseInt(seed.slice(0, 2), 16) / 2550).toFixed(3));
      const similarityResult = input.imageSimilarityService
        ? await input.imageSimilarityService.compare({
            sourceImagePath: input.originalImagePath,
            targetImageUrlOrPath: input.candidate.coverImageUrl?.startsWith('local://')
              ? input.originalImagePath
              : input.candidate.coverImageUrl ?? input.originalImagePath,
          })
        : {
            score: fallbackSimilarity,
            isSameProduct: fallbackSimilarity >= 0.86,
            reason: 'mock 相似度结果，待中转站视觉模型替换',
            provider: 'mock' as const,
          };
      const itemPrice = Number((18.6 + Number.parseInt(seed.slice(2, 4), 16) / 30).toFixed(2));
      const shippingFee = Number((6 + Number.parseInt(seed.slice(4, 6), 16) / 80).toFixed(2));
      const purchaseCost = Number((itemPrice + shippingFee).toFixed(2));

      return {
        productId: input.item.productId,
        offerId: input.candidate.offerId,
        offerUrl: input.candidate.offerUrl,
        skuId: `mock-sku-${seed.slice(0, 8)}`,
        skuName: `${input.candidate.title} / Mock 匹配 SKU`,
        skuImageUrl: input.candidate.coverImageUrl,
        skuImageSimilarity: similarityResult.score,
        isSameProduct: similarityResult.isSameProduct,
        itemPrice,
        shippingFee,
        purchaseCost,
        currency: 'CNY',
        quantity: 1,
        dimensions: '20×15×8cm',
        weightGram: 180,
        weightSource: '详情页',
        weightConfidence: '中',
        extractionSource: 'mock',
        riskFlags: [
          'mock 详情页数据，待真实 SKU 切换与加购流程替换',
          `相似度来源：${similarityResult.provider}，${similarityResult.reason}`,
        ],
      };
    },
  };
}

export function createReal1688DetailPageAdapter(options: Real1688DetailAdapterOptions): DetailPageAdapter {
  return {
    async inspectCandidate(input) {
      if (input.candidate.suggestion === '不建议') {
        return null;
      }

      if (!input.imageSimilarityService) {
        throw new Error('真实详情页 SKU 匹配需要配置图片相似度服务。');
      }

      const browserSession = await openDetailBrowserSession(options, input.candidate.offerUrl);
      const context = browserSession.context;
      const page = await context.newPage();

      try {
        page.setDefaultTimeout(options.pageTimeoutMs);
        await page.goto(input.candidate.offerUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle', { timeout: options.pageTimeoutMs }).catch(() => undefined);
        await assertExpectedDetailPage(page, input.candidate, options.pageTimeoutMs);
        throwIfAborted(input.signal);

        const minimumOrder = await collectMinimumOrderInfo(page);
        if (minimumOrder.text) {
          input.appendLog?.('info', `${input.item.productId} 起批量记录：${minimumOrder.text}`);
        }

        const skuSnapshots = await collectSkuSnapshots(page, input.signal);
        input.appendLog?.('info', `${input.item.productId} 详情页 SKU 图片枚举完成：${skuSnapshots.length} 个可比对 SKU`);
        if (skuSnapshots.length === 0) {
          if (input.sourcingMode !== 'fast') {
            throw new Error('已打开详情页，但 SKU 列表中未识别到商品图片，按当前规则跳过该候选。');
          }

          input.appendLog?.('warn', `${input.item.productId} 快速模式未识别 SKU 图片，改用详情页候选级价格/克重兜底。`);
          await setFirstAvailableQuantityToOne(page).catch(() => undefined);
          await waitForSelectedQuantityAndPricing(page).catch(() => undefined);
          const fallbackSku: SkuSnapshot = {
            skuId: `fallback-${input.candidate.offerId}`,
            skuName: input.candidate.title || `候选货源 ${input.candidate.offerId}`,
            skuImageUrl: input.candidate.coverImageUrl ?? '',
            skuParts: [input.candidate.title].filter(Boolean),
            select: async () => undefined,
          };
          const fallbackPricing = await extractPricing(page);
          const fallbackContextText = await collectPageContextText(page, fallbackSku);
          const fallbackParsedAttributes = parseAttributesFromText(fallbackContextText);
          const fallbackAiAttributes =
            fallbackParsedAttributes.dimensions && fallbackParsedAttributes.weightGram
              ? null
              : await extractAttributesWithAi(options.ai, fallbackContextText, fallbackSku).catch(() => null);
          const fallbackAttributes = {
            ...fallbackParsedAttributes,
            ...Object.fromEntries(Object.entries(fallbackAiAttributes ?? {}).filter(([, value]) => value != null && value !== '')),
          } as AttributeExtractionResult;

          return {
            productId: input.item.productId,
            offerId: input.candidate.offerId,
            offerUrl: input.candidate.offerUrl,
            skuId: fallbackSku.skuId,
            skuName: fallbackSku.skuName,
            skuImageUrl: fallbackSku.skuImageUrl,
            skuImageSimilarity: input.candidate.listImageSimilarity ?? input.candidate.score / 100,
            isSameProduct: true,
            itemPrice: fallbackPricing.itemPrice ?? input.candidate.listPrice,
            shippingFee: fallbackPricing.shippingFee,
            purchaseCost:
              (fallbackPricing.itemPrice ?? input.candidate.listPrice) == null || fallbackPricing.shippingFee == null
                ? undefined
                : Number(((fallbackPricing.itemPrice ?? input.candidate.listPrice ?? 0) + fallbackPricing.shippingFee).toFixed(2)),
            currency: 'CNY',
            quantity: minimumOrder.quantity ?? 1,
            dimensions: fallbackAttributes.dimensions,
            weightGram: fallbackAttributes.weightGram,
            weightSource: fallbackAttributes.weightSource ?? (fallbackAttributes.weightGram ? '文本' : '未识别'),
            weightConfidence: fallbackAttributes.weightConfidence ?? (fallbackAttributes.weightGram ? '中' : '低'),
            extractionSource: 'detail_page',
            riskFlags: [
              '快速模式未识别 SKU 图片，使用候选级价格/克重兜底',
              minimumOrder.text ? `起批量仅记录不拦截：${minimumOrder.text}` : '',
              fallbackPricing.itemPrice == null && input.candidate.listPrice != null ? '商品价使用列表价兜底' : '',
              fallbackPricing.shippingFee == null ? '未识别运费' : '',
              fallbackAttributes.reason ? `属性提取：${fallbackAttributes.reason}` : '',
            ].filter(Boolean),
          };
        }

        input.appendLog?.('info', `${input.item.productId} 开始批量 AI SKU 图片相似度识别：${skuSnapshots.length} 张 SKU 图`);
        throwIfAborted(input.signal);
        const similarityResults = await input.imageSimilarityService.compareBatch({
          sourceImagePath: input.originalImagePath,
          targetImageUrlOrPaths: skuSnapshots.map((snapshot) => snapshot.skuImageUrl),
        });
        throwIfAborted(input.signal);
        const best = getBestSkuSnapshot(skuSnapshots, similarityResults);
        input.appendLog?.(
          'info',
          `${input.item.productId} SKU 图片相似度识别完成：选中 ${best.snapshot.skuName}，相似度 ${best.result.score}`,
        );
        await clearSkuQuantities(page);
        await best.snapshot.select();
        throwIfAborted(input.signal);
        await waitForSelectedQuantityAndPricing(page);

        const pricing = await extractPricing(page);
        input.appendLog?.(
          pricing.itemPrice == null || pricing.shippingFee == null ? 'warn' : 'info',
          `${input.item.productId} 详情页计价提取：商品价 ${pricing.itemPrice ?? '未识别'}，运费 ${pricing.shippingFee ?? '未识别'}`,
        );
        const pageContextText = await collectPageContextText(page, best.snapshot);
        const packAttributes = await extractPackAttributes(page, best.snapshot);
        const parsedAttributes = parseAttributesFromText(pageContextText);
        const aiAttributes =
          (packAttributes.dimensions || parsedAttributes.dimensions) && (packAttributes.weightGram || parsedAttributes.weightGram)
            ? null
            : await extractAttributesWithAi(options.ai, pageContextText, best.snapshot).catch(() => null);
        throwIfAborted(input.signal);
        const attributes = {
          ...parsedAttributes,
          ...Object.fromEntries(Object.entries(aiAttributes ?? {}).filter(([, value]) => value != null && value !== '')),
          ...Object.fromEntries(Object.entries(packAttributes).filter(([, value]) => value != null && value !== '')),
        } as AttributeExtractionResult;
        input.appendLog?.(
          attributes.dimensions || attributes.weightGram ? 'info' : 'warn',
          `${input.item.productId} 尺寸/克重提取：尺寸 ${attributes.dimensions ?? '未识别'}，克重 ${
            attributes.weightGram ?? '未识别'
          }，来源 ${attributes.weightSource ?? '未识别'}`,
        );

        return {
          productId: input.item.productId,
          offerId: input.candidate.offerId,
          offerUrl: input.candidate.offerUrl,
          skuId: best.snapshot.skuId,
          skuName: best.snapshot.skuName,
          skuImageUrl: best.snapshot.skuImageUrl,
          skuImageSimilarity: best.result.score,
          isSameProduct: true,
          itemPrice: pricing.itemPrice,
          shippingFee: pricing.shippingFee,
          purchaseCost:
            pricing.itemPrice == null || pricing.shippingFee == null
              ? undefined
              : Number((pricing.itemPrice + pricing.shippingFee).toFixed(2)),
          currency: 'CNY',
          quantity: minimumOrder.quantity ?? 1,
          dimensions: attributes.dimensions,
          weightGram: attributes.weightGram,
          weightSource: attributes.weightSource ?? (attributes.weightGram ? '文本' : '未识别'),
          weightConfidence: attributes.weightConfidence ?? (attributes.weightGram ? '中' : '低'),
          extractionSource: 'detail_page',
          riskFlags: [
            `详情页 SKU 批量相似度最高：${best.result.score}，${best.result.reason}`,
            minimumOrder.text ? `起批量仅记录不拦截：${minimumOrder.text}` : '',
            pricing.firstOrderDiscountText ? `首单优惠仅记录不计入采购成本：${pricing.firstOrderDiscountText}` : '',
            attributes.reason ? `属性提取：${attributes.reason}` : '',
            pricing.itemPrice == null ? '未识别商品单价' : '',
            pricing.shippingFee == null ? '未识别运费' : '',
          ].filter(Boolean),
        };
      } finally {
        await page.close().catch(() => undefined);
        await browserSession.close();
      }
    },
  };
}

async function assertExpectedDetailPage(page: Page, candidate: SupplierCandidate, timeoutMs: number) {
  const expectedOfferId = candidate.offerId;
  await page
    .waitForFunction(
      (offerId) => {
        const href = window.location.href;
        const text = document.body?.innerText ?? '';
        if (offerId && (href.includes(offerId) || text.includes(offerId))) {
          return true;
        }

        return Boolean(
          document.querySelector('#mainPrice, .od-price-container, .module-od-sku-selection') &&
            /起批|SKU|规格|颜色|尺码|商品/.test(text),
        );
      },
      expectedOfferId,
      { timeout: timeoutMs },
    )
    .catch(async () => {
      const debug = await getDetailPageDebug(page);
      throw new Error(
        `打开详情页后未确认进入目标商品。期望 offerId=${expectedOfferId}，目标链接=${candidate.offerUrl}。${debug}`,
      );
    });

  const currentUrl = page.url();
  if (expectedOfferId && currentUrl.includes('detail.1688.com') && !currentUrl.includes(expectedOfferId)) {
    const debug = await getDetailPageDebug(page);
    throw new Error(
      `详情页 URL 与目标商品不一致。期望 offerId=${expectedOfferId}，当前页=${currentUrl}，目标链接=${candidate.offerUrl}。${debug}`,
    );
  }
}

async function getDetailPageDebug(page: Page) {
  const currentUrl = page.url();
  const title = await page.title().catch(() => '');
  const bodyText = await page
    .evaluate(() => document.body?.innerText?.replace(/\s+/g, ' ').trim().slice(0, 500) ?? '')
    .catch(() => '');
  return `当前页=${currentUrl}。页面标题=${title || '未识别'}。页面文本摘要=${bodyText || '空'}。`;
}

async function collectMinimumOrderInfo(page: Page) {
  const container = page.locator('#mainPrice, .od-price-container').first();
  if (!(await container.isVisible().catch(() => false))) {
    return { text: '' };
  }

  const containerText = normalizeSpace((await container.textContent().catch(() => null)) ?? '');
  const minimumOrderTexts = await collectMinimumOrderTexts(page);
  for (const minimumOrderText of [...minimumOrderTexts, containerText]) {
    if (hasSingleItemMinimumOrderText(minimumOrderText)) {
    return { text: extractSingleItemMinimumOrderText(minimumOrderText) || '1起批', quantity: 1 };
    }
  }

  const minimumQuantity = [...minimumOrderTexts, containerText]
    .map((minimumOrderText) => extractMinimumOrderQuantity(minimumOrderText))
    .find((quantity) => quantity != null);
  return {
    text: minimumQuantity == null ? containerText.slice(0, 120) : `${minimumQuantity}起批`,
    quantity: minimumQuantity,
  };
}

async function openDetailBrowserSession(options: Real1688DetailAdapterOptions, imageSearchUrl: string): Promise<{
  context: BrowserContext;
  close: () => Promise<void>;
}> {
  if (options.chromeMode === 'connect') {
    await assertAppChromeCdpOwnership({
      chromeCdpUrl: options.chromeCdpUrl,
      chromeUserDataDir: options.chromeUserDataDir,
    });
    const browser = await connectOverCdp(options.chromeCdpUrl);
    const context = browser.contexts()[0] ?? (await browser.newContext());
    context.setDefaultTimeout(options.pageTimeoutMs);
    return {
      context,
      close: async () => {
        disconnectCdpBrowser(browser);
      },
    };
  }

  const context = await getOrCreateAppChromeContext({
    chromeExecutablePath: options.chromeExecutablePath,
    chromeUserDataDir: options.chromeUserDataDir,
    imageSearchUrl,
    pageTimeoutMs: options.pageTimeoutMs,
    headless: options.headless ?? false,
    lowDisturbance: options.lowDisturbance ?? false,
  });
  return {
    context,
    close: async () => undefined,
  };
}

async function connectOverCdp(chromeCdpUrl: string) {
  try {
    return await chromium.connectOverCDP(chromeCdpUrl);
  } catch (error) {
    throw new Error(
      [
        `无法连接当前 Chrome 调试端口：${chromeCdpUrl}`,
        '当前 Chrome 必须通过项目里的“打开登录浏览器”启动，并开启远程调试端口。',
        `原始错误：${error instanceof Error ? error.message : String(error)}`,
      ].join('\n'),
    );
  }
}

function disconnectCdpBrowser(browser: Browser) {
  const maybeDisconnect = (browser as unknown as { disconnect?: () => void }).disconnect;
  if (typeof maybeDisconnect === 'function') {
    maybeDisconnect.call(browser);
  }
}

async function collectMinimumOrderTexts(page: Page) {
  return await page
    .locator('#mainPrice, .od-price-container')
    .first()
    .evaluate((container) => {
      const candidates = new Set<string>();
      const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
      const elements = Array.from(container.querySelectorAll('*'));
      for (const element of elements) {
        const ownText = normalize(
          Array.from(element.childNodes)
            .filter((node) => node.nodeType === Node.TEXT_NODE)
            .map((node) => node.textContent || '')
            .join(' '),
        );
        if (/起批/.test(ownText)) {
          candidates.add(ownText);
        }

        const text = normalize(element.textContent || '');
        if (!/起批/.test(text)) {
          continue;
        }

        const childWithMinimumOrder = Array.from(element.children).some((child) => /起批/.test(child.textContent || ''));
        if (!childWithMinimumOrder || text.length <= 20) {
          candidates.add(text);
        }
      }

      return Array.from(candidates).sort((left, right) => left.length - right.length);
    })
    .catch(() => []);
}

function hasSingleItemMinimumOrderText(text: string) {
  return new RegExp(`(?:^|[^\\d])1\\s*${minimumOrderQualifierPattern}\\s*起批`).test(
    stripPriceBeforeMinimumOrderText(text),
  );
}

function extractSingleItemMinimumOrderText(text: string) {
  return stripPriceBeforeMinimumOrderText(text).match(new RegExp(`1\\s*${minimumOrderQualifierPattern}\\s*起批`))?.[0] ?? '';
}

function extractMinimumOrderQuantity(text: string) {
  const normalizedText = stripPriceBeforeMinimumOrderText(text);
  const explicitMatch = normalizedText.match(new RegExp(`(?:^|[^\\d])(\\d+)\\s*${minimumOrderQualifierPattern}\\s*起批`));
  if (explicitMatch) {
    return Number(explicitMatch[1]);
  }

  const rangeMatch = normalizedText.match(new RegExp(`(?:^|[^\\d])(\\d+)\\s*[-~至]\\s*\\d+\\s*[^\\d]{0,8}`));
  if (rangeMatch) {
    return Number(rangeMatch[1]);
  }

  const greaterEqualMatch = normalizedText.match(new RegExp(`[≥>=]\\s*(\\d+)\\s*[^\\d]{0,8}`));
  if (greaterEqualMatch) {
    return Number(greaterEqualMatch[1]);
  }

  return undefined;
}

function stripPriceBeforeMinimumOrderText(text: string) {
  const explicitPriceText = text.replace(
    new RegExp(`[¥￥]\\s*\\d+(?:\\.\\d{1,2})?(?=\\s*\\d+\\s*${minimumOrderQualifierPattern}\\s*起批)`, 'g'),
    '',
  );
  return explicitPriceText.replace(new RegExp(`[¥￥]\\s*\\d+(?=1\\s*${minimumOrderQualifierPattern}\\s*起批)`, 'g'), '');
}

async function collectSkuSnapshots(page: Page, signal?: AbortSignal): Promise<SkuSnapshot[]> {
  const snapshots: SkuSnapshot[] = [];
  const seen = new Set<string>();

  const rowOptions = await page.locator('.module-od-sku-selection .expand-view-item').all();
  for (const [index, option] of rowOptions.entries()) {
    throwIfAborted(signal);
    if (!(await option.isVisible().catch(() => false))) {
      continue;
    }

    const skuImageUrl = await getImageUrlFromLocator(option.locator('img').first());
    if (!skuImageUrl) {
      continue;
    }

    const skuName = await getLocatorText(option.locator('.item-label').first(), `SKU ${index + 1}`);
    const skuParts = [skuName].filter(Boolean);
    addSkuSnapshot(snapshots, seen, {
      skuId: `row-sku-${index + 1}`,
      skuName: skuName || `SKU ${index + 1}`,
      skuImageUrl,
      skuParts,
      select: async () => {
        await option.scrollIntoViewIfNeeded().catch(() => undefined);
        await clickSkuOption(option.locator('.item-label, img').first(), option);
        await setQuantityInputToOne(option.locator('input.ant-input-number-input, input[role="spinbutton"], input').first());
      },
    });
  }

  const filterOptions = await page.locator('.module-od-sku-selection .sku-filter-button').all();
  for (const [index, option] of filterOptions.entries()) {
    throwIfAborted(signal);
    if (!(await option.isVisible().catch(() => false))) {
      continue;
    }

    const skuImageUrl = await getImageUrlFromLocator(option.locator('img').first());
    if (!skuImageUrl) {
      continue;
    }

    const skuName = await getLocatorText(option.locator('.label-name').first(), `SKU ${index + 1}`);
    const skuParts = [skuName].filter(Boolean);
    addSkuSnapshot(snapshots, seen, {
      skuId: `filter-sku-${index + 1}`,
      skuName: skuName || `SKU ${index + 1}`,
      skuImageUrl,
      skuParts,
      select: async () => {
        await option.scrollIntoViewIfNeeded().catch(() => undefined);
        await clickSkuOption(option.locator('.label-name, img').first(), option);
        await page.waitForTimeout(300);
        const quantityRow = page.locator('.module-od-sku-selection .expand-view-item').first();
        if (await quantityRow.isVisible().catch(() => false)) {
          const quantityLabel = await getLocatorText(quantityRow.locator('.item-label').first(), '');
          if (quantityLabel) {
            skuParts.push(quantityLabel);
          }
          await setQuantityInputToOne(quantityRow.locator('input.ant-input-number-input, input[role="spinbutton"], input').first());
        } else {
          await setFirstAvailableQuantityToOne(page);
        }
      },
    });
  }

  return snapshots;
}

function getBestSkuSnapshot(snapshots: SkuSnapshot[], results: ImageSimilarityResult[]) {
  if (results.length !== snapshots.length) {
    throw new Error(`SKU 批量相似度返回数量不匹配：期望 ${snapshots.length}，实际 ${results.length}`);
  }

  return snapshots
    .map((snapshot, index) => ({ snapshot, result: results[index] }))
    .sort((left, right) => right.result.score - left.result.score)[0];
}

function addSkuSnapshot(snapshots: SkuSnapshot[], seen: Set<string>, snapshot: SkuSnapshot) {
  const key = `${snapshot.skuName}:${snapshot.skuImageUrl}`;
  if (seen.has(key)) {
    return;
  }

  seen.add(key);
  snapshots.push(snapshot);
}

async function getImageUrlFromLocator(locator: ReturnType<Page['locator']>) {
  if (!(await locator.isVisible().catch(() => false))) {
    return '';
  }

  const imageUrl =
    (await locator.getAttribute('src').catch(() => null)) ??
    (await locator.getAttribute('data-src').catch(() => null)) ??
    '';
  return imageUrl ? normalizeUrl(imageUrl) : '';
}

async function getLocatorText(locator: ReturnType<Page['locator']>, fallback: string) {
  const title = await locator.getAttribute('title').catch(() => null);
  const text = await locator.textContent().catch(() => null);
  return normalizeSpace(title || text || fallback);
}

async function clickSkuOption(locator: ReturnType<Page['locator']>, fallback: ReturnType<Page['locator']>) {
  const target = (await locator.isVisible().catch(() => false)) ? locator : fallback;
  await target.click({ force: true });
}

async function clearSkuQuantities(page: Page) {
  const inputs = await page.locator('.module-od-sku-selection input.ant-input-number-input, .module-od-sku-selection input[role="spinbutton"]').all();
  for (const input of inputs) {
    if (await input.isVisible().catch(() => false)) {
      await setQuantityInputValue(input, '0');
    }
  }
}

async function setFirstAvailableQuantityToOne(page: Page) {
  const input = page.locator('.module-od-sku-selection input.ant-input-number-input, .module-od-sku-selection input[role="spinbutton"]').first();
  await setQuantityInputToOne(input);
}

async function setQuantityInputToOne(locator: ReturnType<Page['locator']>) {
  if (!(await locator.isVisible().catch(() => false))) {
    throw new Error('已匹配 SKU 图片，但未找到该 SKU 对应的数量输入框。');
  }

  await setQuantityInputValue(locator, '1');
  const value = await locator.inputValue().catch(() => '');
  if (value !== '1') {
    await clickQuantityPlus(locator);
  }
}

async function setQuantityInputValue(locator: ReturnType<Page['locator']>, value: string) {
  await locator.scrollIntoViewIfNeeded().catch(() => undefined);
  await locator.click({ force: true }).catch(() => undefined);
  await locator.fill(value).catch(async () => {
    await locator.evaluate((element, nextValue) => {
      if (element instanceof HTMLInputElement) {
        element.value = nextValue;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, value);
  });
  await locator.evaluate((element) => {
    if (element instanceof HTMLInputElement) {
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.blur();
    }
  });
}

async function clickQuantityPlus(input: ReturnType<Page['locator']>) {
  const wrapper = input.locator('xpath=ancestor::*[contains(@class,"ant-input-number-wrapper")][1]');
  const plus = wrapper.locator('[aria-label="plus"], .anticon-plus').last();
  if (!(await plus.isVisible().catch(() => false))) {
    throw new Error('数量输入框无法填入 1，且未找到数量加号。');
  }

  const currentValue = Number(await input.inputValue().catch(() => '0')) || 0;
  for (let count = currentValue; count < 1; count += 1) {
    await plus.click({ force: true });
  }
  const nextValue = await input.inputValue().catch(() => '');
  if (nextValue !== '1') {
    throw new Error(`数量设置为 1 失败，当前数量为：${nextValue || '空'}`);
  }
}

async function waitForSelectedQuantityAndPricing(page: Page) {
  const summary = page.locator('.order-select-models').first();
  await summary.waitFor({ state: 'visible', timeout: 10000 });
  let lastText = await waitForSelectedQuantityAndPricingWindow(page, summary, 10000);
  if (!lastText) {
    return;
  }

  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => undefined);
  await page.waitForTimeout(1000);
  lastText = await waitForSelectedQuantityAndPricingWindow(page, summary, 15000);
  if (!lastText) {
    return;
  }

  throw new Error(`价格栏未在 25 秒内更新为已选数量 1 并显示商品金额和运费：${lastText || '空文本'}`);
}

async function waitForSelectedQuantityAndPricingWindow(
  page: Page,
  summary: ReturnType<Page['locator']>,
  timeoutMs: number,
) {
  const deadline = Date.now() + timeoutMs;
  let lastText = '';
  while (Date.now() < deadline) {
    lastText = normalizeSpace((await summary.textContent().catch(() => null)) ?? '');
    const pricing = await extractOrderSummaryPricing(page);
    if (isSelectedQuantityOne(lastText) && pricing.itemPrice != null && pricing.shippingFee != null) {
      return '';
    }

    await page.waitForTimeout(500);
  }

  return lastText;
}

function isSelectedQuantityOne(text: string) {
  const quantityText = text.match(/已选\s*\d+\s*款\s*(\d+)(?=\D|$)/)?.[1];
  return quantityText === '1';
}

async function extractPricing(page: Page): Promise<PricingExtractionResult> {
  const summaryPricing = await extractOrderSummaryPricing(page);
  if (summaryPricing.itemPrice != null || summaryPricing.shippingFee != null) {
    return summaryPricing;
  }

  const priceText = await collectText(page, defaultDetailSelectors.priceTexts);
  const shippingText = await collectText(page, defaultDetailSelectors.shippingTexts);
  const discountText = await collectText(page, defaultDetailSelectors.discountTexts);
  return {
    itemPrice: extractMoney(priceText),
    shippingFee: extractShippingFee(shippingText),
    firstOrderDiscountText: extractFirstOrderDiscountText(discountText),
  };
}

async function extractOrderSummaryPricing(page: Page): Promise<PricingExtractionResult> {
  const summary = page.locator('.order-select-models').first();
  if (!(await summary.isVisible().catch(() => false))) {
    return {};
  }

  const itemPriceText =
    (await summary.locator('.total-price strong').first().textContent().catch(() => null)) ??
    (await summary.locator('.total-price').first().textContent().catch(() => null)) ??
    '';
  const shippingFeeText =
    (await summary.locator('.total-freight-fee strong').first().textContent().catch(() => null)) ??
    (await summary.locator('.total-freight-fee').first().textContent().catch(() => null)) ??
    '';

  return {
    itemPrice: extractMoney(itemPriceText),
    shippingFee: extractMoney(shippingFeeText),
  };
}

async function collectPageContextText(page: Page, selectedSku: SkuSnapshot) {
  const title = await page.title().catch(() => '');
  const attributes = await collectText(page, defaultDetailSelectors.attributeTexts);
  const shipping = await collectText(page, defaultDetailSelectors.shippingTexts);
  return normalizeSpace(
    [
      `商品标题：${title}`,
      `当前选中SKU：${selectedSku.skuName}`,
      `SKU图片：${selectedSku.skuImageUrl}`,
      `规格/属性/详情文本：${attributes}`,
      `物流/运费文本：${shipping}`,
    ].join('\n'),
  ).slice(0, 12000);
}

async function extractPackAttributes(page: Page, selectedSku: SkuSnapshot): Promise<AttributeExtractionResult> {
  const rows = await collectPackInfoRows(page);
  const matchedRow = findPackInfoRow(rows, selectedSku);
  if (!matchedRow) {
    return {
      weightSource: '未识别',
      weightConfidence: '低',
      reason: '商品件重尺表未匹配到当前 SKU',
    };
  }

  const rowMap = new Map(matchedRow.headers.map((header, index) => [normalizePackHeader(header), matchedRow.values[index] ?? '']));
  const lengthValue = getFirstPackValue(rowMap, ['长', '长cm', '长度', '长度cm']);
  const widthValue = getFirstPackValue(rowMap, ['宽', '宽cm', '宽度', '宽度cm']);
  const heightValue = getFirstPackValue(rowMap, ['高', '高cm', '高度', '高度cm']);
  const weightValue = getFirstPackValue(rowMap, ['重量g', '重量', '克重', '毛重g', '净重g']);
  const dimensions =
    lengthValue && widthValue && heightValue
      ? `${normalizeNumberText(lengthValue)}×${normalizeNumberText(widthValue)}×${normalizeNumberText(heightValue)}cm`
      : undefined;
  const weightGram = weightValue ? Number(normalizeNumberText(weightValue)) : undefined;

  return {
    dimensions,
    weightGram: Number.isFinite(weightGram) ? weightGram : undefined,
    weightSource: weightGram || dimensions ? '详情页' : '未识别',
    weightConfidence: weightGram || dimensions ? '高' : '低',
    reason: weightGram || dimensions ? '从商品件重尺表匹配当前 SKU' : '商品件重尺表未识别尺寸或重量字段',
  };
}

async function collectPackInfoRows(page: Page): Promise<PackInfoRow[]> {
  return await page
    .locator('.offer-pack-info-list table')
    .evaluateAll((tables) => {
      const normalize = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
      return tables.flatMap((table) => {
        const headers = Array.from(table.querySelectorAll('thead th')).map((cell) => normalize(cell.textContent));
        return Array.from(table.querySelectorAll('tbody tr')).map((row) => ({
          headers,
          values: Array.from(row.querySelectorAll('td')).map((cell) => normalize(cell.textContent)),
        }));
      });
    })
    .catch(() => []);
}

function findPackInfoRow(rows: PackInfoRow[], selectedSku: SkuSnapshot) {
  const skuParts = selectedSku.skuParts.map(normalizeComparableText).filter(Boolean);
  return rows.find((row) => {
    const rowText = normalizeComparableText(row.values.join(' '));
    return skuParts.some((part) => part && rowText.includes(part));
  });
}

function normalizePackHeader(value: string) {
  return value.replace(/[()\s（）]/g, '').replace(/厘米/g, 'cm').toLowerCase();
}

function getFirstPackValue(rowMap: Map<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = rowMap.get(normalizePackHeader(key));
    if (value) {
      return value;
    }
  }

  return '';
}

function normalizeNumberText(value: string) {
  return value.match(/\d+(?:\.\d+)?/)?.[0] ?? '';
}

async function collectText(page: Page, selectors: string[]) {
  const chunks: string[] = [];
  for (const selector of selectors) {
    const text = await page
      .locator(selector)
      .evaluateAll((nodes) => nodes.map((node) => node.textContent?.trim() ?? '').filter(Boolean).join('\n'))
      .catch(() => '');
    if (text) {
      chunks.push(text);
    }
  }

  return normalizeSpace(chunks.join('\n'));
}

function parseAttributesFromText(text: string): AttributeExtractionResult {
  const dimensions = extractDimensions(text);
  const weightGram = extractWeightGram(text);
  return {
    dimensions,
    weightGram,
    weightSource: weightGram ? '文本' : '未识别',
    weightConfidence: weightGram || dimensions ? '中' : '低',
    reason: weightGram || dimensions ? '程序从页面文本正则提取' : '程序未识别明确克重或尺寸',
  };
}

async function extractAttributesWithAi(
  options: OpenAICompatibleSimilarityOptions,
  pageContextText: string,
  selectedSku: SkuSnapshot,
): Promise<AttributeExtractionResult | null> {
  if (!options.baseUrl || !options.apiKey || !options.model) {
    return null;
  }

  const response = await fetchWithTimeout(
    buildOpenAICompatibleChatCompletionsUrl(options.baseUrl),
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: '你是 1688 商品详情页属性抽取器。只能根据用户提供的页面文本抽取，不允许猜测。',
          },
          {
            role: 'user',
            content: [
              `当前选中 SKU：${selectedSku.skuName}`,
              '请从下面页面文本中抽取当前 SKU 对应的商品尺寸和克重。',
              '只返回 JSON：{"dimensions":"例如20×15×8cm或空字符串","weightGram":数字或null,"weightSource":"属性|文本|详情页|物流/运费|未识别","weightConfidence":"高|中|低","reason":"简短中文原因"}。',
              '尺寸必须来自产品尺寸、包装尺寸、规格参数或明确描述；克重必须来自重量、毛重、净重、克重、物流重量等明确字段。',
              '如果文本不足以确定，dimensions 为空字符串，weightGram 为 null，weightSource 为“未识别”，不要猜。',
              pageContextText,
            ].join('\n\n'),
          },
        ],
      }),
    },
    attributeAiTimeoutMs,
  );

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  recordAttributeAiUsage(options.usage, (payload as { usage?: Parameters<typeof recordAttributeAiUsage>[1] }).usage);
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    return null;
  }

  const parsed = JSON.parse(content) as AttributeExtractionResult;
  return {
    dimensions: parsed.dimensions || undefined,
    weightGram: Number.isFinite(Number(parsed.weightGram)) ? Number(parsed.weightGram) : undefined,
    weightSource: parsed.weightSource,
    weightConfidence: parsed.weightConfidence,
    reason: parsed.reason || 'AI 从页面文本抽取',
  };
}

function extractMoney(text: string) {
  const match = text.match(/¥\s*(\d+(?:\.\d+)?)/) ?? text.match(/(?:价格|单价|现价)[^\d¥]{0,12}(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : undefined;
}

function extractShippingFee(text: string) {
  if (/包邮|免运费|运费\s*0/.test(text)) {
    return 0;
  }

  const match = text.match(/运费[^\d]{0,8}(\d+(?:\.\d+)?)/) ?? text.match(/快递[^\d]{0,8}(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : undefined;
}

function extractFirstOrderDiscountText(text: string) {
  return text.match(/.{0,12}(首单|新人|新客).{0,24}/)?.[0] ?? '';
}

function extractDimensions(text: string) {
  const labeledMatch = text.match(
    /(?:尺寸|规格|长宽高|包装尺寸|产品尺寸|商品尺寸|外箱尺寸)[^\d]{0,24}(\d+(?:\.\d+)?\s*(?:cm|厘米|mm|毫米|m|米)?\s*[x×*]\s*\d+(?:\.\d+)?\s*(?:cm|厘米|mm|毫米|m|米)?(?:\s*[x×*]\s*\d+(?:\.\d+)?\s*(?:cm|厘米|mm|毫米|m|米)?)?)/i,
  );
  if (labeledMatch) {
    return normalizeDimension(labeledMatch[1]);
  }

  const looseMatch = text.match(
    /\d+(?:\.\d+)?\s*(?:cm|厘米|mm|毫米|m|米)?\s*[x×*]\s*\d+(?:\.\d+)?\s*(?:cm|厘米|mm|毫米|m|米)?(?:\s*[x×*]\s*\d+(?:\.\d+)?\s*(?:cm|厘米|mm|毫米|m|米)?)?/i,
  );
  return looseMatch ? normalizeDimension(looseMatch[0]) : undefined;
}

function extractWeightGram(text: string) {
  const match = text.match(/(?:重量|毛重|净重|克重|物流重量|包装重量|商品重量)[^\d]{0,24}(\d+(?:\.\d+)?)\s*(kg|千克|公斤|g|克)/i);
  if (!match) {
    return undefined;
  }

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  return unit === 'kg' || unit === '千克' || unit === '公斤' ? Number((value * 1000).toFixed(2)) : value;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function normalizeDimension(value: string) {
  return normalizeSpace(value).replace(/[x*]/gi, '×');
}

function normalizeUrl(url: string) {
  if (url.startsWith('//')) {
    return `https:${url}`;
  }

  return url;
}

function normalizeSpace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeComparableText(value: string) {
  return normalizeSpace(value).replace(/[【】\\[\\]（）()\\s_-]/g, '').toLowerCase();
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException('任务已中断', 'AbortError');
  }
}
