import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, type BrowserContext, type Locator, type Page } from 'playwright-core';
import type { ProductItem, SupplierCandidate } from '../../shared/types';
import { assertAppChromeCdpOwnership, getOrCreateAppChromeContext } from './chromeSession';

export type ImageSearchAdapter = {
  searchByImage: (input: ImageSearchInput) => Promise<SupplierCandidate[]>;
};

export type ImageSearchInput = {
  item: ProductItem;
  imagePath: string;
  candidateLimit: number;
  acceptedCandidateLimit?: number;
  enableRealFactoryFilter?: boolean;
  enableStrengthFactoryFilter?: boolean;
  signal?: AbortSignal;
  appendLog?: (level: 'info' | 'warn' | 'error', message: string) => void;
};

export type Real1688AdapterOptions = {
  chromeMode: 'connect' | 'launch';
  chromeCdpUrl: string;
  chromeExecutablePath: string;
  chromeUserDataDir: string;
  imageSearchUrl: string;
  pageTimeoutMs: number;
  headless?: boolean;
  lowDisturbance?: boolean;
};

type SearchSelectors = {
  uploadInputs: string[];
  uploadPreviewContainers: string[];
  uploadReadyIndicators: string[];
  uploadSearchButtons: string[];
  resultCards: string[];
  resultCardRoots: string[];
  resultCandidateMarkers: string[];
  resultOfferLinks: string[];
  title: string[];
  supplier: string[];
  price: string[];
  moq: string[];
  image: string[];
};

const defaultSearchSelectors: SearchSelectors = {
  uploadInputs: [
    'input.image-file-reader-wrapper[type="file"][accept*=".jpg"]',
    'input.image-file-reader-wrapper[type="file"]',
    'input[type="file"][accept*="image"]',
    'input[type="file"][accept*=".jpg"]',
    'input[type="file"]',
  ],
  uploadPreviewContainers: [
    '.copy-image-container[data-scene="search"]',
    '.copy-image-container:has(.copy-image img)',
    '.copy-image-container',
  ],
  uploadReadyIndicators: [
    '.copy-image-container:has-text("已上传")',
    '.copy-image-container .desc:has-text("已上传")',
  ],
  uploadSearchButtons: [
    '.copy-image-container div.search-btn',
    '.copy-image-container .search-btn',
    '.copy-image-container .search-btn[data-scene="search"]',
    '.copy-image-container .search-btn[data-tracker="pasteImagePreview"]',
    '.copy-image-container .search-btn:has-text("搜索图片")',
    '.copy-image-container [data-scene="search"]:has-text("搜索图片")',
    '.copy-image-container div:has-text("搜索图片")',
    'div.search-btn:has-text("搜索图片")',
    'text=搜索图片',
  ],
  resultCards: [
    '#offer-list-content [data-tracker="offer"][data-index]',
    '#offer-list-content [data-splus-logkey*="offerlist.offer"][data-index]',
    '#offer-list-content [class*="searchOfferWrapper"][data-index]',
    'a[href*="detail.1688.com/offer/"]',
    'a[href*="/offer/"][href*=".html"]',
    '[data-offer-id]',
  ],
  resultCardRoots: [
    '#offer-list-content [data-tracker="offer"][data-index]',
    '#offer-list-content [data-splus-logkey*="offerlist.offer"][data-index]',
    '#offer-list-content [class*="searchOfferWrapper"][data-index]',
  ],
  resultCandidateMarkers: [
    '#offer-list-content [data-renderkey*="_"]',
    '#offer-list-content [data-aplus-report*="object_id@"]',
    '#offer-list-content a[href*="offerId="]',
    '#offer-list-content a[href*="offerId%3D"]',
  ],
  resultOfferLinks: [
    'a[href*="detail.1688.com/offer/"]',
    'a[href*="/offer/"][href*=".html"]',
    'a[href*="offerId="]',
    'a[href*="offerId%3D"]',
  ],
  title: [
    '[title]',
    '.title',
    '.offer-title',
    '.name',
  ],
  supplier: [
    '.company',
    '.supplier',
    '.shop-name',
    '[class*="company"]',
    '[class*="supplier"]',
  ],
  price: [
    '[class*="price"]',
    '.price',
  ],
  moq: [
    '[class*="moq"]',
    '[class*="quantity"]',
  ],
  image: [
    'img',
  ],
};

export function createMockImageSearchAdapter(): ImageSearchAdapter {
  return {
    async searchByImage(input) {
      const limit = Math.max(0, input.candidateLimit);
      if (limit === 0) {
        return [];
      }

      return Array.from({ length: limit }, (_, index) => createMockCandidate(input, index));
    },
  };
}

export function createReal1688ImageSearchAdapter(options: Real1688AdapterOptions): ImageSearchAdapter {
  return {
    async searchByImage(input) {
      throwIfAborted(input.signal);
      const browserSession = await openBrowserSession(options);
      const page = await browserSession.context.newPage();
      let resultPage: Page | null = null;

      try {
        page.setDefaultTimeout(options.pageTimeoutMs);
        await page.goto(options.imageSearchUrl, { waitUntil: 'domcontentloaded' });
        throwIfAborted(input.signal);
        await uploadImage(page, input.imagePath, options.pageTimeoutMs);
        throwIfAborted(input.signal);
        resultPage = await triggerUploadedImageSearch(page, options.pageTimeoutMs);
        throwIfAborted(input.signal);
        await resultPage.waitForLoadState('domcontentloaded', { timeout: options.pageTimeoutMs }).catch(() => undefined);
        await resultPage.waitForLoadState('networkidle', { timeout: Math.min(5000, options.pageTimeoutMs) }).catch(() => undefined);
        await ensurePageEvaluateHelpers(resultPage);
        const baselineCandidates = await parseCandidates(resultPage, input.item, input.candidateLimit).catch(() => []);
        const activeCertificationFilters = await apply1688CertificationFilters(resultPage, {
          enableRealFactoryFilter: input.enableRealFactoryFilter,
          enableStrengthFactoryFilter: input.enableStrengthFactoryFilter,
          timeoutMs: options.pageTimeoutMs,
          appendLog: input.appendLog,
          rowIndex: input.item.rowIndex,
        });
        throwIfAborted(input.signal);
        const candidates = await waitForParsedCandidates(
          resultPage,
          input.item,
          input.candidateLimit,
          options.pageTimeoutMs,
          input.signal,
        );
        const minimumExpectedCandidates = Math.max(1, Math.min(input.acceptedCandidateLimit ?? 1, input.candidateLimit));
        if (activeCertificationFilters.length > 0 && baselineCandidates.length > candidates.length && candidates.length < minimumExpectedCandidates) {
          input.appendLog?.(
            'warn',
            `第 ${input.item.rowIndex} 行认证筛选后候选不足：${candidates.length}/${minimumExpectedCandidates}，自动放宽认证筛选并使用未筛选候选。`,
          );
          for (const candidate of baselineCandidates) {
            candidate.riskFlags.push(`1688认证筛选候选不足，已自动放宽：${activeCertificationFilters.join('、')}`);
          }
          return baselineCandidates;
        }
        if (activeCertificationFilters.length > 0) {
          for (const candidate of candidates) {
            candidate.riskFlags.push(`1688认证筛选已启用：${activeCertificationFilters.join('、')}`);
          }
        }
        input.appendLog?.(
          'info',
          `第 ${input.item.rowIndex} 行结果页候选解析完成：${candidates.length} 个候选，前 3 个链接：${candidates
            .slice(0, 3)
            .map((candidate) => candidate.offerUrl)
            .join('、') || '无'}`,
        );

        if (candidates.length === 0) {
          const pageDebug = await getResultPageTimeoutDebug(resultPage);
          throw new Error(`1688 页面已加载，但未解析到候选卡片；需要确认结果卡片 DOM 结构。${pageDebug}`);
        }

        return candidates;
      } finally {
        await closeSearchPages(page, resultPage);
        await browserSession.close();
      }
    },
  };
}

