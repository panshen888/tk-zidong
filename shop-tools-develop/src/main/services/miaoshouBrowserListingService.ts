import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Browser, type BrowserContext, type Locator, type Page, type Response } from 'playwright-core';
import type { AppSettings, MiaoshouPricingTemplate } from '../../shared/types';
import { defaultSettings } from '../../shared/defaults';
import { assertAppChromeCdpOwnership, getOrCreateAppChromeContext, waitForChromeCdp } from './chromeSession';

export type MiaoshouBrowserListingRow = {
  recordId: string;
  key: string;
  productId: string;
  site: string;
  tiktokCollectBoxId: string;
  sourceItemId: string;
  sourcePrice: number;
  displayPrice?: number;
  weightGram: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  targetShopId: string;
  targetShopName: string;
};

export type MiaoshouBrowserPublishRowResult = {
  status: 'success' | 'failed';
  currentStep: string;
  publishResult: string;
  failureReason: string;
  screenshotPath: string;
  template?: MiaoshouPricingTemplate;
};

const collectBoxUrl = 'https://erp.91miaoshou.com/tiktok/collect_box/items';
const dialogHandlerContexts = new WeakSet<BrowserContext>();
const dialogHandlerPages = new WeakSet<Page>();

export async function refreshMiaoshouPricingTemplatesFromBrowser(settings: AppSettings, input: { site?: string } = {}) {
  const browserTarget = await getExistingLoginBrowserContext(settings);
  const page = await getOrCreateMiaoshouPage(browserTarget, settings);
  const templatesFromResponses = new Map<string, MiaoshouPricingTemplate>();

  try {
    page.on('response', async (response) => {
      const templates = await extractPricingTemplatesFromResponse(response, input.site).catch(() => []);
      for (const template of templates) {
        templatesFromResponses.set(buildTemplateKey(template), template);
      }
    });

    await page.goto(collectBoxUrl, { waitUntil: 'domcontentloaded', timeout: settings.pageTimeoutMs });
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
    await openAnyPriceTemplateDropdown(page).catch(() => undefined);
    await page.waitForTimeout(2500);

    const domTemplates = await extractVisiblePricingTemplates(page, input.site).catch(() => []);
    for (const template of domTemplates) {
      templatesFromResponses.set(buildTemplateKey(template), template);
    }

    return [...templatesFromResponses.values()]
      .filter((template) => !input.site || normalizeSite(template.site) === normalizeSite(input.site))
      .sort((left, right) => normalizeSite(left.site).localeCompare(normalizeSite(right.site)) || left.name.localeCompare(right.name, 'zh-Hans-CN'));
  } finally {
    await closeConnectedBrowser(browserTarget);
  }
}

async function getExistingLoginBrowserContext(settings: AppSettings) {
  const chromeCdpUrl = settings.chromeCdpUrl || defaultSettings.chromeCdpUrl;
  await waitForChromeCdp(chromeCdpUrl, 5000).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`请先点击“打开登录浏览器”并完成妙手登录后再刷新模板。\n${message}`);
  });
  await assertAppChromeCdpOwnership({
    chromeCdpUrl,
    chromeUserDataDir: settings.chromeUserDataDir,
  });
  const browser = await chromium.connectOverCDP(chromeCdpUrl);
  const context = browser.contexts()[0] ?? await browser.newContext();
  installSafeDialogHandlers(context);
  return { context, browser };
}

export async function publishMiaoshouListingRowByBrowser(input: {
  settings: AppSettings;
  row: MiaoshouBrowserListingRow;
  template?: MiaoshouPricingTemplate;
  screenshotDir: string;
}) {
  const browserTarget = await getMiaoshouBrowserContext(input.settings);
  const page = await getOrCreateMiaoshouPage(browserTarget, input.settings);
  page.setDefaultTimeout(input.settings.pageTimeoutMs);
  installSafeDialogHandler(page);

  let currentStep = '打开妙手采集箱';
  try {
    await fs.mkdir(input.screenshotDir, { recursive: true });
    await page.goto(collectBoxUrl, { waitUntil: 'domcontentloaded', timeout: input.settings.pageTimeoutMs });
    await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => undefined);
    await dismissFloatingOverlays(page);

    currentStep = '按货源ID搜索商品';
    await searchBySourceItemId(page, input.row.sourceItemId);
    await dismissFloatingOverlays(page);

    currentStep = '打开编辑弹窗';
    await openEditDialog(page, input.row);

    currentStep = '批量修改重量';
    await applyBatchWeight(page, input.row.weightGram);

    currentStep = '填写包裹重量和尺寸';
    await applyPackageWeightAndDimensions(page, input.row);

    currentStep = '批量修改货源价格';
    await applyBatchSourcePrice(page, input.row.sourcePrice);

    currentStep = '引用妙手定价模板';
    await applyBatchDisplayPrice(page, input.row.displayPrice, input.template);

    currentStep = '保存并发布';
    await translateProductContentIfNeeded(page, input.row.site);
    await trimOverlongSalesAttributes(page);
    const blockingReason = await getVisibleBlockingPublishReason(page, input.settings, input.row.site);
    if (blockingReason) {
      throw new Error(blockingReason);
    }
    const publishResult = await submitSaveAndPublish(page, input.settings, input.row.site);

    return {
      status: 'success',
      currentStep,
      publishResult,
      failureReason: '',
      screenshotPath: '',
      template: input.template,
    } satisfies MiaoshouBrowserPublishRowResult;
  } catch (error) {
    const screenshotPath = path.join(
      input.screenshotDir,
      `miaoshou-browser-publish-${sanitizeFilePart(input.row.productId || input.row.sourceItemId || input.row.recordId)}-${Date.now()}.png`,
    );
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);
    return {
      status: 'failed',
      currentStep,
      publishResult: '',
      failureReason: error instanceof Error ? error.message : String(error),
      screenshotPath,
      template: input.template,
    } satisfies MiaoshouBrowserPublishRowResult;
  } finally {
    await closeConnectedBrowser(browserTarget);
  }
}

async function submitSaveAndPublish(page: Page, settings: AppSettings, site?: string) {
  await clickButtonByText(page.locator('.jx-dialog:visible, body'), ['保存并发布']);
  await confirmOptionalPublishDialog(page);
  try {
    return await waitForPublishOutcome(page);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (hasChineseTitleRequiredText(message)) {
      const translated = await translateProductContentIfNeeded(page, site);
      if (!translated) {
        throw error;
      }
      await clickButtonByText(page.locator('.jx-dialog:visible, body'), ['保存并发布']);
      await confirmOptionalPublishDialog(page);
      return waitForPublishOutcome(page);
    }

    if (!hasSizeChartRequiredText(message)) {
      throw error;
    }

    const imageUrl = String(settings.miaoshouSizeChartImageUrl ?? '').trim();
    if (!imageUrl) {
      throw new Error('妙手发布前校验失败：尺码图必传；请在AI上架配置填写尺码表网络图片URL，或人工上传尺码图/配置尺码模板');
    }

    const applied = await applySizeChartFromNetworkImage(page, imageUrl);
    if (!applied) {
      throw new Error('妙手发布前校验失败：尺码图必传；已尝试使用配置的尺码表网络图片URL，但未能完成页面填写，请检查妙手弹窗或图片URL');
    }

    const blockingReason = await getVisibleBlockingPublishReason(page, settings, site);
    if (blockingReason) {
      throw new Error(blockingReason);
    }

    await clickButtonByText(page.locator('.jx-dialog:visible, body'), ['保存并发布']);
    await confirmOptionalPublishDialog(page);
    return waitForPublishOutcome(page);
  }
}