async function openBrowserSession(options: Real1688AdapterOptions): Promise<{
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
    return {
      context,
      close: async () => {
        disconnectCdpBrowser(browser);
      },
    };
  }

  if (!options.chromeExecutablePath) {
    throw new Error('真实 1688 模式需要 Chrome 可执行文件路径。请先在 AI比价配置中选择 Chrome。');
  }

  if (!options.chromeUserDataDir) {
    throw new Error('应用独立 Chrome 缺少内部用户数据目录。');
  }

  const context = await getOrCreateAppChromeContext({
    ...options,
    headless: options.headless ?? false,
    lowDisturbance: options.lowDisturbance ?? false,
  });

  return {
    context,
    close: async () => undefined,
  };
}

async function apply1688CertificationFilters(
  page: Page,
  input: {
    enableRealFactoryFilter?: boolean;
    enableStrengthFactoryFilter?: boolean;
    timeoutMs: number;
    appendLog?: ImageSearchInput['appendLog'];
    rowIndex: number;
  },
) {
  const requestedLabels = [
    input.enableRealFactoryFilter ? '真实工厂认证' : '',
    input.enableStrengthFactoryFilter ? '实力认证' : '',
  ].filter(Boolean);
  const appliedLabels: string[] = [];

  for (const label of requestedLabels) {
    const clicked = await click1688FilterByText(page, label, Math.min(5000, input.timeoutMs)).catch(() => false);
    if (clicked) {
      appliedLabels.push(label);
      input.appendLog?.('info', `第 ${input.rowIndex} 行已尝试启用 1688 筛选：${label}`);
      await page.waitForLoadState('networkidle', { timeout: Math.min(5000, input.timeoutMs) }).catch(() => undefined);
      await page.waitForTimeout(800).catch(() => undefined);
    } else {
      input.appendLog?.('warn', `第 ${input.rowIndex} 行未找到 1688 筛选项：${label}，将继续使用未筛选候选并写入风险。`);
    }
  }

  return appliedLabels;
}