async function translateProductContentIfNeeded(page: Page, site?: string) {
  const bodyText = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
  const shouldTranslate = hasChineseTitleRequiredText(bodyText) || hasLikelyChineseProductTitle(bodyText);
  if (!shouldTranslate) {
    return false;
  }

  const dialog = page.locator('.jx-dialog:visible').filter({ hasText: /SKU列表|保存并发布|基本信息/ }).last();
  const translateButton = dialog.locator('button.J_editDialogTranslate:visible').first()
    .or(dialog.locator('.jx-dialog__footer button:visible').filter({ hasText: /^一键翻译$/ }).first())
    .or(page.locator('button.J_editDialogTranslate:visible').first());
  if (!(await translateButton.count())) {
    return false;
  }

  const languageSelected = await clickTranslateLanguage(page, translateButton, site);
  if (!languageSelected) {
    await clickWithOverlayFallback(translateButton);
  }
  await confirmOptionalPublishDialog(page);
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
  await page.waitForTimeout(2500);
  return true;
}

async function clickTranslateLanguage(page: Page, translateButton: Locator, site?: string) {
  const languageNames = getTranslateLanguageNames(site);
  if (languageNames.length === 0) {
    return false;
  }

  const dropdownTrigger = translateButton.locator('.jx-button-group__append, .jx-dropdown__caret-button, [class*="caret"], .jx-icon').last();
  if (await dropdownTrigger.count()) {
    await clickWithOverlayFallback(dropdownTrigger).catch(async () => {
      await clickWithOverlayFallback(translateButton);
    });
  } else {
    await clickWithOverlayFallback(translateButton);
  }
  await page.waitForTimeout(500);
  await enableTranslateSkipSkuProperty(page);

  for (const languageName of languageNames) {
    const item = page.locator(
      '.jx-dropdown-menu:visible [class*="item"], .jx-popper:visible [class*="item"], .jx-dropdown-menu:visible li, .jx-popper:visible li',
    ).filter({ hasText: languageName }).first();
    if (await item.count()) {
      await clickWithOverlayFallback(item);
      await page.waitForTimeout(500);
      return true;
    }
  }
  return false;
}

async function enableTranslateSkipSkuProperty(page: Page) {
  const label = page.locator('.text-translate-dropdown:visible label, .jx-popper:visible label')
    .filter({ hasText: '规格名称不翻译' })
    .first();
  if (!(await label.count())) {
    return;
  }
  const checkbox = label.locator('input[type="checkbox"]').first();
  const checked = await checkbox.isChecked().catch(() => false);
  if (!checked) {
    await clickWithOverlayFallback(label);
    await page.waitForTimeout(200);
  }
}

function getTranslateLanguageNames(site?: string) {
  switch (normalizeSite(site ?? '')) {
    case 'VN':
      return ['越南语', 'Vietnamese'];
    case 'TH':
      return ['泰语', 'Thai'];
    case 'MY':
      return ['马来语', '英语', 'Malay', 'English'];
    case 'SG':
    case 'PH':
      return ['英语', 'English'];
    default:
      return ['英语', 'English'];
  }
}

function hasChineseTitleRequiredText(value: string) {
  return /产品名称不能包含中文|请翻译后保存|标题.*中文|名称.*中文/.test(value);
}

function hasLikelyChineseProductTitle(value: string) {
  const match = value.match(/产品标题\s*([\s\S]{0,120})/);
  return Boolean(match && /[\u4e00-\u9fff]/.test(match[1] ?? ''));
}

async function getVisibleBlockingPublishReason(page: Page, settings: AppSettings, site?: string) {
  const bodyText = normalizeReadableText(await page.locator('body').innerText({ timeout: 5000 }).catch(() => ''));
  if (hasChineseTitleRequiredText(bodyText)) {
    const translated = await translateProductContentIfNeeded(page, site).catch(() => false);
    if (translated) {
      return '';
    }
    return '妙手发布前校验失败：产品名称不能包含中文，请先点击一键翻译或手动翻译标题';
  }

  if (hasSizeChartRequiredText(bodyText)) {
    const imageUrl = String(settings.miaoshouSizeChartImageUrl ?? '').trim();
    if (imageUrl) {
      const applied = await applySizeChartFromNetworkImage(page, imageUrl).catch(() => false);
      if (applied) {
        return '';
      }
    }

    const templateRadio = page.locator('.size-chart-box:visible label').filter({ hasText: '尺码模板' }).first();
    if (await templateRadio.count()) {
      await clickWithOverlayFallback(templateRadio).catch(() => undefined);
      await page.waitForTimeout(1200);
      const afterSwitchText = normalizeReadableText(await page.locator('body').innerText({ timeout: 5000 }).catch(() => ''));
      if (afterSwitchText.includes('暂无可用模板')) {
        return '妙手发布前校验失败：尺码图必传，且当前店铺暂无可用尺码模板；请先在卖家中心配置尺码模板或人工上传尺码图';
      }
      if (!hasSizeChartRequiredText(afterSwitchText)) {
        return '';
      }
    }
    return imageUrl
      ? '妙手发布前校验失败：尺码图必传；已尝试使用配置的尺码表网络图片URL，但妙手页面仍未通过校验，请检查图片URL是否为公网可访问的 JPG/JPEG/PNG 且小于5M'
      : '妙手发布前校验失败：尺码图必传；请在AI上架配置填写尺码表网络图片URL，或人工上传尺码图/配置尺码模板';
  }
  return '';
}

async function trimOverlongSalesAttributes(page: Page) {
  const dialog = await getEditDialog(page);
  const trimmedCount = await dialog.evaluate((root) => {
    const visible = (element: Element | null) => {
      if (!(element instanceof HTMLElement)) {
        return false;
      }
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const setInputValue = (element: HTMLInputElement, value: string) => {
      const prototype = Object.getPrototypeOf(element);
      const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
      descriptor?.set?.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.dispatchEvent(new Event('blur', { bubbles: true }));
    };
    const inputs = Array.from(root.querySelectorAll<HTMLInputElement>('input[maxlength="50"], input[placeholder*="选项名称"]'))
      .filter(visible)
      .filter((input) => !input.disabled && !input.readOnly && input.value.length > 50);
    for (const input of inputs) {
      setInputValue(input, input.value.slice(0, 50));
    }
    return inputs.length;
  });
  if (trimmedCount > 0) {
    await blurActiveElement(page);
    await page.waitForTimeout(500);
  }
}

async function applySizeChartFromNetworkImage(page: Page, imageUrl: string) {
  const trimmedUrl = imageUrl.trim();
  if (!/^https?:\/\//i.test(trimmedUrl)) {
    throw new Error('尺码表网络图片URL必须以 http:// 或 https:// 开头');
  }

  await closeNetworkImageDialogIfEmpty(page).catch(() => undefined);
  const dialog = await getEditDialog(page);
  const sizeChartBox = await findSizeChartBox(dialog);
  if (!(await sizeChartBox.count())) {
    throw new Error('未在妙手编辑弹窗中找到尺码表区域');
  }

  await sizeChartBox.scrollIntoViewIfNeeded().catch(() => undefined);
  const imageRadio = sizeChartBox.locator('label:visible').filter({ hasText: '尺码图表' }).first();
  if (await imageRadio.count()) {
    await clickWithOverlayFallback(imageRadio).catch(() => undefined);
    await page.waitForTimeout(500);
  }

  const networkDialogAlreadyOpen = await getNetworkImageDialog(page).catch(() => null);
  const networkDialog = networkDialogAlreadyOpen ?? await openNetworkImageDialogFromSizeChart(sizeChartBox);
  const textarea = networkDialog.locator('textarea[placeholder*="图片链接"], textarea:visible').first();
  await textarea.waitFor({ state: 'visible', timeout: 10_000 });
  await textarea.fill(trimmedUrl);
  await clickButtonByText(networkDialog, ['确定']);
  await networkDialog.waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => undefined);
  await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => undefined);
  await page.waitForTimeout(1500);

  return true;
}