async function click1688FilterByText(page: Page, label: string, timeoutMs: number) {
  const escapedLabel = label.replace(/["\\]/g, '\\$&');
  const selectors = [
    `text="${escapedLabel}"`,
    `label:has-text("${escapedLabel}")`,
    `button:has-text("${escapedLabel}")`,
    `[role="button"]:has-text("${escapedLabel}")`,
    `span:has-text("${escapedLabel}")`,
    `div:has-text("${escapedLabel}")`,
  ];

  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    const visible = await locator.isVisible({ timeout: timeoutMs }).catch(() => false);
    if (!visible) {
      continue;
    }

    await locator.scrollIntoViewIfNeeded().catch(() => undefined);
    await locator.click({ timeout: Math.min(3000, timeoutMs) }).catch(async () => {
      await dispatchDomClick(locator);
    });
    return true;
  }

  return false;
}

async function connectOverCdp(chromeCdpUrl: string) {
  try {
    return await chromium.connectOverCDP(chromeCdpUrl);
  } catch (error) {
    throw new Error(
      [
        `无法连接当前 Chrome 调试端口：${chromeCdpUrl}`,
        'Playwright 不能直接接管一个普通启动的 Chrome；当前 Chrome 必须开启远程调试端口后，才能在其中新开页签执行。',
        'macOS 示例：open -na "Google Chrome" --args --remote-debugging-port=9222',
        `原始错误：${error instanceof Error ? error.message : String(error)}`,
      ].join('\n'),
    );
  }
}

function disconnectCdpBrowser(browser: Awaited<ReturnType<typeof chromium.connectOverCDP>>) {
  const maybeDisconnect = (browser as unknown as { disconnect?: () => void }).disconnect;
  if (typeof maybeDisconnect === 'function') {
    maybeDisconnect.call(browser);
  }
}

async function uploadImage(page: Page, imagePath: string, timeoutMs: number) {
  await assertReadableImage(imagePath);

  const selector = await waitForAnySelector(page, defaultSearchSelectors.uploadInputs, timeoutMs).catch(() => null);
  if (!selector) {
    throw new Error(
      `未找到 1688 识图上传控件。已尝试选择器：${defaultSearchSelectors.uploadInputs.join('、')}。需要确认页面 DOM。`,
    );
  }

  const input = page.locator(selector).first();
  await setUploadInputFiles(input, imagePath);

  await waitForAnySelector(page, defaultSearchSelectors.uploadPreviewContainers, Math.min(8000, timeoutMs), 'visible')
    .catch(() => uploadWithFileChooser(input, imagePath, timeoutMs));
}

async function triggerUploadedImageSearch(page: Page, timeoutMs: number) {
  await waitForAnySelector(page, defaultSearchSelectors.uploadPreviewContainers, timeoutMs, 'visible').catch(() => {
    throw new Error(
      `图片已写入上传控件，但未出现上传预览弹窗。已尝试选择器：${defaultSearchSelectors.uploadPreviewContainers.join('、')}。需要确认上传后 DOM。`,
    );
  });
  await waitForAnySelector(
    page,
    defaultSearchSelectors.uploadReadyIndicators,
    Math.min(5000, timeoutMs),
    'visible',
  ).catch(() => undefined);

  const searchButton = await findFirstVisibleLocator(
    page,
    defaultSearchSelectors.uploadSearchButtons,
    Math.min(5000, timeoutMs),
  );

  if (!searchButton) {
    throw new Error(
      `已出现上传预览弹窗，但未找到“搜索图片”按钮。已尝试选择器：${defaultSearchSelectors.uploadSearchButtons.join('、')}。需要确认弹窗 DOM。`,
    );
  }

  const clickTimeoutMs = Math.min(8000, timeoutMs);
  const errors: string[] = [];
  const clickAttempts: Array<{
    name: string;
    action: () => Promise<void>;
  }> = [
    {
      name: '普通点击',
      action: async () => {
        await searchButton.click({ timeout: clickTimeoutMs });
      },
    },
    {
      name: '强制点击',
      action: async () => {
        await searchButton.click({ force: true, timeout: clickTimeoutMs });
      },
    },
    {
      name: '坐标点击',
      action: async () => {
        await clickLocatorCenter(page, searchButton);
      },
    },
    {
      name: 'DOM 事件点击',
      action: async () => {
        await dispatchDomClick(searchButton);
      },
    },
  ];

  for (const attempt of clickAttempts) {
    const resultPage = await clickAndWaitForResultPage(page, attempt.action, Math.min(10000, timeoutMs)).catch((error) => {
      errors.push(`${attempt.name}失败：${error instanceof Error ? error.message : String(error)}`);
      return null;
    });

    if (resultPage) {
      return resultPage;
    }

    errors.push(`${attempt.name}后未检测到结果页或当前页跳转`);
  }

  throw new Error(
    [
      '已出现“已上传1张图片”弹窗，但点击“搜索图片”后未检测到结果页打开或当前页跳转。',
      `已尝试按钮选择器：${defaultSearchSelectors.uploadSearchButtons.join('、')}。`,
      ...errors,
    ].join('\n'),
  );
}

async function clickAndWaitForResultPage(page: Page, clickAction: () => Promise<void>, timeoutMs: number) {
  const initialUrl = page.url();
  const resultPagePromise = firstResolvedPage(
    [
      page.waitForEvent('popup', { timeout: timeoutMs }),
      page
        .waitForURL((url) => url.toString() !== initialUrl, {
          waitUntil: 'domcontentloaded',
          timeout: timeoutMs,
        })
        .then(() => page),
      waitForAnySelector(page, defaultSearchSelectors.resultCardRoots, timeoutMs, 'attached', '1688 搜图结果页候选解析阶段').then(
        () => page,
      ),
    ],
    timeoutMs,
  );

  await clickAction();
  return await resultPagePromise;
}

async function firstResolvedPage(promises: Array<Promise<Page | null>>, timeoutMs: number) {
  return await new Promise<Page | null>((resolve) => {
    let pendingCount = promises.length;
    const timer = setTimeout(() => resolve(null), timeoutMs);

    const settleEmpty = () => {
      pendingCount -= 1;
      if (pendingCount === 0) {
        clearTimeout(timer);
        resolve(null);
      }
    };

    for (const promise of promises) {
      promise
        .then((resultPage) => {
          if (resultPage) {
            clearTimeout(timer);
            resolve(resultPage);
            return;
          }

          settleEmpty();
        })
        .catch(settleEmpty);
    }
  });
}

async function clickLocatorCenter(page: Page, locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error('无法获取“搜索图片”按钮坐标');
  }

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.up();
}

async function dispatchDomClick(locator: Locator) {
  await locator.evaluate((element) => {
    element.scrollIntoView({ block: 'center', inline: 'center' });
    const events = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
    for (const eventName of events) {
      element.dispatchEvent(
        new MouseEvent(eventName, {
          bubbles: true,
          cancelable: true,
          view: window,
        }),
      );
    }
  });
}

async function assertReadableImage(imagePath: string) {
  try {
    const file = await fs.stat(imagePath);
    if (!file.isFile()) {
      throw new Error('不是文件');
    }
  } catch (error) {
    throw new Error(`待上传图片不可读取：${imagePath}。${error instanceof Error ? error.message : String(error)}`);
  }
}

async function setUploadInputFiles(input: Locator, imagePath: string) {
  await input.setInputFiles(imagePath);
  await input.evaluate((element) => {
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function uploadWithFileChooser(input: Locator, imagePath: string, timeoutMs: number) {
  const page = input.page();
  const fileChooserPromise = page.waitForEvent('filechooser', { timeout: timeoutMs });
  await input.click({ force: true });
  const fileChooser = await fileChooserPromise.catch((error) => {
    throw new Error(
      [
        '图片已写入上传控件，但未出现上传预览弹窗；随后尝试点击上传控件触发文件选择，也没有捕获到文件选择事件。',
        `原始错误：${error instanceof Error ? error.message : String(error)}`,
      ].join('\n'),
    );
  });

  await fileChooser.setFiles(imagePath);
  await setUploadInputFiles(input, imagePath);
}

async function closeSearchPages(entryPage: Page, resultPage: Page | null) {
  const pages = new Set<Page>([entryPage]);
  if (resultPage) {
    pages.add(resultPage);
  }

  await Promise.all(Array.from(pages).map((page) => page.close().catch(() => undefined)));
}

async function waitForAnySelector(
  page: Page,
  selectors: string[],
  timeoutMs: number,
  state: 'attached' | 'visible' = 'attached',
  stageName = '页面 DOM 等待阶段',
) {
  const match = await findFirstSelectorMatch(page, selectors, timeoutMs, state);
  if (match) {
    return match.selector;
  }

  const pageDebug = stageName.includes('候选解析') ? await getResultPageTimeoutDebug(page) : '';
  throw new Error(`${stageName}超时，等待 ${timeoutMs}ms。${pageDebug}已尝试选择器：${selectors.join('、')}。需要确认页面 DOM。`);
}

async function waitForParsedCandidates(
  page: Page,
  item: ProductItem,
  candidateLimit: number,
  timeoutMs: number,
  signal?: AbortSignal,
) {
  const startedAt = Date.now();
  let lastCandidates: SupplierCandidate[] = [];
  let lastDebug = '';
  await ensurePageEvaluateHelpers(page);

  while (Date.now() - startedAt < timeoutMs) {
    throwIfAborted(signal);
    await waitForAnySelector(
      page,
      [...defaultSearchSelectors.resultCandidateMarkers, ...defaultSearchSelectors.resultCardRoots],
      Math.min(3000, Math.max(500, timeoutMs - (Date.now() - startedAt))),
      'attached',
      '1688 搜图结果页候选解析阶段',
    ).catch(() => undefined);

    let parseErrorDebug = '';
    try {
      lastCandidates = await parseCandidates(page, item, candidateLimit);
    } catch (error) {
      lastDebug = `候选解析函数异常：${error instanceof Error ? error.message : String(error)}。${
        await getResultPageTimeoutDebug(page).catch(() => '')
      }`;
      parseErrorDebug = `parseCandidates error: ${error instanceof Error ? error.message : String(error)}. `;
      lastCandidates = [];
    }
    if (lastCandidates.length > 0) {
      return lastCandidates;
    }

    lastDebug = `${parseErrorDebug}${await getResultPageTimeoutDebug(page).catch(() => '')}`;
    await page.waitForTimeout(500);
  }

  const debug = lastDebug || (await getResultPageTimeoutDebug(page).catch(() => ''));
  throw new Error(
    `1688 搜图结果页候选解析阶段超时，等待 ${timeoutMs}ms。已出现结果页但未解析出候选详情链接。最后解析候选数：${lastCandidates.length}。${debug}`,
  );
}

async function ensurePageEvaluateHelpers(page: Page) {
  await page.evaluate('globalThis.__name = globalThis.__name || ((target) => target)').catch(() => undefined);
}

async function getResultPageTimeoutDebug(page: Page) {
  const currentUrl = page.url();
  const title = await page.title().catch(() => '');
  const links = await extractOfferLinksFromPage(page, 3).catch(() => []);
  const cardCount = await countResultCards(page).catch(() => 0);
  const bodyText = await getPageBodyTextSnippet(page).catch(() => '');
  const linkText =
    links.length > 0 ? `页面中已发现候选详情页链接：${links.join('、')}。` : '页面中暂未发现候选详情页链接。';
  const cardText = `候选卡片数量：${cardCount}。`;
  const pageStateText = getLikelyPageStateText(bodyText);
  const titleText = title ? `页面标题：${title}。` : '';
  const bodyTextMessage = bodyText ? `页面文本摘要：${bodyText}。` : '';
  return `当前页：${currentUrl}。${titleText}${pageStateText}${cardText}${linkText}${bodyTextMessage}`;
}

async function countResultCards(page: Page) {
  return await page.evaluate((selectors) => {
    return selectors.reduce((count, selector) => Math.max(count, document.querySelectorAll(selector).length), 0);
  }, defaultSearchSelectors.resultCardRoots);
}

async function getPageBodyTextSnippet(page: Page) {
  return await page.evaluate(() => {
    const markerCount = {
      renderkey: document.querySelectorAll('#offer-list-content [data-renderkey]').length,
      aplusObjectId: document.querySelectorAll('#offer-list-content [data-aplus-report*="object_id@"]').length,
      offerIdLinks: document.querySelectorAll('#offer-list-content a[href*="offerId="], #offer-list-content a[href*="offerId%3D"]').length,
    };
    const firstCard = document.querySelector('#offer-list-content [data-index]');
    const firstCardDebug = firstCard
      ? {
          index: firstCard.getAttribute('data-index') || '',
          renderkey: firstCard.getAttribute('data-renderkey') || '',
          aplusSnippet: (firstCard.getAttribute('data-aplus-report') || '').slice(0, 260),
          offerIdHrefs: Array.from(firstCard.querySelectorAll('a[href*="offerId="], a[href*="offerId%3D"]'))
            .slice(0, 2)
            .map((anchor) => anchor.getAttribute('href') || ''),
          htmlSnippet: firstCard.outerHTML.slice(0, 500),
        }
      : null;
    const text = document.body?.innerText?.replace(/\s+/g, ' ').trim() ?? '';
    return `[candidate-debug ${JSON.stringify({ markerCount, firstCardDebug }).slice(0, 1200)}] ${text}`.slice(0, 1600);
  });
}

function getLikelyPageStateText(bodyText: string) {
  if (!bodyText) {
    return '页面正文为空或尚未渲染。';
  }

  if (/验证码|安全验证|滑块|验证|人机|captcha/i.test(bodyText)) {
    return '疑似命中验证码/安全验证页面。';
  }

  if (/登录|请登录|账号|密码|扫码/i.test(bodyText)) {
    return '疑似命中登录态/登录页面。';
  }

  if (/没有找到|暂无结果|无搜索结果|换个图片|重新上传/i.test(bodyText)) {
    return '疑似搜图无结果或页面提示重新上传。';
  }

  return '';
}

async function extractOfferLinksFromPage(page: Page, limit: number) {
  return await page.evaluate((maxCount) => {
    function normalizeUrl(href: string) {
      if (!href) {
        return '';
      }
      if (href.startsWith('//')) {
        return `https:${href}`;
      }
      if (href.startsWith('/offer/')) {
        return `https://detail.1688.com${href}`;
      }
      return href;
    }

    function detailUrlFromHref(href: string) {
      const normalizedHref = normalizeUrl(href);
      const offerUrl = offerUrlFromText(normalizedHref);
      return offerUrl || normalizedHref;
    }

    function offerIdFromText(text: string) {
      const decodedText = text
        .replace(/&quot;/g, '"')
        .replace(/&#34;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/\\u0026/g, '&')
        .replace(/%22/g, '"')
        .replace(/%3A/gi, ':')
        .replace(/%3D/gi, '=');
      return (
        offerIdFromUrl(text) ||
        offerIdFromUrl(decodedText) ||
        decodedText.match(/object_id@(\d{10,})/)?.[1] ||
        decodedText.match(/data-renderkey=["'][^"']*_(\d{10,})["']/)?.[1] ||
        decodedText.match(/(?:^|[\s"'])\d+_\d+_[a-z0-9]+_[^_\s"']+_(\d{10,})(?:[\s"']|$)/i)?.[1] ||
        decodedText.match(/offer\/(\d{10,}|[a-zA-Z0-9]+)\.html/)?.[1] ||
        decodedText.match(/["']?offerId["']?\s*[:=@]\s*["']?(\d{10,})/)?.[1] ||
        decodedText.match(/["']?offer_id["']?\s*[:=@]\s*["']?(\d{10,})/i)?.[1] ||
        decodedText.match(/offerId=(\d{10,})/)?.[1] ||
        text.match(/offerId%3D(\d{10,})/i)?.[1] ||
        decodedText.match(/(?:offer|offerid|object|item|id)[^0-9]{0,20}(\d{10,})/i)?.[1] ||
        decodedText.match(/(?:^|[_-])(\d{10,})(?:["'_\s<>&]|$)/)?.[1] ||
        ''
      );
    }

    function offerUrlFromText(text: string) {
      const offerId = offerIdFromText(text);
      return offerId ? `https://detail.1688.com/offer/${offerId}.html` : '';
    }

    function offerIdFromUrl(value: string) {
      try {
        return new URL(value, window.location.href).searchParams.get('offerId') ?? '';
      } catch {
        return '';
      }
    }

    const links = new Set<string>();

    for (const anchor of Array.from(
      document.querySelectorAll('a[href*="detail.1688.com/offer/"], a[href*="/offer/"][href*=".html"], a[href*="offerId="], a[href*="offerId%3D"]'),
    )) {
      const href = detailUrlFromHref(anchor.getAttribute('href') || '');
      if (href) {
        links.add(href);
      }
      if (links.size >= maxCount) {
        return Array.from(links);
      }
    }

    for (const node of Array.from(document.querySelectorAll('[data-offer-id], [data-renderkey]'))) {
      const offerId = node.getAttribute('data-offer-id')?.trim() || offerIdFromText(node.getAttribute('data-renderkey') || '');
      if (offerId) {
        links.add(`https://detail.1688.com/offer/${offerId}.html`);
      }
      if (links.size >= maxCount) {
        return Array.from(links);
      }
    }

    for (const node of Array.from(document.querySelectorAll('[data-aplus-report], [data-splus-exp-url], [data-renderkey]'))) {
      const text = [
        node.getAttribute('data-aplus-report') || '',
        node.getAttribute('data-splus-exp-url') || '',
        node.getAttribute('data-renderkey') || '',
      ].join(' ');
      const offerUrl = offerUrlFromText(text);
      if (offerUrl) {
        links.add(offerUrl);
      }
      if (links.size >= maxCount) {
        return Array.from(links);
      }
    }

    for (const node of Array.from(document.querySelectorAll('#offer-list-content [data-index]'))) {
      const text = [
        node.getAttribute('data-aplus-report') || '',
        node.getAttribute('data-splus-exp-url') || '',
        node.getAttribute('data-renderkey') || '',
        node.outerHTML.slice(0, 8000),
      ].join(' ');
      const offerUrl = offerUrlFromText(text);
      if (offerUrl) {
        links.add(offerUrl);
      }
      if (links.size >= maxCount) {
        return Array.from(links);
      }
    }

    return Array.from(links);
  }, limit);
}

async function findFirstVisibleLocator(page: Page, selectors: string[], timeoutMs: number) {
  const match = await findFirstSelectorMatch(page, selectors, timeoutMs, 'visible');
  return match?.locator ?? null;
}

async function findFirstSelectorMatch(
  page: Page,
  selectors: string[],
  timeoutMs: number,
  state: 'attached' | 'visible',
) {
  return await new Promise<{ selector: string; locator: Locator } | null>((resolve) => {
    let settled = false;
    let pendingCount = selectors.length;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, timeoutMs);

    const settleEmpty = () => {
      pendingCount -= 1;
      if (pendingCount === 0 && !settled) {
        settled = true;
        clearTimeout(timer);
        resolve(null);
      }
    };

    for (const selector of selectors) {
      const locator = page.locator(selector).first();
      locator
        .waitFor({ state, timeout: timeoutMs })
        .then(() => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve({ selector, locator });
          }
        })
        .catch(settleEmpty);
    }
  });
}

async function parseCandidates(page: Page, item: ProductItem, candidateLimit: number): Promise<SupplierCandidate[]> {
  const rawCandidates = await page.evaluate(
    ({ selectors, limit }) => {
      function textFrom(root: Element, selectorList: string[]) {
        for (const selector of selectorList) {
          const node = root.querySelector(selector);
          const text = node?.textContent?.trim();
          if (text) {
            return text;
          }

          const title = node?.getAttribute('title')?.trim();
          if (title) {
            return title;
          }
        }

        return '';
      }

      function attrFrom(root: Element, selectorList: string[], attr: string) {
        for (const selector of selectorList) {
          const node = root.querySelector(selector);
          const value = node?.getAttribute(attr)?.trim();
          if (value) {
            return value;
          }
        }

        return '';
      }

      function findCardRoot(anchor: Element) {
        return (
          anchor.closest('[data-offer-id]') ??
          anchor.closest('[class*="card"]') ??
          anchor.closest('[class*="item"]') ??
          anchor.closest('li') ??
          anchor
        );
      }

      function normalizeImageUrl(url: string) {
        const normalizedUrl = normalizeUrl(url);
        return normalizedUrl.replace(/_(?:\d+x\d+q\d+|sum)\.[a-z0-9]+_?\.(?:webp|jpg|jpeg|png)$/i, '');
      }

      function normalizeUrl(href: string) {
        if (!href) {
          return '';
        }
        if (href.startsWith('//')) {
          return `https:${href}`;
        }
        return href;
      }

      function offerIdFromText(text: string) {
        const decodedText = text
          .replace(/&quot;/g, '"')
          .replace(/&#34;/g, '"')
          .replace(/&amp;/g, '&')
          .replace(/\\u0026/g, '&')
          .replace(/%22/g, '"')
          .replace(/%3A/gi, ':')
          .replace(/%3D/gi, '=');
        const urlOfferId = offerIdFromUrl(text);
        return (
          urlOfferId ||
          offerIdFromUrl(decodedText) ||
          decodedText.match(/object_id@(\d{10,})/)?.[1] ||
          decodedText.match(/data-renderkey=["'][^"']*_(\d{10,})["']/)?.[1] ||
          decodedText.match(/(?:^|[\s"'])\d+_\d+_[a-z0-9]+_[^_\s"']+_(\d{10,})(?:[\s"']|$)/i)?.[1] ||
          decodedText.match(/["']?offerId["']?\s*[:=@]\s*["']?(\d{10,})/)?.[1] ||
          decodedText.match(/["']?offer_id["']?\s*[:=@]\s*["']?(\d{10,})/i)?.[1] ||
          decodedText.match(/offerId=(\d{10,})/)?.[1] ||
          text.match(/offerId%3D(\d{10,})/i)?.[1] ||
          decodedText.match(/offer\/(\d{10,}|[a-zA-Z0-9]+)\.html/)?.[1] ||
          decodedText.match(/(?:offer|offerid|object|item|id)[^0-9]{0,20}(\d{10,})/i)?.[1] ||
          decodedText.match(/(?:^|[_-])(\d{10,})(?:["'_\s<>&]|$)/)?.[1] ||
          ''
        );
      }

      function offerIdFromUrl(value: string) {
        try {
          return new URL(value, window.location.href).searchParams.get('offerId') ?? '';
        } catch {
          return '';
        }
      }

      function offerUrlFromRoot(root: Element, offerId: string) {
        const anchor = root.matches('a[href]')
          ? root
          : root.querySelector(
          'a[href*="detail.1688.com/offer/"], a[href*="/offer/"][href*=".html"], a[href*="offerId="], a[href*="offerId%3D"]',
        );
        const href = normalizeUrl(anchor?.getAttribute('href') || '');
        const hrefOfferId = offerIdFromText(href);
        if (hrefOfferId) {
          return `https://detail.1688.com/offer/${hrefOfferId}.html`;
        }

        if (href && href.includes('detail.1688.com/offer/')) {
          return href;
        }

        return offerId ? `https://detail.1688.com/offer/${offerId}.html` : '';
      }

      function imageFromRoot(root: Element) {
        const image =
          root.querySelector('img[class*="mainImg"]') ??
          root.querySelector('.offerImgWrapper img') ??
          root.querySelector('img[src*="alicdn.com/img/ibank"]') ??
          root.querySelector('img');
        return normalizeImageUrl(
          image?.getAttribute('src') ||
            image?.getAttribute('data-src') ||
            image?.getAttribute('data-lazy-src') ||
            '',
        );
      }

      function salesTextFromRoot(root: Element) {
        const text = root.textContent?.replace(/\s+/g, ' ').trim() ?? '';
        return (
          text.match(/(?:已售|成交|销量|售出|月销)?\s*\d+(?:\.\d+)?\s*万?\+?\s*(?:件|个|单|笔)/)?.[0]?.trim() ||
          ''
        );
      }

      function pluginExtraTextFromRoot(root: Element) {
        const plugin =
          root.querySelector('.plugin-offer-search-card.offer-item-extra') ??
          root.querySelector('.plugin-offer-search-card') ??
          root.querySelector('[class*="offer-item-extra"]');
        return plugin?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      }

      function metricTextFromRoot(root: Element, label: string) {
        const text = [pluginExtraTextFromRoot(root), root.textContent?.replace(/\s+/g, ' ').trim() ?? '']
          .filter(Boolean)
          .join(' ');
        const index = text.indexOf(label);
        if (index < 0) {
          return '';
        }
        const tail = text.slice(index + label.length).replace(/^[:：\s]*/, '');
        return tail.match(/[-\d,.万+以内]+(?:件(?:[（(]\d+笔[）)])?|个|单|笔)?/)?.[0]?.trim() ?? '';
      }

      const cardRoots = Array.from(
        document.querySelectorAll(
          '#offer-list-content [data-tracker="offer"][data-index], #offer-list-content [data-splus-logkey*="offerlist.offer"][data-index], #offer-list-content [class*="searchOfferWrapper"][data-index], #offer-list-content [data-index]',
        ),
      ).filter((root) => {
        const text = root.textContent || '';
        return /¥|起批|件|个|运费|回头率|先采后付/.test(text) || root.querySelector('img');
      });
      const roots =
        cardRoots.length > 0
          ? cardRoots
          : Array.from(document.querySelectorAll('a[href*="offer"], a[href*="offerId="], a[href*="offerId%3D"]')).map((anchor) =>
              findCardRoot(anchor),
            );
      const seen = new Set<string>();
      const result = [];

      for (const root of roots) {
        const anchor =
          root.matches('a[href]')
            ? root
            : root.querySelector(
                'a[href*="detail.1688.com/offer/"], a[href*="/offer/"][href*=".html"], a[href*="offerId="], a[href*="offerId%3D"]',
              );
        const anchorHref = anchor?.getAttribute('href') || '';
        const reportText = [
          root.getAttribute('data-aplus-report') || '',
          root.getAttribute('data-splus-exp-url') || '',
          root.getAttribute('data-renderkey') || '',
          anchorHref,
          root.outerHTML.slice(0, 8000),
        ].join(' ');
        const offerId =
          root.getAttribute('data-offer-id') ||
          root.querySelector('[data-offer-id]')?.getAttribute('data-offer-id') ||
          (root.getAttribute('data-renderkey') || '').match(/_(\d{8,})$/)?.[1] ||
          (root.getAttribute('data-aplus-report') || '').match(/object_id@(\d{8,})/)?.[1] ||
          anchorHref.match(/[?&]offerId=(\d{8,})/)?.[1] ||
          root.outerHTML.match(/[?&](?:amp;)?offerId=(\d{8,})/)?.[1] ||
          offerIdFromText(reportText);
        const href = offerUrlFromRoot(root, offerId || '');

        if (!href || !offerId || seen.has(offerId)) {
          continue;
        }

        seen.add(offerId);
        result.push({
          offerUrl: href,
          offerId,
          title: textFrom(root, ['[class*="titleText"]', '[class*="offerTitleRow"]', ...selectors.title]),
          supplier: textFrom(root, selectors.supplier),
          priceText: textFrom(root, selectors.price),
          moqText: textFrom(root, selectors.moq),
          salesText: salesTextFromRoot(root),
          annualSalesText: metricTextFromRoot(root, '年销量'),
          monthlyDistributionText: metricTextFromRoot(root, '月代销'),
          pluginExtraText: pluginExtraTextFromRoot(root),
          imageUrl: imageFromRoot(root) || attrFrom(root, selectors.image, 'src') || attrFrom(root, selectors.image, 'data-src'),
        });

        if (result.length >= limit) {
          break;
        }
      }

      return result;
    },
    { selectors: defaultSearchSelectors, limit: candidateLimit },
  );
  const effectiveCandidates = rawCandidates.length > 0
    ? rawCandidates
    : await parseSimpleResultCards(page, candidateLimit);

  return effectiveCandidates.map((candidate, index) =>
    normalizeRealCandidate({
      item,
      index,
      offerUrl: candidate.offerUrl,
      offerId: candidate.offerId,
      title: candidate.title,
      supplier: candidate.supplier,
      priceText: candidate.priceText,
      moqText: candidate.moqText,
      salesText: candidate.salesText,
      annualSalesText: candidate.annualSalesText,
      monthlyDistributionText: candidate.monthlyDistributionText,
      pluginExtraText: candidate.pluginExtraText,
      imageUrl: candidate.imageUrl,
    }),
  );
}

async function parseSimpleResultCards(page: Page, candidateLimit: number) {
  return await page.evaluate((limit) => {
    function normalizeUrl(href: string) {
      if (!href) {
        return '';
      }
      if (href.startsWith('//')) {
        return `https:${href}`;
      }
      return href;
    }

    function offerIdFromText(text: string) {
      const decodedText = text
        .replace(/&quot;/g, '"')
        .replace(/&#34;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/\\u0026/g, '&')
        .replace(/%22/g, '"')
        .replace(/%3A/gi, ':')
        .replace(/%3D/gi, '=');
      try {
        const urlOfferId = new URL(decodedText, window.location.href).searchParams.get('offerId');
        if (urlOfferId) {
          return urlOfferId;
        }
      } catch {
        // ignore malformed snippets
      }
      return (
        decodedText.match(/object_id@(\d{8,})/)?.[1] ||
        decodedText.match(/data-renderkey=["'][^"']*_(\d{8,})["']/)?.[1] ||
        decodedText.match(/(?:^|[\s"'])\d+_\d+_[a-z0-9]+_[^_\s"']+_(\d{8,})(?:[\s"']|$)/i)?.[1] ||
        decodedText.match(/offerId=(\d{8,})/)?.[1] ||
        text.match(/offerId%3D(\d{8,})/i)?.[1] ||
        decodedText.match(/offer\/(\d{8,})\.html/)?.[1] ||
        ''
      );
    }

    function imageFromCard(root: Element) {
      const image =
        root.querySelector('img[class*="mainImg"]') ??
        root.querySelector('img[src*="alicdn.com/img/ibank"]') ??
        root.querySelector('img');
      return normalizeUrl(
        image?.getAttribute('src') ||
          image?.getAttribute('data-src') ||
          image?.getAttribute('data-lazy-src') ||
          '',
      );
    }

    function titleFromCard(root: Element) {
      const titleNode =
        root.querySelector('[class*="titleText"]') ??
        root.querySelector('[class*="offerTitleRow"]') ??
        root.querySelector('[title]');
      const direct = titleNode?.textContent?.trim() || titleNode?.getAttribute('title')?.trim() || '';
      if (direct) {
        return direct;
      }
      const text = root.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      return text
        .replace(/^符合\d+\/\d+个条件\s*/, '')
        .replace(/^找相似\s*/, '')
        .split(/[¥￥]/)[0]
        .slice(0, 120)
        .trim();
    }

    function priceFromCard(root: Element) {
      const text = root.textContent?.replace(/\s+/g, '') ?? '';
      return text.match(/[¥￥]\d+(?:\.\d+)?(?:[-~至][¥￥]?\d+(?:\.\d+)?)?/)?.[0] ?? '';
    }

    function salesTextFromCard(root: Element) {
      const text = root.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      return (
        text.match(/(?:已售|成交|销量|售出|月销)?\s*\d+(?:\.\d+)?\s*万?\+?\s*(?:件|个|单|笔)/)?.[0]?.trim() ||
        ''
      );
    }

    function pluginExtraTextFromCard(root: Element) {
      const plugin =
        root.querySelector('.plugin-offer-search-card.offer-item-extra') ??
        root.querySelector('.plugin-offer-search-card') ??
        root.querySelector('[class*="offer-item-extra"]');
      return plugin?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    }

    function metricTextFromCard(root: Element, label: string) {
      const text = [pluginExtraTextFromCard(root), root.textContent?.replace(/\s+/g, ' ').trim() ?? '']
        .filter(Boolean)
        .join(' ');
      const index = text.indexOf(label);
      if (index < 0) {
        return '';
      }
      const tail = text.slice(index + label.length).replace(/^[:：\s]*/, '');
      return tail.match(/[-\d,.万+以内]+(?:件(?:[（(]\d+笔[）)])?|个|单|笔)?/)?.[0]?.trim() ?? '';
    }

    const roots = Array.from(
      document.querySelectorAll(
        '#offer-list-content [data-index], #offer-list-content [data-renderkey], #offer-list-content [data-aplus-report*="object_id@"]',
      ),
    );
    const seen = new Set<string>();
    const result = [];
    for (const root of roots) {
      const anchorHref =
        root.querySelector('a[href*="offerId="], a[href*="offerId%3D"], a[href*="detail.1688.com/offer/"]')?.getAttribute('href') ||
        '';
      const offerId = offerIdFromText(
        [
          root.getAttribute('data-renderkey') || '',
          root.getAttribute('data-aplus-report') || '',
          anchorHref,
          root.outerHTML.slice(0, 1200),
        ].join(' '),
      );
      if (!offerId || seen.has(offerId)) {
        continue;
      }
      seen.add(offerId);
      result.push({
        offerUrl: `https://detail.1688.com/offer/${offerId}.html`,
        offerId,
        title: titleFromCard(root),
        supplier: '',
        priceText: priceFromCard(root),
        moqText: '',
        salesText: salesTextFromCard(root),
        annualSalesText: metricTextFromCard(root, '年销量'),
        monthlyDistributionText: metricTextFromCard(root, '月代销'),
        pluginExtraText: pluginExtraTextFromCard(root),
        imageUrl: imageFromCard(root),
      });
      if (result.length >= limit) {
        break;
      }
    }
    return result;
  }, candidateLimit);
}

function normalizeRealCandidate(input: {
  item: ProductItem;
  index: number;
  offerUrl: string;
  offerId: string;
  title: string;
  supplier: string;
  priceText: string;
  moqText: string;
  salesText?: string;
  annualSalesText?: string;
  monthlyDistributionText?: string;
  pluginExtraText?: string;
  imageUrl: string;
}): SupplierCandidate {
  const score = Math.max(50, 90 - input.index * 8);
  const riskFlags = ['真实搜图候选，待进入详情页匹配 SKU'];
  const listPrice = extractListPrice(input.priceText);
  const salesVolume = extractSalesVolume(input.salesText ?? '');
  const annualSalesVolume = extractSalesMetricValue(input.annualSalesText ?? '');
  const monthlyDistributionVolume = extractSalesMetricValue(input.monthlyDistributionText ?? '');
  if (input.priceText) {
    riskFlags.push(`列表价仅供参考：${input.priceText}${Number.isFinite(listPrice) ? `；解析列表价 ${listPrice}` : ''}`);
  }
  if (input.pluginExtraText) {
    riskFlags.push(`1688插件增强数据：${input.pluginExtraText}`);
  }
  if (input.annualSalesText) {
    riskFlags.push(`年销量参考：${input.annualSalesText}${Number.isFinite(annualSalesVolume) ? `；解析年销量 ${annualSalesVolume}` : ''}`);
  }
  if (input.monthlyDistributionText) {
    riskFlags.push(`月代销参考：${input.monthlyDistributionText}${Number.isFinite(monthlyDistributionVolume) ? `；解析月代销 ${monthlyDistributionVolume}` : ''}`);
  }
  if (input.salesText) {
    riskFlags.push(`1688销量仅供参考：${input.salesText}${Number.isFinite(salesVolume) ? `；解析销量 ${salesVolume}` : ''}`);
  }
  if (input.moqText) {
    riskFlags.push(`列表起订信息仅供参考：${input.moqText}`);
  }

  return {
    productId: input.item.productId,
    offerUrl: input.offerUrl,
    offerId: input.offerId,
    title: input.title || `${input.item.title || '1688 候选货源'} ${input.index + 1}`,
    supplier: input.supplier || '未识别供应商',
    supplierType: '未识别',
    member: false,
    coverImageUrl: input.imageUrl,
    listPrice,
    annualSalesVolume,
    annualSalesText: input.annualSalesText,
    monthlyDistributionVolume,
    monthlyDistributionText: input.monthlyDistributionText,
    pluginExtraText: input.pluginExtraText,
    salesVolume,
    salesText: input.salesText,
    riskFlags,
    score,
    suggestion: '待详情验证',
  };
}

function extractSalesMetricValue(text: string) {
  const normalizedText = text.replace(/,/g, '').replace(/\s+/g, '');
  if (!normalizedText || normalizedText === '-') {
    return undefined;
  }

  const withinMatch = normalizedText.match(/(\d+(?:\.\d+)?)以内/);
  if (withinMatch) {
    const withinValue = Number(withinMatch[1]);
    return Number.isFinite(withinValue) ? Math.floor(withinValue) : undefined;
  }

  const match = normalizedText.match(/(\d+(?:\.\d+)?)(万)?\+?/);
  if (!match) {
    return undefined;
  }
  const value = Number(match[1]);
  if (!Number.isFinite(value)) {
    return undefined;
  }
  return Math.floor(value * (match[2] ? 10000 : 1));
}

function extractSalesVolume(text: string) {
  const normalizedText = text.replace(/,/g, '').replace(/\s+/g, '');
  const match = normalizedText.match(/(?:已售|成交|销量|售出|月销)?(\d+(?:\.\d+)?)(万)?\+?(?:件|个|单|笔)/);
  if (!match) {
    return undefined;
  }
  const value = Number(match[1]);
  if (!Number.isFinite(value)) {
    return undefined;
  }
  return Math.floor(value * (match[2] ? 10000 : 1));
}

function extractListPrice(text: string) {
  const normalizedText = text.replace(/,/g, '').replace(/\s+/g, ' ');
  const ranges = Array.from(normalizedText.matchAll(/(?:¥|￥|RMB|CNY)?\s*(\d+(?:\.\d+)?)\s*[-~至]\s*(?:¥|￥|RMB|CNY)?\s*(\d+(?:\.\d+)?)/gi));
  if (ranges.length > 0) {
    return Math.min(...ranges.flatMap((range) => [Number(range[1]), Number(range[2])]).filter(Number.isFinite));
  }

  const prices = Array.from(normalizedText.matchAll(/(?:¥|￥|RMB|CNY)?\s*(\d+(?:\.\d+)?)/gi))
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value > 0);
  return prices.length > 0 ? Math.min(...prices) : undefined;
}

function createMockCandidate(input: ImageSearchInput, index: number): SupplierCandidate {
  const seed = crypto
    .createHash('sha1')
    .update(`${input.item.productId}:${input.imagePath}:${index}`)
    .digest('hex');
  const offerId = seed.slice(0, 12);
  const rank = index + 1;
  const score = Math.max(55, 92 - index * 9);
  const listImageSimilarity = index < 3 ? [0.94, 0.9, 0.88][index] : Math.max(0, 0.82 - (index - 3) * 0.05);
  const supplierType = index === 0 ? '工厂' : '供应商';
  const imageName = path.basename(input.imagePath);

  return {
    productId: input.item.productId,
    offerUrl: `https://detail.1688.com/offer/${offerId}.html`,
    offerId,
    title: `${input.item.title || '1688 相似货源'} - Mock 候选 ${rank}`,
    supplier: `Mock 供应商 ${rank}`,
    supplierType,
    member: index <= 1,
    coverImageUrl: `local://mock-rank-${rank}/${imageName}`,
    listPrice: Number((18 + index * 3.2).toFixed(2)),
    listImageSimilarity: Number(listImageSimilarity.toFixed(2)),
    salesVolume: Math.max(0, 7200 - index * 850),
    salesText: `${Math.max(0, 7200 - index * 850)}+件`,
    riskFlags: ['mock 列表候选，待进入详情页匹配 SKU'],
    score,
    suggestion: '待详情验证',
  };
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException('任务已中断', 'AbortError');
  }
}