async function findSizeChartBox(dialog: Locator) {
  const direct = dialog.locator('.size-chart-box:visible').first();
  if (await direct.count()) {
    return direct;
  }

  const label = dialog.getByText('尺码表', { exact: false }).first();
  if (await label.count()) {
    await label.scrollIntoViewIfNeeded().catch(() => undefined);
    await dialog.page().waitForTimeout(500);
  }
  return dialog.locator('.size-chart-box:visible').first();
}

async function openNetworkImageDialogFromSizeChart(sizeChartBox: Locator) {
  const page = sizeChartBox.page();
  const pictureItem = sizeChartBox.locator('.size-chart-picture-item:visible, .product-picture-item:visible').first();
  if (await pictureItem.count()) {
    await pictureItem.hover({ timeout: 5000 }).catch(() => undefined);
  }

  const uploadIcon = sizeChartBox.locator('.shopee-icon-shangchuantupian:visible, .product-picture-item-sidebar ~ .operate-btn-group i:visible').first();
  if (await uploadIcon.count()) {
    await clickWithOverlayFallback(uploadIcon);
  } else {
    const emptyAddEntry = sizeChartBox.locator('.product-picture-item-add:visible, .size-chart-picture-item-add:visible').first();
    if (await emptyAddEntry.count()) {
      await clickWithOverlayFallback(emptyAddEntry);
    } else {
      const uploadButton = sizeChartBox.locator('button:visible').filter({ hasText: /上传图片|添加图片/ }).first();
      if (!(await uploadButton.count())) {
      throw new Error('尺码表区域未找到上传图片入口');
      }
      await clickWithOverlayFallback(uploadButton);
    }
  }

  await page.waitForTimeout(600);
  const networkItem = page.locator('.jx-popper:visible .picture-selector-item:visible, .jx-popover:visible .picture-selector-item:visible')
    .filter({ hasText: '使用网络图片' })
    .first();
  await networkItem.waitFor({ state: 'visible', timeout: 10_000 });
  await clickWithOverlayFallback(networkItem);
  return getNetworkImageDialog(page);
}

async function getNetworkImageDialog(page: Page) {
  const dialog = page.locator('.jx-dialog:visible').filter({ hasText: /^使用网络图片/ }).last();
  await dialog.waitFor({ state: 'visible', timeout: 10_000 });
  return dialog;
}

async function closeNetworkImageDialogIfEmpty(page: Page) {
  const dialog = page.locator('.jx-dialog:visible').filter({ hasText: /^使用网络图片/ }).last();
  if (!(await dialog.count())) {
    return;
  }
  const textareaValue = await dialog.locator('textarea:visible').first().inputValue().catch(() => '');
  if (!textareaValue.trim()) {
    await clickButtonByText(dialog, ['取消']).catch(async () => {
      await dialog.locator('.jx-dialog__headerbtn:visible').first().click({ force: true }).catch(() => undefined);
    });
  }
}

export function parseMiaoshouPricingTemplatesJson(value: string): MiaoshouPricingTemplate[] {
  try {
    const parsed = JSON.parse(value || '[]') as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map(normalizeTemplate).filter(Boolean) as MiaoshouPricingTemplate[];
  } catch {
    return [];
  }
}

export function resolvePricingTemplateForSite(
  templates: MiaoshouPricingTemplate[],
  mappings: string,
  site: string,
) {
  const mapping = parseTemplateMappings(mappings).find((item) => normalizeSite(item.site) === normalizeSite(site));
  const siteTemplates = templates.filter((template) => normalizeSite(template.site) === normalizeSite(site));
  if (mapping) {
    const byId = siteTemplates.find((template) => template.priceTemplateId && template.priceTemplateId === mapping.templateId);
    if (byId) {
      return byId;
    }
    const byName = siteTemplates.find((template) => template.name === mapping.templateName);
    if (byName) {
      return byName;
    }
  }
  return siteTemplates[0] ?? templates.find((template) => normalizeSite(template.site) === normalizeSite(site));
}

export function upsertTemplateMapping(current: string, template: MiaoshouPricingTemplate) {
  const site = normalizeSite(template.site);
  if (!site) {
    return current ?? '';
  }
  const rows = (current ?? '')
    .split(/\r?\n|;/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => normalizeSite(line.split(/[=,]/)[0]) !== site);
  rows.push(`${site}=${template.priceTemplateId || ''}|${template.name}`);
  return rows.join('\n');
}

async function getMiaoshouBrowserContext(settings: AppSettings) {
  if (settings.chromeMode === 'connect') {
    await assertAppChromeCdpOwnership({
      chromeCdpUrl: settings.chromeCdpUrl || defaultSettings.chromeCdpUrl,
      chromeUserDataDir: settings.chromeUserDataDir,
    });
    const browser = await chromium.connectOverCDP(settings.chromeCdpUrl || defaultSettings.chromeCdpUrl);
    const context = browser.contexts()[0] ?? await browser.newContext();
    installSafeDialogHandlers(context);
    return {
      context,
      browser,
    };
  }

  const context = await getOrCreateAppChromeContext({
    chromeExecutablePath: settings.chromeExecutablePath,
    chromeUserDataDir: settings.chromeUserDataDir,
    imageSearchUrl: collectBoxUrl,
    pageTimeoutMs: settings.pageTimeoutMs,
    headless: settings.taskBrowserMode === 'headless',
    lowDisturbance: settings.taskBrowserMode !== 'headless',
  });
  installSafeDialogHandlers(context);
  return { context, browser: null };
}

async function closeConnectedBrowser(target: { browser?: Browser | null }) {
  const browser = target.browser;
  if (!browser) {
    return;
  }
  const maybeDisconnect = (browser as unknown as { disconnect?: () => void }).disconnect;
  if (typeof maybeDisconnect === 'function') {
    maybeDisconnect.call(browser);
    return;
  }
  await browser.close({ reason: 'miaoshou browser automation finished' }).catch(() => undefined);
}

async function getOrCreateMiaoshouPage(
  target: BrowserContext | { context: BrowserContext; browser?: Browser | null },
  settings: AppSettings,
) {
  const context = 'context' in target ? target.context : target;
  const page = context.pages().find((item) => item.url().includes('erp.91miaoshou.com')) ?? await context.newPage();
  page.setDefaultTimeout(settings.pageTimeoutMs);
  return page;
}

async function searchBySourceItemId(page: Page, sourceItemId: string) {
  if (!sourceItemId.trim()) {
    throw new Error('货源ID为空，无法在妙手采集箱搜索');
  }
  await resetCollectBoxFilters(page);
  await switchCollectBoxTab(page, '未发布');
  const input = page.locator('[data-field="sourceItemIdKeyword"] input').first()
    .or(page.getByPlaceholder(/多个.*逗号|Excel|复制粘贴/).nth(1));
  await input.waitFor({ state: 'visible' });
  await input.fill(sourceItemId);
  await clickFirstVisible(page.locator('button.J_queryFormSearch').or(page.getByRole('button', { name: /搜索|查询/ })));
  await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => undefined);
  await page.waitForTimeout(1500);
  const rowSearchResult = await getMiaoshouSearchResultState(page, sourceItemId);
  if (!rowSearchResult.hasMatch) {
    throw new Error(`妙手未发布采集箱未搜索到货源ID：${sourceItemId}${rowSearchResult.noData ? '（页面显示暂无数据）' : ''}`);
  }
}

async function resetCollectBoxFilters(page: Page) {
  const resetButton = page.getByRole('button', { name: /重置/ }).first()
    .or(page.locator('button:visible').filter({ hasText: '重置' }).first());
  if (await resetButton.count()) {
    await clickWithOverlayFallback(resetButton).catch(() => undefined);
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => undefined);
    await page.waitForTimeout(800);
  }
}

async function switchCollectBoxTab(page: Page, tabName: string) {
  const tab = page.locator('button:visible, .jx-tabs__item:visible, [role="tab"]:visible, span:visible')
    .filter({ hasText: tabName })
    .first();
  if (await tab.count()) {
    await clickWithOverlayFallback(tab).catch(() => undefined);
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => undefined);
    await page.waitForTimeout(800);
  }
}

async function getMiaoshouSearchResultState(page: Page, sourceItemId: string) {
  const bodyText = normalizeReadableText(await page.locator('body').innerText({ timeout: 5000 }).catch(() => ''));
  const noData = bodyText.includes('暂无数据');
  const sourceMarker = page.locator(`[sourceitemurl*="${cssEscape(sourceItemId)}"]:visible, [href*="${cssEscape(sourceItemId)}"]:visible`).first();
  if (await sourceMarker.count()) {
    return { hasMatch: true, noData };
  }

  const rows = page.locator('.pro-virtual-table__row:visible, .vue-recycle-scroller__item-view:visible');
  const count = await rows.count();
  for (let index = 0; index < count; index += 1) {
    const rowText = normalizeReadableText(await rows.nth(index).innerText({ timeout: 1000 }).catch(() => ''));
    if (rowText.includes(sourceItemId)) {
      return { hasMatch: true, noData };
    }
  }

  return { hasMatch: false, noData };
}

async function openEditDialog(page: Page, row: MiaoshouBrowserListingRow) {
  const tiktokCollectBoxId = row.tiktokCollectBoxId.trim();
  if (!tiktokCollectBoxId) {
    throw new Error('TikTok采集箱ID缺失，禁止按货源ID兜底编辑');
  }
  const rows = page.locator('.pro-virtual-table__row:visible, .vue-recycle-scroller__item-view:visible');
  const rowLocator = await findRowByCollectBoxDetailId(page, rows, tiktokCollectBoxId);
  if (!(await rowLocator.count())) {
    throw new Error('同货源ID存在多条记录，未匹配到目标TikTok采集箱ID');
  }
  await assertTargetRowMatches(rowLocator, row);
  const editButton = rowLocator.locator('button.J_collectBoxEdit:visible').filter({ hasText: /编辑/ }).first();
  await clickFirstVisible(editButton);
  const dialog = page.locator('.jx-dialog:visible').filter({ hasText: /SKU列表|保存并发布|基本信息/ }).last();
  await dialog.waitFor({ state: 'visible', timeout: 20_000 });
  await ensureSkuListVisible(page);
}

async function findRowByCollectBoxDetailId(page: Page, rows: Locator, collectBoxDetailId: string) {
  const directRow = page.locator(
    `.pro-virtual-table__row[collectboxdetailid="${cssEscape(collectBoxDetailId)}"]:visible, ` +
    `.vue-recycle-scroller__item-view[collectboxdetailid="${cssEscape(collectBoxDetailId)}"]:visible`,
  ).first();
  if (await directRow.count()) {
    return directRow;
  }

  const descendantRow = rows.filter({ has: page.locator(`[collectboxdetailid="${cssEscape(collectBoxDetailId)}"]`) }).first();
  if (await descendantRow.count()) {
    return descendantRow;
  }

  const marker = page.locator(`[collectboxdetailid="${cssEscape(collectBoxDetailId)}"]:visible`).first();
  if (await marker.count()) {
    const closestRow = marker.locator('xpath=ancestor-or-self::*[contains(@class,"pro-virtual-table__row") or contains(@class,"vue-recycle-scroller__item-view")][1]').first();
    if (await closestRow.count()) {
      return closestRow;
    }
  }

  return rows.filter({ hasText: '__never_match_collect_box_detail_id__' }).first();
}

async function assertTargetRowMatches(rowLocator: Locator, row: MiaoshouBrowserListingRow) {
  const rowText = await rowLocator.innerText({ timeout: 5000 }).catch(() => '');
  const expectedSite = normalizeSite(row.site);
  if (expectedSite && !siteTextMatches(rowText, expectedSite)) {
    throw new Error(`目标站点校验失败：当前行未匹配 ${expectedSite}`);
  }

  const expectedShopName = normalizeReadableText(row.targetShopName);
  if (expectedShopName && !normalizeReadableText(rowText).includes(expectedShopName)) {
    throw new Error(`目标店铺校验失败：当前行未匹配 ${row.targetShopName}`);
  }
}

function siteTextMatches(text: string, site: string) {
  const normalizedText = normalizeReadableText(text).toUpperCase();
  const normalizedSite = normalizeSite(site);
  return new RegExp(`(^|[^A-Z])${escapeRegExp(normalizedSite)}([^A-Z]|$)`).test(normalizedText);
}

function normalizeReadableText(value: string) {
  return value.replace(/\s+/g, '').trim();
}

async function applyBatchWeight(page: Page, weightGram: number) {
  if (!Number.isFinite(weightGram) || weightGram <= 0) {
    throw new Error('克重缺失，无法批量修改重量');
  }
  await clickSkuHeaderBatchButton(page, '重量');
  const dialog = await waitDialogByTitle(page, /批量修改重量/);
  const inputGroup = dialog.locator('.package-weight-input:has(input.jx-input__inner:not([disabled]))').first();
  const input = inputGroup.locator('input.jx-input__inner:not([disabled])').first();
  await input.fill(String(Math.round(weightGram)));
  await selectWeightUnitGram(inputGroup, { required: false });
  await clickButtonByText(dialog, ['确定']);
  await dialog.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);
  await assertVisibleSkuWeightIsGram(page, weightGram);
}

async function applyPackageWeightAndDimensions(page: Page, row: MiaoshouBrowserListingRow) {
  if (!Number.isFinite(row.weightGram) || row.weightGram <= 0) {
    throw new Error('包裹重量g缺失，无法填写包裹重量');
  }

  const dimensions = normalizePackageDimensions(row);
  const dialog = await getEditDialog(page);
  await tryOpenEditSection(dialog, ['商品属性', '物流信息', '基本信息', '商品信息']);

  const result = await fillPackageFieldsByDom(dialog, {
    weightGram: Math.round(row.weightGram),
    lengthCm: dimensions.length,
    widthCm: dimensions.width,
    heightCm: dimensions.height,
  });
  if (result.weightInputSelector) {
    await fillInputLikeUser(dialog, result.weightInputSelector, String(Math.round(row.weightGram)));
  }
  if (result.dimensionInputSelectors.length >= 3) {
    await fillInputLikeUser(dialog, result.dimensionInputSelectors[0], formatDimensionValue(dimensions.length));
    await fillInputLikeUser(dialog, result.dimensionInputSelectors[1], formatDimensionValue(dimensions.width));
    await fillInputLikeUser(dialog, result.dimensionInputSelectors[2], formatDimensionValue(dimensions.height));
  }
  await selectVisiblePackageWeightUnitGram(dialog).catch(() => undefined);
  await blurActiveElement(dialog.page());
  await dialog.page().waitForTimeout(500);

  const verified = await verifyPackageFields(dialog, {
    weightGram: Math.round(row.weightGram),
    lengthCm: dimensions.length,
    widthCm: dimensions.width,
    heightCm: dimensions.height,
  });

  if (!verified.weightFilled || !verified.dimensionsFilled) {
    throw new Error([
      '包裹重量或长宽高未能自动匹配填写',
      `重量填写：${verified.weightFilled ? '成功' : '失败'}`,
      `尺寸填写：${verified.dimensionsFilled ? '成功' : '失败'}`,
      `匹配信息：${result.details.join('；') || '无'}`,
    ].join('；'));
  }
}

function normalizePackageDimensions(row: MiaoshouBrowserListingRow) {
  return {
    length: safePackageDimension(row.lengthCm),
    width: safePackageDimension(row.widthCm),
    height: safePackageDimension(row.heightCm),
  };
}

async function getEditDialog(page: Page) {
  const dialog = page.locator('.jx-dialog:visible').filter({ hasText: /SKU列表|保存并发布|基本信息|商品属性/ }).last();
  await dialog.waitFor({ state: 'visible', timeout: 20_000 });
  return dialog;
}

async function tryOpenEditSection(dialog: Locator, sectionNames: string[]) {
  for (const sectionName of sectionNames) {
    const tab = dialog.locator('.jx-tabs__item:visible, [role="tab"]:visible, .tabs-item:visible, button:visible')
      .filter({ hasText: sectionName })
      .first();
    if (await tab.count()) {
      await clickWithOverlayFallback(tab).catch(() => undefined);
      await dialog.page().waitForTimeout(600);
      return;
    }
  }
}

async function fillPackageFieldsByDom(
  dialog: Locator,
  values: { weightGram: number; lengthCm: number; widthCm: number; heightCm: number },
) {
  return dialog.evaluate((root, input) => {
    const details: string[] = [];
    const selectorFor = (element: HTMLInputElement) => {
      if (element.id) {
        return `#${CSS.escape(element.id)}`;
      }
      return '';
    };
    const visible = (element: Element | null) => {
      if (!(element instanceof HTMLElement)) {
        return false;
      }
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const normalizeText = (value: string) => value.replace(/\s+/g, '');
    const textOf = (element: Element) => normalizeText(element.textContent ?? '');
    const setInputValue = (element: HTMLInputElement, value: string) => {
      const prototype = Object.getPrototypeOf(element);
      const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
      descriptor?.set?.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.dispatchEvent(new Event('blur', { bubbles: true }));
    };
    const inputsOf = (element: Element) => Array.from(element.querySelectorAll<HTMLInputElement>('input:not([disabled])'))
      .filter(visible)
      .filter((inputElement) => inputElement.type !== 'hidden' && inputElement.readOnly !== true);
    const formItems = Array.from(root.querySelectorAll<HTMLElement>('.jx-form-item, .pro-form-item, [class*="form-item"]'))
      .filter(visible);
    const excludes = ['尺寸表', '尺码', '图片', 'SKU列表', '批量修改', '修改范围', '本地展示价', '货源价格'];
    const findItem = (includes: string[], minInputs: number) => formItems.find((item) => {
      const text = textOf(item);
      return includes.some((keyword) => text.includes(keyword)) &&
        !excludes.some((keyword) => text.includes(keyword)) &&
        inputsOf(item).length >= minInputs;
    });

    let weightFilled = false;
    let weightInputSelector = '';
    const dimensionInputSelectors: string[] = [];
    const weightItem = findItem(['包裹重量', '商品重量', '重量'], 1);
    if (weightItem) {
      const inputElement = inputsOf(weightItem)[0];
      if (inputElement) {
        setInputValue(inputElement, String(input.weightGram));
        weightFilled = true;
        weightInputSelector = selectorFor(inputElement);
        details.push(`重量字段：${textOf(weightItem).slice(0, 40)}`);
      }
    }

    let dimensionsFilled = false;
    const dimensionItem = findItem(['包裹尺寸', '长宽高', '尺寸', '长(cm)', '长（cm）'], 3);
    if (dimensionItem) {
      const dimensionInputs = inputsOf(dimensionItem).slice(0, 3);
      if (dimensionInputs.length >= 3) {
        setInputValue(dimensionInputs[0], String(input.lengthCm));
        setInputValue(dimensionInputs[1], String(input.widthCm));
        setInputValue(dimensionInputs[2], String(input.heightCm));
        dimensionInputSelectors.push(...dimensionInputs.map(selectorFor).filter(Boolean));
        dimensionsFilled = true;
        details.push(`尺寸字段：${textOf(dimensionItem).slice(0, 40)}`);
      }
    }

    if (!dimensionsFilled) {
      const lengthItem = findItem(['包裹长度', '长度', '长'], 1);
      const widthItem = findItem(['包裹宽度', '宽度', '宽'], 1);
      const heightItem = findItem(['包裹高度', '高度', '高'], 1);
      const lengthInput = lengthItem ? inputsOf(lengthItem)[0] : undefined;
      const widthInput = widthItem ? inputsOf(widthItem)[0] : undefined;
      const heightInput = heightItem ? inputsOf(heightItem)[0] : undefined;
      if (lengthInput && widthInput && heightInput) {
        setInputValue(lengthInput, String(input.lengthCm));
        setInputValue(widthInput, String(input.widthCm));
        setInputValue(heightInput, String(input.heightCm));
        dimensionInputSelectors.push(...[lengthInput, widthInput, heightInput].map(selectorFor).filter(Boolean));
        dimensionsFilled = true;
        details.push('尺寸字段：分开的长/宽/高字段');
      }
    }

    return { weightFilled, dimensionsFilled, details, weightInputSelector, dimensionInputSelectors };
  }, values);
}

async function fillInputLikeUser(dialog: Locator, selector: string, value: string) {
  if (!selector) {
    return;
  }
  const input = dialog.locator(selector).first();
  if (!(await input.count())) {
    return;
  }
  await input.scrollIntoViewIfNeeded().catch(() => undefined);
  await input.click({ force: true }).catch(() => undefined);
  await input.fill('');
  await input.type(value, { delay: 20 });
  await input.press('Tab').catch(() => undefined);
}

async function verifyPackageFields(
  dialog: Locator,
  expected: { weightGram: number; lengthCm: number; widthCm: number; heightCm: number },
) {
  return dialog.evaluate((root, input) => {
    const visible = (element: Element | null) => {
      if (!(element instanceof HTMLElement)) {
        return false;
      }
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const normalizeText = (value: string) => value.replace(/\s+/g, '');
    const inputsOf = (element: Element) => Array.from(element.querySelectorAll<HTMLInputElement>('input:not([disabled])'))
      .filter(visible)
      .filter((inputElement) => inputElement.type !== 'hidden' && inputElement.readOnly !== true);
    const formItems = Array.from(root.querySelectorAll<HTMLElement>('.jx-form-item, .pro-form-item, [class*="form-item"]'))
      .filter(visible);
    const findItem = (includes: string[], minInputs: number) => formItems.find((item) => {
      const text = normalizeText(item.textContent ?? '');
      return includes.some((keyword) => text.includes(keyword)) && inputsOf(item).length >= minInputs;
    });
    const same = (actual: string, expectedValue: number) => Math.abs(Number(actual) - expectedValue) < 0.001;
    const weightItem = findItem(['包裹重量', '商品重量'], 1);
    const dimensionItem = findItem(['包裹尺寸', '长宽高', '长(cm)', '长（cm）'], 3);
    const weightInput = weightItem ? inputsOf(weightItem)[0] : undefined;
    const dimensionInputs = dimensionItem ? inputsOf(dimensionItem).slice(0, 3) : [];
    return {
      weightFilled: Boolean(weightInput && same(weightInput.value, input.weightGram)),
      dimensionsFilled: Boolean(
        dimensionInputs.length >= 3 &&
        same(dimensionInputs[0].value, input.lengthCm) &&
        same(dimensionInputs[1].value, input.widthCm) &&
        same(dimensionInputs[2].value, input.heightCm)
      ),
    };
  }, expected);
}

async function blurActiveElement(page: Page) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }).catch(() => undefined);
}

async function selectVisiblePackageWeightUnitGram(dialog: Locator) {
  const groups = dialog.locator('.package-weight-input:visible');
  const count = await groups.count();
  for (let index = 0; index < count; index += 1) {
    const group = groups.nth(index);
    const enabledInput = group.locator('input.jx-input__inner:not([disabled])').first();
    if (await enabledInput.count()) {
      await selectWeightUnitGram(group, { required: false });
    }
  }
}

async function selectWeightUnitGram(inputGroup: Locator, behavior: { required?: boolean } = {}) {
  const page = inputGroup.page();
  const selectedText = normalizeReadableText(await inputGroup.locator('.jx-select__selected-item:visible, .jx-select__placeholder:visible').last().innerText().catch(() => ''));
  if (/^(G|克)$/i.test(selectedText)) {
    return;
  }

  const trigger = inputGroup.locator('.jx-select:not(.is-disabled) .jx-select__wrapper:not(.is-disabled), .jx-select__wrapper:not(.is-disabled)').first();
  if (!(await trigger.count())) {
    if (!behavior.required) {
      return;
    }
    throw new Error('重量单位下拉不可点击，无法确认单位为 G/克，禁止继续发布');
  }
  await clickWithOverlayFallback(trigger);
  await page.waitForTimeout(300);
  const options = page.locator('.jx-select-dropdown:visible .jx-select-dropdown__item:not(.is-disabled), .jx-popper:visible li:not(.is-disabled), [role="option"]:visible');
  const count = await options.count();
  for (let index = 0; index < count; index += 1) {
    const option = options.nth(index);
    const text = normalizeReadableText(await option.innerText().catch(() => ''));
    if (/^(G|克)$/i.test(text)) {
      await clickWithOverlayFallback(option);
      await page.waitForTimeout(300);
      return;
    }
  }
  if (!behavior.required) {
    await page.keyboard.press('Escape').catch(() => undefined);
    return;
  }
  throw new Error('重量单位下拉未找到 G/克，禁止继续发布');
}

async function assertVisibleSkuWeightIsGram(page: Page, weightGram: number) {
  const dialog = await ensureSkuListVisible(page);
  const text = normalizeReadableText(await dialog.innerText({ timeout: 5000 }).catch(() => ''));
  const gram = String(Math.round(weightGram));
  if (new RegExp(`${escapeRegExp(gram)}(?:\\.0+)?KG`, 'i').test(text)) {
    throw new Error(`SKU重量单位异常：页面出现 ${gram}KG，应为 ${gram}G`);
  }
}

async function confirmOptionalPublishDialog(page: Page) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15_000) {
    await page.waitForTimeout(500);
    const clicked = await clickVisiblePublishConfirmDialog(page);
    if (clicked) {
      await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => undefined);
      await page.waitForTimeout(800);
      continue;
    }

    const hasPublishDialog = await page.locator('.jx-dialog:visible, .jx-message-box:visible')
      .filter({ hasText: /发布产品|确认发布|选择发布店铺|发布配置/ })
      .count()
      .catch(() => 0);
    if (!hasPublishDialog) {
      return;
    }
  }
}

async function clickVisiblePublishConfirmDialog(page: Page) {
  const dialogs = page.locator('.jx-message-box:visible, .jx-dialog:visible').filter({ hasText: /确认|确定|继续|发布/ });
  const count = await dialogs.count();
  for (let index = count - 1; index >= 0; index -= 1) {
    const dialog = dialogs.nth(index);
    const text = await dialog.innerText().catch(() => '');
    if (/SKU列表|基本信息/.test(text) && !/发布产品|确认发布|选择发布店铺|发布配置/.test(text)) {
      continue;
    }
    const button = dialog.getByRole('button', { name: /确认发布|确定|确认|继续/ }).last()
      .or(dialog.locator('button:visible').filter({ hasText: /确认发布|确定|确认|继续/ }).last());
    if (await button.count()) {
      await clickWithOverlayFallback(button);
      return true;
    }
  }
  return false;
}

async function waitForPublishOutcome(page: Page) {
  const startedAt = Date.now();
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
  while (Date.now() - startedAt < 30_000) {
    const successText = await readVisiblePublishSuccessText(page);
    if (successText) {
      return successText;
    }

    await clickVisiblePublishConfirmDialog(page).catch(() => false);

    const errorText = await readVisibleMessageText(page, /失败|错误|异常|必填|必传|请上传|请选择|不能为空|未填写|不支持|无权限|超时|error/i);
    if (errorText) {
      throw new Error(`妙手保存并发布失败：${errorText}`);
    }

    const submittedText = await readVisibleMessageText(page, /成功|已提交|发布中|提交发布|任务已创建/i);
    if (submittedText) {
      return submittedText;
    }

    const editDialog = page.locator('.jx-dialog:visible').filter({ hasText: /SKU列表|保存并发布|基本信息/ }).last();
    if (!(await editDialog.count())) {
      return '保存并发布已提交，编辑弹窗已关闭';
    }
    await page.waitForTimeout(1000);
  }

  throw new Error('点击保存并发布后未检测到成功提示，编辑弹窗仍未关闭');
}

async function readVisiblePublishSuccessText(page: Page) {
  const dialog = page.locator('.jx-dialog:visible, .jx-message-box:visible, .jx-notification:visible, .jx-message:visible')
    .filter({ hasText: /产品发布成功|发布成功|提交发布成功|任务已创建|已提交发布/i })
    .last();
  if (await dialog.count()) {
    const text = (await dialog.innerText().catch(() => '')).trim();
    if (text) {
      return text.replace(/\s+/g, ' ').slice(0, 240);
    }
  }
  return '';
}

async function readVisibleMessageText(page: Page, pattern: RegExp) {
  const message = page.locator(
    '.jx-message:visible, .jx-notification:visible, .jx-message-box:visible, .jx-form-item__error:visible, .jx-dialog:visible .is-error:visible',
  ).filter({ hasText: pattern }).last();
  if (await message.count()) {
    const text = (await message.innerText().catch(() => '')).trim();
    if (text) {
      return text.replace(/\s+/g, ' ').slice(0, 240);
    }
  }
  return '';
}

async function applyBatchSourcePrice(page: Page, sourcePrice: number) {
  if (!Number.isFinite(sourcePrice) || sourcePrice <= 0) {
    throw new Error('统一货源价格缺失，无法批量修改货源价格');
  }
  await clickSkuHeaderBatchButton(page, '货源价格');
  const dialog = await waitDialogByTitle(page, /批量修改.*货源价格|批量修改.*价格|货源价格/);
  const input = dialog.locator('input.jx-input__inner:not([disabled])').first();
  await input.fill(formatPrice(sourcePrice));
  await clickButtonByText(dialog, ['确定']);
}

async function applyBatchDisplayPrice(page: Page, displayPrice?: number, template?: MiaoshouPricingTemplate) {
  await clickSkuHeaderBatchButton(page, '本地展示价');
  const dialog = await waitDialogByTitle(page, /本地展示价|批量修改.*展示价|批量修改.*价格/);
  void displayPrice;
  if (!template) {
    throw new Error('未配置妙手定价模板');
  }
  const applied = await applyPricingTemplateInDialog(dialog, template).catch(() => false);
  if (!applied) {
    throw new Error(`未能成功引用妙手定价模板：${template.name || template.priceTemplateId || '空模板'}`);
  }
  await clickButtonByText(dialog, ['确定']);
}

async function applyPricingTemplateInDialog(dialog: Locator, template: MiaoshouPricingTemplate) {
  const templateName = template.name.trim();
  if (!templateName) {
    return false;
  }

  const priceTemplateRadio = dialog.locator('input[type="radio"][value="priceTemplate"]').first();
  if (await priceTemplateRadio.count()) {
    await priceTemplateRadio.check({ force: true, timeout: 5_000 }).catch(() => undefined);
    await dialog.page().waitForTimeout(500);
  }

  const templateSelect = dialog.locator('.price-template-select:visible, .jx-select:visible').filter({ hasText: /请选择|模板/ }).first();
  if (await templateSelect.count()) {
    const wrapper = templateSelect.locator('.jx-select__wrapper').first();
    await clickWithOverlayFallback(await wrapper.count() ? wrapper : templateSelect);
    await dialog.page().waitForTimeout(800);
  } else {
    const labels = ['使用定价模板', '引用模板', '使用模板', '定价模板'];
    for (const label of labels) {
      const trigger = dialog.getByText(label, { exact: false }).first();
      if (await trigger.count()) {
        await clickWithOverlayFallback(trigger);
        await dialog.page().waitForTimeout(800);
        break;
      }
    }
  }

  const option = await findVisibleTemplateOption(dialog.page(), templateName);
  if (!option) {
    return false;
  }
  await clickTemplateOption(dialog.page(), option);
  await dialog.page().waitForTimeout(1200);
  const applyButton = dialog.getByRole('button', { name: /应用|引用|计算/ }).first();
  if (await applyButton.count()) {
    await clickWithOverlayFallback(applyButton);
    await dialog.page().waitForTimeout(1200);
  }
  return true;
}

async function findVisibleTemplateOption(page: Page, templateName: string): Promise<Locator | null> {
  const expected = normalizeReadableText(templateName);
  const options = page.locator(
    '.jx-select-dropdown:visible .jx-select-dropdown__item:not(.is-disabled), ' +
    '.jx-popper:visible li:not(.is-disabled), ' +
    '.jx-popper:visible [class*="option"]:not(.is-disabled), ' +
    '.jx-popper:visible [class*="item"]:not(.is-disabled), ' +
    '[role="option"]:visible',
  );
  const count = await options.count();
  for (let index = 0; index < count; index += 1) {
    const option = options.nth(index);
    const text = normalizeReadableText(await option.innerText().catch(() => ''));
    if (text && (text === expected || text.includes(expected) || expected.includes(text))) {
      return option;
    }
  }

  const fallback = page.locator('.jx-popper:visible, .jx-select-dropdown:visible')
    .getByText(templateName, { exact: false })
    .first();
  if (await fallback.count()) {
    return fallback;
  }
  return null;
}

async function clickTemplateOption(page: Page, option: Locator) {
  await option.scrollIntoViewIfNeeded().catch(() => undefined);
  await clickWithOverlayFallback(option).catch(() => undefined);
  await page.waitForTimeout(350);
  if (!(await hasVisibleSelectDropdown(page))) {
    return;
  }

  const box = await option.boundingBox().catch(() => null);
  if (box) {
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2).catch(() => undefined);
    await page.waitForTimeout(350);
    if (!(await hasVisibleSelectDropdown(page))) {
      return;
    }
  }

  await option.evaluate((element) => {
    const target = element.closest(
      '.jx-select-dropdown__item, li, [role="option"], [class*="option"], [class*="item"]',
    ) || element;
    for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click']) {
      target.dispatchEvent(new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view: window,
      }));
    }
  }).catch(() => undefined);
}

async function hasVisibleSelectDropdown(page: Page) {
  return await page
    .locator('.jx-select-dropdown:visible, .jx-popper:visible [role="listbox"], .jx-popper:visible .jx-select-dropdown__list')
    .first()
    .isVisible()
    .catch(() => false);
}

async function clickSkuHeaderBatchButton(page: Page, headerText: string) {
  const dialog = await ensureSkuListVisible(page);
  const header = dialog.locator('.pro-virtual-table__header-cell:visible').filter({ hasText: headerText }).first();
  await header.waitFor({ state: 'visible', timeout: 20_000 });
  await header.scrollIntoViewIfNeeded().catch(() => undefined);
  const button = header.getByRole('button', { name: /批量/ }).first();
  await clickFirstVisible(button);
}

async function ensureSkuListVisible(page: Page) {
  const dialog = page.locator('.jx-dialog:visible').filter({ hasText: /SKU列表|保存并发布|基本信息/ }).last();
  await dialog.waitFor({ state: 'visible', timeout: 20_000 });

  const skuLabel = dialog.getByText('SKU列表', { exact: false }).first();
  if (await skuLabel.count()) {
    await skuLabel.scrollIntoViewIfNeeded().catch(() => undefined);
  }

  const skuHeader = dialog.locator('.pro-virtual-table__header-cell:visible').filter({ hasText: /货源价格|本地展示价|重量/ }).first();
  await skuHeader.waitFor({ state: 'visible', timeout: 20_000 });
  await skuHeader.scrollIntoViewIfNeeded().catch(() => undefined);
  return dialog;
}

async function waitDialogByTitle(page: Page, titlePattern: RegExp) {
  const dialog = page.locator('.jx-dialog:visible').filter({ hasText: titlePattern }).last();
  await dialog.waitFor({ state: 'visible', timeout: 15_000 });
  return dialog;
}

async function openAnyPriceTemplateDropdown(page: Page) {
  const templateText = page.getByText(/引用模板|定价模板|使用模板/, { exact: false }).first();
  if (await templateText.count()) {
    await templateText.click();
    return;
  }
  const priceBatch = page.locator('.pro-virtual-table__header-cell:visible').filter({ hasText: '本地展示价' }).first();
  if (await priceBatch.count()) {
    await priceBatch.getByRole('button', { name: /批量/ }).first().click();
  }
}

async function extractPricingTemplatesFromResponse(response: Response, site?: string) {
  const url = response.url();
  if (!/price|template|pricing|calculate|calculatePrice|priceTemplate/i.test(url)) {
    return [];
  }
  const contentType = response.headers()['content-type'] ?? '';
  if (!contentType.includes('json')) {
    return [];
  }
  const payload = await response.json().catch(() => null) as unknown;
  return extractTemplatesFromUnknown(payload, site);
}

async function extractVisiblePricingTemplates(page: Page, site?: string) {
  const values = await page.locator('.jx-select-dropdown:visible .jx-select-dropdown__item, .jx-popper:visible li, [role="option"]:visible')
    .evaluateAll((nodes) => nodes.map((node) => ({
      text: (node.textContent ?? '').trim(),
      id: node.getAttribute('value') ?? node.getAttribute('data-value') ?? node.getAttribute('id') ?? '',
    })));
  return values
    .filter((item) => item.text && !/请选择|无数据|loading/i.test(item.text))
    .map((item) => normalizeTemplate({
      priceTemplateId: item.id || item.text,
      name: item.text,
      site: site || '',
    }))
    .filter(Boolean) as MiaoshouPricingTemplate[];
}

function extractTemplatesFromUnknown(value: unknown, site?: string): MiaoshouPricingTemplate[] {
  const found: MiaoshouPricingTemplate[] = [];
  const visit = (candidate: unknown) => {
    if (!candidate || typeof candidate !== 'object') {
      return;
    }
    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        visit(item);
      }
      return;
    }
    const record = candidate as Record<string, unknown>;
    const normalized = normalizeTemplate({
      ...record,
      site: record.site ?? record.siteType ?? site ?? '',
    });
    if (normalized && (record.priceTemplateId || record.templateId || record.id) && (record.name || record.templateName)) {
      found.push(normalized);
    }
    for (const nested of Object.values(record)) {
      if (nested && typeof nested === 'object') {
        visit(nested);
      }
    }
  };
  visit(value);
  return dedupeTemplates(found);
}

function normalizeTemplate(value: unknown): MiaoshouPricingTemplate | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const name = String(record.name ?? record.templateName ?? record.priceTemplateName ?? '').trim();
  const priceTemplateId = String(record.priceTemplateId ?? record.templateId ?? record.id ?? '').trim();
  const site = normalizeSite(String(record.site ?? record.siteType ?? record.country ?? '').trim());
  if (!name && !priceTemplateId) {
    return null;
  }
  return {
    priceTemplateId: priceTemplateId || name,
    name: name || priceTemplateId,
    site,
    siteType: stringOrUndefined(record.siteType),
    currency: stringOrUndefined(record.currency),
    profitPercent: primitiveOrUndefined(record.profitPercent),
    discount: primitiveOrUndefined(record.discount),
    platformChargePercent: primitiveOrUndefined(record.platformChargePercent),
    paymentChargePercent: primitiveOrUndefined(record.paymentChargePercent),
    withdrawChargePercent: primitiveOrUndefined(record.withdrawChargePercent),
    affiliateChargePercent: primitiveOrUndefined(record.affiliateChargePercent),
    vatChargePercent: primitiveOrUndefined(record.vatChargePercent),
    tariffChargePercent: primitiveOrUndefined(record.tariffChargePercent),
    bcpChargePercent: primitiveOrUndefined(record.bcpChargePercent),
    otherCharge: primitiveOrUndefined(record.otherCharge),
    weightRefType: stringOrUndefined(record.weightRefType),
    logisticsComputeType: stringOrUndefined(record.logisticsComputeType),
    displayWeightUnit: stringOrUndefined(record.displayWeightUnit),
    updatedAt: new Date().toISOString(),
  };
}

function parseTemplateMappings(value: string) {
  return String(value ?? '')
    .split(/\r?\n|;/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [rawSite = '', right = ''] = line.split(/=(.*)/s);
      const [templateId = '', templateName = ''] = right.split('|');
      return {
        site: normalizeSite(rawSite),
        templateId: templateId.trim(),
        templateName: templateName.trim(),
      };
    })
    .filter((item) => item.site && (item.templateId || item.templateName));
}

function dedupeTemplates(templates: MiaoshouPricingTemplate[]) {
  const seen = new Set<string>();
  return templates.filter((template) => {
    const key = buildTemplateKey(template);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function buildTemplateKey(template: MiaoshouPricingTemplate) {
  return `${normalizeSite(template.site)}__${template.priceTemplateId || template.name}`;
}

function primitiveOrUndefined(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? value : undefined;
}

function stringOrUndefined(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
}

async function clickFirstVisible(locator: Locator) {
  const count = await locator.count();
  for (let index = 0; index < count; index += 1) {
    const item = locator.nth(index);
    if (await item.isVisible().catch(() => false)) {
      await clickWithOverlayFallback(item);
      return;
    }
  }
  throw new Error('未找到可点击的页面按钮');
}

async function clickWithOverlayFallback(locator: Locator) {
  const page = locator.page();
  try {
    await locator.click({ timeout: 10_000 });
    return;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/intercepts pointer events|Timeout/i.test(message)) {
      throw error;
    }
  }

  try {
    await locator.click({ force: true, timeout: 5_000 });
    return;
  } catch {
    // Continue with lower-level fallbacks for component libraries whose overlays
    // sit above the clickable node while visually exposing the control.
  }

  const box = await locator.boundingBox().catch(() => null);
  if (box) {
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2).catch(() => undefined);
    await page.waitForTimeout(100);
    return;
  }

  await locator.evaluate((element) => {
    if (!(element instanceof HTMLElement)) {
      return;
    }
    for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click']) {
      element.dispatchEvent(new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view: window,
      }));
    }
  });
}

async function clickButtonByText(scope: Locator, texts: string[]) {
  for (const text of texts) {
    const button = scope.getByRole('button', { name: new RegExp(escapeRegExp(text)) }).last();
    if (await button.count()) {
      await clickWithOverlayFallback(button);
      return;
    }
    const fallback = scope.locator('button:visible').filter({ hasText: text }).last();
    if (await fallback.count()) {
      await clickWithOverlayFallback(fallback);
      return;
    }
  }
  throw new Error(`未找到按钮：${texts.join('/')}`);
}

function normalizeSite(value: string) {
  return value.trim().toUpperCase();
}

function hasSizeChartRequiredText(value: string) {
  return /尺码(?:图|表|图表)?.{0,12}(?:必传|必填|上传)|请上传尺码(?:图|表|图表)|尺码图必传/.test(value);
}

function formatPrice(value: number) {
  const rounded = Math.round(Number(value) * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

function formatDimensionValue(value: number) {
  const rounded = Math.round(Number(value) * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

function safePackageDimension(value: number | undefined) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : 10;
}

function sanitizeFilePart(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80) || 'item';
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cssEscape(value: string) {
  return value.replace(/["\\]/g, '\\$&');
}

async function dismissFloatingOverlays(page: Page) {
  await page.evaluate(() => {
    const selectors = [
      '.banner-layout-tools',
      '.basic-layout-tools',
      '.activity-popover',
      '.activity-banner',
    ];
    for (const selector of selectors) {
      for (const element of document.querySelectorAll<HTMLElement>(selector)) {
        element.style.pointerEvents = 'none';
      }
    }
  }).catch(() => undefined);

  const closeButtons = page.locator('.banner-layout-tools button, .banner-layout-tools .close, .basic-layout-tools button').filter({ hasText: /关闭|收起|×|x/i });
  const count = await closeButtons.count().catch(() => 0);
  for (let index = 0; index < Math.min(count, 3); index += 1) {
    await closeButtons.nth(index).click({ force: true, timeout: 1000 }).catch(() => undefined);
  }
}

function installSafeDialogHandlers(context: BrowserContext) {
  if (!dialogHandlerContexts.has(context)) {
    dialogHandlerContexts.add(context);
    context.on('page', (page) => installSafeDialogHandler(page));
  }
  for (const page of context.pages()) {
    installSafeDialogHandler(page);
  }
}

function installSafeDialogHandler(page: Page) {
  if (dialogHandlerPages.has(page)) {
    return;
  }
  dialogHandlerPages.add(page);
  page.on('dialog', async (dialog) => {
    await dialog.accept().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      if (!/No dialog is showing|Target closed|Session closed/i.test(message)) {
        console.warn(`妙手页面弹窗自动确认失败：${message}`);
      }
    });
  });
}
