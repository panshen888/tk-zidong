import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import Store from 'electron-store';
import ExcelJS from 'exceljs';
import { defaultSettings } from '../../shared/defaults';
import type {
  AppSettings,
  AuthSession,
  CommerceListingEditInput,
  CommerceListingPricingSyncInput,
  CommerceMiaoshouBrowserPublishInput,
  CommerceMiaoshouDraftRetryInput,
  CommerceMiaoshouDraftSaveInput,
  CommerceMiaoshouPublishInput,
  CommerceMiaoshouPublishVerifyInput,
  CommercePublishedMaintenanceInput,
  CommercePublishCheckInput,
  CommerceShopConfigExportInput,
  CommerceShopQueryInput,
  CreateTaskInput,
  FeishuBitableConfig,
  ListingShopMapping,
  PriceComparisonReviewGenerationInput,
  Task,
  TaskLogEntry,
  TaskRun,
} from '../../shared/types';
import { assertAppChromeCdpOwnership, assertChromeCdpPortAvailableOrAppOwned, openAppChromeLoginPage, waitForChromeCdp } from './chromeSession';
import { generateLocalPriceComparisonReviewTable, hasPendingLocalExcelRows, writeLocalThreeTableTemplate } from './excelService';
import { assertFeishuBitableConfig, assertFeishuCredentials, FeishuBitableClient } from './feishuBitableService';
import {
  parseMiaoshouPricingTemplatesJson,
  publishMiaoshouListingRowByBrowser,
  refreshMiaoshouPricingTemplatesFromBrowser,
  resolvePricingTemplateForSite,
  upsertTemplateMapping,
} from './miaoshouBrowserListingService';
import { assertMiaoshouCredentials, MiaoshouOpenApiClient } from './miaoshouOpenApiService';
import { normalizeAuthConfig, ServerAuthService } from './serverAuthService';
import { startTaskRun } from './taskRunner';
import { timestampId, type TaskStore } from './taskStore';

type StoreSchema = {
  settings: AppSettings;
  tasks: Task[];
  runs: TaskRun[];
  logs: Record<string, TaskLogEntry[]>;
  authSession?: AuthSession;
};

type LegacyAppSettings = AppSettings & {
  concurrency?: number;
};

type LegacyTask = Task & {
  outputExcelPath?: string;
};

const chromeExecutableCandidates =
  process.platform === 'darwin'
    ? [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        path.join(os.homedir(), 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'),
        '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
      ]
    : process.platform === 'win32'
      ? [
          path.join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
          path.join(process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
          path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'), 'Google', 'Chrome', 'Application', 'chrome.exe'),
          path.join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'Google', 'Chrome Beta', 'Application', 'chrome.exe'),
          path.join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'Google', 'Chrome SxS', 'Application', 'chrome.exe'),
        ]
      : [
          '/usr/bin/google-chrome',
          '/usr/bin/google-chrome-stable',
          '/usr/bin/chromium',
          '/usr/bin/chromium-browser',
        ];

const mainDefaultSettings: AppSettings = {
  ...defaultSettings,
  defaultOutputDir: path.join(os.homedir(), 'Documents', 'TikTok AI Flow', 'outputs'),
  defaultAssetDir: path.join(os.homedir(), 'Documents', 'TikTok AI Flow', 'tasks'),
};
const defaultListingShopSites = ['MY', 'SG', 'PH', 'VN', 'TH'];

function normalizeSourcingMode(value: unknown): AppSettings['sourcingMode'] {
  return value === 'accurate' ? 'accurate' : 'fast';
}

function normalizeAcceptedCandidateLimit(value: unknown, mode: AppSettings['sourcingMode'] = defaultSettings.sourcingMode) {
  return Math.min(mode === 'fast' ? 3 : 10, Math.max(1, Number(value) || defaultSettings.acceptedCandidateLimit));
}

function normalizeListingCollectSource(value: unknown): AppSettings['listingCollectSource'] {
  return value === 'offerUrl' ? 'offerUrl' : 'sourceUrl';
}

function normalizeRate(value: unknown, fallback: number, max = 1) {
  const next = Number(value);
  return Number.isFinite(next) ? Math.min(max, Math.max(0, next)) : fallback;
}

function normalizeMissing1688SalesAction(value: unknown): AppSettings['missing1688SalesAction'] {
  return ['ignore', 'markRisk', 'filter'].includes(String(value)) ? value as AppSettings['missing1688SalesAction'] : defaultSettings.missing1688SalesAction;
}

function parseListingShopMappings(value: unknown): ListingShopMapping[] {
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

function normalizeListingShopMappings(value: unknown) {
  return parseListingShopMappings(value)
    .map((mapping) => `${mapping.site}=${mapping.shopId}${mapping.shopName ? `|${mapping.shopName}` : ''}`)
    .join('\n');
}

function normalizeListingShippingFormulas(value: unknown) {
  const lines = String(value ?? '')
    .split(/\r?\n|;/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length > 0 ? lines.join('\n') : defaultSettings.listingShippingFormulas;
}

function normalizeShopConfigSites(sites: unknown) {
  const values = Array.isArray(sites) ? sites : defaultListingShopSites;
  return [...new Set(
    values
      .map((site) => String(site ?? '').trim().toUpperCase())
      .filter(Boolean),
  )];
}

function normalizeAutoGenerateListingReviewTable(value: unknown) {
  return typeof value === 'boolean' ? value : defaultSettings.autoGenerateListingReviewTable;
}

function normalize1688EnhancedFilterSettings(settings: Partial<AppSettings>) {
  return {
    enable1688RealFactoryFilter: typeof settings.enable1688RealFactoryFilter === 'boolean'
      ? settings.enable1688RealFactoryFilter
      : defaultSettings.enable1688RealFactoryFilter,
    enable1688StrengthFactoryFilter: typeof settings.enable1688StrengthFactoryFilter === 'boolean'
      ? settings.enable1688StrengthFactoryFilter
      : defaultSettings.enable1688StrengthFactoryFilter,
    enable1688AnnualSalesFilter: typeof settings.enable1688AnnualSalesFilter === 'boolean'
      ? settings.enable1688AnnualSalesFilter
      : defaultSettings.enable1688AnnualSalesFilter,
    min1688AnnualSales: Math.max(0, Number(settings.min1688AnnualSales) || defaultSettings.min1688AnnualSales),
    enable1688MonthlySalesFilter: typeof settings.enable1688MonthlySalesFilter === 'boolean'
      ? settings.enable1688MonthlySalesFilter
      : defaultSettings.enable1688MonthlySalesFilter,
    min1688MonthlySales: Math.max(0, Number(settings.min1688MonthlySales) || defaultSettings.min1688MonthlySales),
    enable1688SalesReference: typeof settings.enable1688SalesReference === 'boolean'
      ? settings.enable1688SalesReference
      : defaultSettings.enable1688SalesReference,
    min1688SalesVolume: Math.max(0, Number(settings.min1688SalesVolume) || defaultSettings.min1688SalesVolume),
    missing1688SalesAction: normalizeMissing1688SalesAction(settings.missing1688SalesAction),
  };
}

function normalizeEnableMiaoshouListingApi(value: unknown) {
  return typeof value === 'boolean' ? value : defaultSettings.enableMiaoshouListingApi;
}

function assertMiaoshouListingApiEnabled(settings: AppSettings) {
  if (!settings.enableMiaoshouListingApi) {
    throw new Error('AI上架需要先在「AI上架配置」中勾选“启用妙手接口上架”，并配置好妙手开放平台 AppKey、AppSecret、账号ID 和目标店铺。没有妙手接口权限时，请先只使用 AI比价和表三人工核实。');
  }
}

function getCurrencyForSite(site: string) {
  const normalizedSite = site.trim().toUpperCase();
  const map: Record<string, string> = {
    MY: 'MYR',
    SG: 'SGD',
    PH: 'PHP',
    VN: 'VND',
    TH: 'THB',
    ID: 'IDR',
    US: 'USD',
    GB: 'GBP',
    UK: 'GBP',
  };
  return map[normalizedSite] ?? normalizedSite;
}

function parseExchangeRateForSite(value: string, site: string) {
  const targetCurrency = getCurrencyForSite(site);
  const targetSite = site.trim().toUpperCase();
  for (const rawLine of String(value ?? '').split(/\r?\n|,|;/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    const [rawKey = '', rawValue = ''] = line.split(/[:=]/);
    const rate = Number(rawValue.trim());
    if (!Number.isFinite(rate)) {
      continue;
    }
    const key = rawKey.trim().toUpperCase();
    const currency = key.includes('/') ? key.split('/')[0].trim() : getCurrencyForSite(key);
    if (currency === targetCurrency || key === targetSite) {
      return rate;
    }
  }
  return 0;
}

function getConfiguredPricingSites(settings: AppSettings) {
  const sites = new Set<string>();
  if (settings.targetSite?.trim()) {
    sites.add(settings.targetSite.trim().toUpperCase());
  }
  for (const mapping of parseListingShopMappings(settings.listingShopMappings)) {
    sites.add(mapping.site);
  }
  for (const rawLine of String(settings.listingShippingFormulas ?? '').split(/\r?\n|;/)) {
    const site = rawLine.trim().split('|')[0]?.trim().toUpperCase();
    if (site) {
      sites.add(site);
    }
  }
  return [...sites].filter(Boolean);
}

const store = new Store<StoreSchema>({
  defaults: {
    settings: mainDefaultSettings,
    tasks: [],
    runs: [],
    logs: {},
    authSession: undefined,
  },
});
const runningRunControllers = new Map<string, AbortController>();
const realtimeTaskControllers = new Map<string, { timer?: ReturnType<typeof setTimeout>; running: boolean; stopped: boolean }>();
let userGuideWindow: BrowserWindow | null = null;

const authService = new ServerAuthService({
  getConfig: () => getStoredAuthConfig(),
  setConfig: (config) => saveStoredAuthConfig(config),
  getSession: () => store.get('authSession'),
  setSession: (session) => {
    if (session) {
      store.set('authSession', session);
      return;
    }
    store.delete('authSession');
  },
});

function getStoredAuthConfig() {
  const settings = store.get('settings') ?? mainDefaultSettings;
  return normalizeAuthConfig({
    serverBaseUrl: settings.authServerBaseUrl || defaultSettings.authServerBaseUrl,
    appKey: settings.authAppKey || defaultSettings.authAppKey,
  });
}

function saveStoredAuthConfig(config: { serverBaseUrl: string; appKey: string }) {
  const normalized = normalizeAuthConfig(config);
  store.set('settings', {
    ...(store.get('settings') ?? mainDefaultSettings),
    authServerBaseUrl: normalized.serverBaseUrl,
    authAppKey: normalized.appKey,
  });
}

function getPreloadPath() {
  const currentDirPreloadPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../preload/preload.js');
  if (existsSync(currentDirPreloadPath)) {
    return currentDirPreloadPath;
  }
  return path.join(app.getAppPath(), 'dist', 'preload', 'preload.js');
}

async function findChromeExecutable() {
  for (const candidatePath of chromeExecutableCandidates) {
    try {
      await fs.access(candidatePath);
      return candidatePath;
    } catch {
      // Try next common path.
    }
  }

  return '';
}

function getHiddenChromeUserDataDir() {
  return path.join(app.getPath('userData'), 'chrome-profile');
}

async function openUserGuideWindow() {
  if (userGuideWindow && !userGuideWindow.isDestroyed()) {
    userGuideWindow.show();
    userGuideWindow.focus();
    return;
  }

  userGuideWindow = new BrowserWindow({
    width: 900,
    height: 860,
    minWidth: 760,
    minHeight: 620,
    title: '使用说明 - TikTok AI Flow',
    backgroundColor: '#f4efe6',
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  userGuideWindow.on('closed', () => {
    userGuideWindow = null;
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    await userGuideWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}/#/guide`);
  } else {
    await userGuideWindow.loadFile(path.join(app.getAppPath(), 'dist', 'renderer', 'index.html'), { hash: '/guide' });
  }
}

function stripLegacyTaskConcurrency(settings: AppSettings | LegacyAppSettings): AppSettings {
  const { concurrency: _concurrency, ...nextSettings } = settings as LegacyAppSettings;
  void _concurrency;
  return nextSettings;
}

function normalizeBitableConfig(config?: Partial<FeishuBitableConfig>): FeishuBitableConfig {
  return {
    appToken: config?.appToken?.trim() ?? '',
    tableId: config?.tableId?.trim() ?? '',
    viewId: config?.viewId?.trim() ?? '',
  };
}

function getCommerceTableInput(task: Task) {
  if ((task.inputSource ?? 'excel') !== 'feishuBitable') {
    throw new Error('上架流程第一版只支持飞书多维表格任务');
  }

  assertFeishuBitableConfig('输出', task.outputBitable);
  return {
    appToken: task.outputBitable.appToken,
  };
}

function formatBitableLocation(config?: FeishuBitableConfig) {
  if (!config) {
    return '';
  }

  return `feishu://${config.appToken}/${config.tableId}${config.viewId ? `?view=${config.viewId}` : ''}`;
}

async function writeMiaoshouShopConfigExcel(outputExcelPath: string, shops: Awaited<ReturnType<MiaoshouOpenApiClient['queryShopsBySites']>>) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TikTok AI Flow';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('妙手店铺配置');
  sheet.columns = [
    { header: '站点', key: 'site', width: 12 },
    { header: '站点名称', key: 'siteName', width: 16 },
    { header: '店铺ID', key: 'shopId', width: 16 },
    { header: '店铺名称', key: 'shopNick', width: 28 },
    { header: '平台', key: 'platform', width: 14 },
    { header: '是否跨境', key: 'isCb', width: 10 },
    { header: '是否CNSC', key: 'isCnsc', width: 10 },
    { header: '授权状态', key: 'status', width: 14 },
    { header: '授权到期时间', key: 'gmtExpire', width: 22 },
    { header: '最后授权时间', key: 'gmtLastAuth', width: 22 },
    { header: '填入AI上架配置-目标站点', key: 'configSite', width: 26 },
    { header: '填入AI上架配置-目标店铺ID', key: 'configShopId', width: 30 },
    { header: '填入AI上架配置-目标店铺名称', key: 'configShopName', width: 32 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).alignment = { vertical: 'middle' };
  for (const shop of shops.sort((left, right) => String(left.site).localeCompare(String(right.site)) || String(left.shopNick ?? '').localeCompare(String(right.shopNick ?? '')))) {
    sheet.addRow({
      site: shop.site ?? '',
      siteName: shop.siteName ?? '',
      shopId: shop.shopId ?? '',
      shopNick: shop.shopNick ?? '',
      platform: shop.platform ?? '',
      isCb: shop.isCb ?? '',
      isCnsc: shop.isCnsc ?? '',
      status: shop.status ?? '',
      gmtExpire: shop.gmtExpire ?? '',
      gmtLastAuth: shop.gmtLastAuth ?? '',
      configSite: shop.site ?? '',
      configShopId: shop.shopId ?? '',
      configShopName: shop.shopNick ?? '',
    });
  }
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  await fs.mkdir(path.dirname(outputExcelPath), { recursive: true });
  await workbook.xlsx.writeFile(outputExcelPath);
}

function getPriceComparisonTableInput(settings: AppSettings) {
  const inputBitable = normalizeBitableConfig(settings.priceInputBitable);
  const outputBitable = normalizeBitableConfig(settings.priceOutputBitable);
  const reviewBitable = normalizeBitableConfig(settings.priceReviewBitable);
  const appToken = inputBitable.appToken || outputBitable.appToken || reviewBitable.appToken || settings.lastFeishuOutputBitable.appToken;
  if (!appToken) {
    throw new Error('请先在 AI比价配置填写三表 app_token，或至少保留一个已创建的飞书输出表 app_token');
  }

  return {
    appToken,
    inputBitable: { ...inputBitable, appToken: inputBitable.appToken || appToken },
    outputBitable: { ...outputBitable, appToken: outputBitable.appToken || appToken },
    reviewBitable: { ...reviewBitable, appToken: reviewBitable.appToken || appToken },
  };
}

function getListingResultTableInput(settings: AppSettings) {
  const listingResultBitable = normalizeBitableConfig(settings.listingResultBitable);
  const appToken =
    listingResultBitable.appToken ||
    settings.priceReviewBitable.appToken ||
    settings.priceOutputBitable.appToken ||
    settings.priceInputBitable.appToken ||
    settings.lastFeishuOutputBitable.appToken ||
    settings.lastFeishuInputBitable.appToken;
  if (!appToken) {
    throw new Error('请先在 AI比价配置创建三表，或在 AI上架配置填写 AI上架结果表 app_token');
  }

  return {
    appToken,
    listingResultBitable: {
      ...listingResultBitable,
      appToken: listingResultBitable.appToken || appToken,
    },
  };
}

function getPriceComparisonDuplicateScope(settings: AppSettings, task: Task) {
  const tableInput = getPriceComparisonTableInput(settings);
  return {
    inputBitable: tableInput.inputBitable.tableId ? tableInput.inputBitable : task.inputBitable,
    outputBitable: tableInput.outputBitable.tableId ? tableInput.outputBitable : task.outputBitable,
    reviewBitable: tableInput.reviewBitable.tableId ? tableInput.reviewBitable : undefined,
  };
}

async function ensureLoginBrowserReadyForTask(settings: AppSettings, task: Task) {
  const searchAdapterMode = settings.searchAdapterMode ?? task.searchAdapterMode ?? defaultSettings.searchAdapterMode;
  const chromeMode = settings.chromeMode ?? defaultSettings.chromeMode;
  if (searchAdapterMode !== 'real1688' || chromeMode !== 'connect') {
    return;
  }

  const chromeCdpUrl = settings.chromeCdpUrl || defaultSettings.chromeCdpUrl;
  try {
    await waitForChromeCdp(chromeCdpUrl, 5000);
    await assertAppChromeCdpOwnership({
      chromeCdpUrl,
      chromeUserDataDir: settings.chromeUserDataDir,
    });
    return;
  } catch {
    await openAppChromeLoginPage({
      chromeExecutablePath: settings.chromeExecutablePath,
      chromeUserDataDir: settings.chromeUserDataDir,
      imageSearchUrl: settings.imageSearchUrl || defaultSettings.imageSearchUrl,
      extraLoginUrls: [
        'https://zhenghedata.com/',
        'https://erp.91miaoshou.com/',
      ],
      pageTimeoutMs: settings.pageTimeoutMs,
      headless: false,
    });
    await waitForChromeCdp(chromeCdpUrl, 30000);
  }
}

async function syncListingPricingForConfiguredSites(
  feishuClient: FeishuBitableClient,
  settings: AppSettings,
  tableInput = getPriceComparisonTableInput(settings),
) {
  let updatedCount = 0;
  for (const site of getConfiguredPricingSites(settings)) {
    const result = await feishuClient.syncListingPricingConfigToReviewTable({
      ...tableInput,
      site,
      exchangeRate: parseExchangeRateForSite(settings.listingExchangeRates, site),
      targetProfitRate: settings.listingTargetProfitRate,
      discountRate: settings.listingDiscountRate,
      tkFeeRate: settings.listingTkFeeRate,
      shippingFormulas: settings.listingShippingFormulas,
    });
    updatedCount += result.updatedCount;
  }
  return updatedCount;
}

async function getNormalizedSettings() {
  const settings = {
    ...mainDefaultSettings,
    ...stripLegacyTaskConcurrency(store.get('settings') as LegacyAppSettings),
  };
  if (settings.chromeExecutablePath) {
    const nextSettings: AppSettings = {
      ...settings,
      sourcingMode: normalizeSourcingMode(settings.sourcingMode),
      acceptedCandidateLimit: normalizeAcceptedCandidateLimit(settings.acceptedCandidateLimit, normalizeSourcingMode(settings.sourcingMode)),
      aiListBatchSize: Math.max(1, Number(settings.aiListBatchSize) || defaultSettings.aiListBatchSize),
      listingCollectSource: normalizeListingCollectSource(settings.listingCollectSource),
      listingShopMappings: normalizeListingShopMappings(settings.listingShopMappings),
      miaoshouPricingTemplatesJson: settings.miaoshouPricingTemplatesJson || defaultSettings.miaoshouPricingTemplatesJson,
      miaoshouPricingTemplateMappings: settings.miaoshouPricingTemplateMappings || '',
      miaoshouSizeChartImageUrl: settings.miaoshouSizeChartImageUrl || '',
      listingExchangeRates: settings.listingExchangeRates || defaultSettings.listingExchangeRates,
      listingTargetProfitRate: Number(settings.listingTargetProfitRate) || defaultSettings.listingTargetProfitRate,
      listingDiscountRate: normalizeRate(settings.listingDiscountRate, defaultSettings.listingDiscountRate, 0.95),
      listingTkFeeRate: normalizeRate(settings.listingTkFeeRate, defaultSettings.listingTkFeeRate, 0.95),
      listingShippingFormulas: normalizeListingShippingFormulas(settings.listingShippingFormulas),
      chromeMode: settings.chromeMode ?? defaultSettings.chromeMode,
      chromeCdpUrl: settings.chromeCdpUrl || defaultSettings.chromeCdpUrl,
      chromeUserDataDir: getHiddenChromeUserDataDir(),
      lastFeishuInputBitable: normalizeBitableConfig(settings.lastFeishuInputBitable),
      lastFeishuOutputBitable: normalizeBitableConfig(settings.lastFeishuOutputBitable),
      priceInputBitable: normalizeBitableConfig(settings.priceInputBitable),
      priceOutputBitable: normalizeBitableConfig(settings.priceOutputBitable),
      priceReviewBitable: normalizeBitableConfig(settings.priceReviewBitable),
      listingResultBitable: normalizeBitableConfig(settings.listingResultBitable),
      weightGroupToleranceGram: Math.max(0, Number(settings.weightGroupToleranceGram) || defaultSettings.weightGroupToleranceGram),
      autoGenerateListingReviewTable: normalizeAutoGenerateListingReviewTable(settings.autoGenerateListingReviewTable),
      enableMiaoshouListingApi: normalizeEnableMiaoshouListingApi(settings.enableMiaoshouListingApi),
      ...normalize1688EnhancedFilterSettings(settings),
    };
    store.set('settings', nextSettings);
    await migrateLegacyTaskRuns(nextSettings);
    return nextSettings;
  }

  const chromeExecutablePath = await findChromeExecutable();
  const nextSettings: AppSettings = {
    ...settings,
    sourcingMode: normalizeSourcingMode(settings.sourcingMode),
    acceptedCandidateLimit: normalizeAcceptedCandidateLimit(settings.acceptedCandidateLimit, normalizeSourcingMode(settings.sourcingMode)),
    aiListBatchSize: Math.max(1, Number(settings.aiListBatchSize) || defaultSettings.aiListBatchSize),
    listingCollectSource: normalizeListingCollectSource(settings.listingCollectSource),
    listingShopMappings: normalizeListingShopMappings(settings.listingShopMappings),
    miaoshouPricingTemplatesJson: settings.miaoshouPricingTemplatesJson || defaultSettings.miaoshouPricingTemplatesJson,
    miaoshouPricingTemplateMappings: settings.miaoshouPricingTemplateMappings || '',
    miaoshouSizeChartImageUrl: settings.miaoshouSizeChartImageUrl || '',
    listingExchangeRates: settings.listingExchangeRates || defaultSettings.listingExchangeRates,
    listingTargetProfitRate: Number(settings.listingTargetProfitRate) || defaultSettings.listingTargetProfitRate,
    listingDiscountRate: normalizeRate(settings.listingDiscountRate, defaultSettings.listingDiscountRate, 0.95),
    listingTkFeeRate: normalizeRate(settings.listingTkFeeRate, defaultSettings.listingTkFeeRate, 0.95),
    listingShippingFormulas: normalizeListingShippingFormulas(settings.listingShippingFormulas),
    chromeMode: settings.chromeMode ?? defaultSettings.chromeMode,
    chromeCdpUrl: settings.chromeCdpUrl || defaultSettings.chromeCdpUrl,
    chromeExecutablePath,
    chromeUserDataDir: getHiddenChromeUserDataDir(),
    lastFeishuInputBitable: normalizeBitableConfig(settings.lastFeishuInputBitable),
    lastFeishuOutputBitable: normalizeBitableConfig(settings.lastFeishuOutputBitable),
    priceInputBitable: normalizeBitableConfig(settings.priceInputBitable),
    priceOutputBitable: normalizeBitableConfig(settings.priceOutputBitable),
    priceReviewBitable: normalizeBitableConfig(settings.priceReviewBitable),
    listingResultBitable: normalizeBitableConfig(settings.listingResultBitable),
    weightGroupToleranceGram: Math.max(0, Number(settings.weightGroupToleranceGram) || defaultSettings.weightGroupToleranceGram),
    autoGenerateListingReviewTable: normalizeAutoGenerateListingReviewTable(settings.autoGenerateListingReviewTable),
    enableMiaoshouListingApi: normalizeEnableMiaoshouListingApi(settings.enableMiaoshouListingApi),
    ...normalize1688EnhancedFilterSettings(settings),
  };
  store.set('settings', nextSettings);
  await migrateLegacyTaskRuns(nextSettings);
  return nextSettings;
}

async function migrateLegacyTaskRuns(settings: AppSettings) {
  const tasks = (store.get('tasks') ?? []) as LegacyTask[];
  const runs = store.get('runs') ?? [];
  const logs = store.get('logs') ?? {};
  let changed = false;
  const nextRuns = [...runs];
  const nextTasks: Task[] = [];
  const nextLogs = { ...logs };

  for (const legacyTask of tasks) {
    const existingRuns = nextRuns.filter((run) => run.taskId === legacyTask.id);
    const sourcingMode = normalizeSourcingMode(legacyTask.sourcingMode ?? settings.sourcingMode);
    const acceptedCandidateLimit = normalizeAcceptedCandidateLimit(
      legacyTask.acceptedCandidateLimit ?? settings.acceptedCandidateLimit,
      sourcingMode,
    );
    if (existingRuns.length > 0 || (!legacyTask.outputExcelPath && !nextLogs[legacyTask.id]?.length)) {
      const { outputExcelPath: _outputExcelPath, ...task } = legacyTask;
      void _outputExcelPath;
      nextTasks.push({ ...task, sourcingMode, acceptedCandidateLimit });
      continue;
    }

    const runId = timestampId('run_legacy');
    const runAssetDir = path.join(legacyTask.assetDir, 'runs', runId);
    await fs.mkdir(runAssetDir, { recursive: true });
    await moveLegacyRunDir(legacyTask.assetDir, runAssetDir, 'input');
    await moveLegacyRunDir(legacyTask.assetDir, runAssetDir, 'images');
    await moveLegacyRunDir(legacyTask.assetDir, runAssetDir, 'output');
    await moveLegacyRunDir(legacyTask.assetDir, runAssetDir, 'logs');

    const runStatus = legacyTask.status === 'running' ? 'cancelled' : legacyTask.status;
    const run: TaskRun = {
      id: runId,
      taskId: legacyTask.id,
      name: `${legacyTask.name}-历史执行`,
      status: runStatus,
      inputSource: legacyTask.inputSource ?? 'excel',
      inputExcelPath: legacyTask.inputExcelPath,
      outputExcelPath: path.join(runAssetDir, 'output', path.basename(legacyTask.outputExcelPath || 'result.xlsx')),
      inputBitable: legacyTask.inputBitable,
      outputBitable: legacyTask.outputBitable,
      assetDir: runAssetDir,
      candidateLimit: legacyTask.candidateLimit,
      acceptedCandidateLimit,
      sourcingMode,
      parseDetail: legacyTask.parseDetail,
      searchAdapterMode: legacyTask.searchAdapterMode,
      totalCount: legacyTask.totalCount,
      successCount: legacyTask.successCount,
      failedCount: legacyTask.failedCount,
      createdAt: legacyTask.startedAt ?? legacyTask.createdAt,
      startedAt: legacyTask.startedAt,
      finishedAt: legacyTask.finishedAt ?? (legacyTask.status === 'running' ? new Date().toISOString() : undefined),
    };
    nextRuns.push(run);

    if (nextLogs[legacyTask.id]?.length) {
      nextLogs[runId] = nextLogs[legacyTask.id].map((entry) => ({ ...entry, taskId: legacyTask.id, runId }));
      delete nextLogs[legacyTask.id];
    }

    const { outputExcelPath: _outputExcelPath, ...task } = legacyTask;
    void _outputExcelPath;
    nextTasks.push({
      ...task,
      status: run.status,
      inputSource: task.inputSource ?? 'excel',
      sourcingMode,
      acceptedCandidateLimit,
      latestRunId: runId,
      currentRunId: undefined,
      finishedAt: run.finishedAt,
    });
    changed = true;
  }

  if (changed) {
    store.set('tasks', nextTasks);
    store.set('runs', nextRuns);
    store.set('logs', nextLogs);
  }
}

async function moveLegacyRunDir(taskAssetDir: string, runAssetDir: string, dirName: string) {
  const sourceDir = path.join(taskAssetDir, dirName);
  const targetDir = path.join(runAssetDir, dirName);
  try {
    await fs.access(sourceDir);
  } catch {
    await fs.mkdir(targetDir, { recursive: true });
    return;
  }

  try {
    await fs.access(targetDir);
    return;
  } catch {
    await fs.rename(sourceDir, targetDir);
  }
}

function sanitizeFilePart(value: string) {
  return value.replace(/[^\w\u4e00-\u9fa5-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

async function ensureTaskFolders(task: Task) {
  await fs.mkdir(path.join(task.assetDir, 'input'), { recursive: true });
  await fs.mkdir(path.join(task.assetDir, 'runs'), { recursive: true });
}

async function removeTaskAssets(task: Task) {
  await fs.rm(task.assetDir, { recursive: true, force: true });
}

async function ensureRunFolders(run: TaskRun) {
  await fs.mkdir(path.join(run.assetDir, 'input'), { recursive: true });
  await fs.mkdir(path.join(run.assetDir, 'images'), { recursive: true });
  await fs.mkdir(path.join(run.assetDir, 'output'), { recursive: true });
  await fs.mkdir(path.join(run.assetDir, 'logs'), { recursive: true });
}

async function removeRunAssets(run: TaskRun) {
  await fs.rm(run.assetDir, { recursive: true, force: true });
}

async function createRunForTask(
  task: Task,
  settings: AppSettings,
  options: {
    feishuInputRecordId?: string;
    feishuInputItem?: TaskRun['feishuInputItem'];
    feishuReviewBatchId?: string;
    feishuListingAutoRun?: boolean;
    localRowLimit?: number;
    localStatusFilter?: TaskRun['localStatusFilter'];
    feishuClaimStatus?: TaskRun['feishuClaimStatus'];
    nameSuffix?: string;
  } = {},
) {
  const runId = timestampId('run');
  const createdAt = new Date().toISOString();
  const runAssetDir = path.join(task.assetDir, 'runs', runId);
  const suffix = options.nameSuffix ? `-${options.nameSuffix}` : '';
  const sourcingMode = normalizeSourcingMode(task.sourcingMode ?? settings.sourcingMode);
  const run: TaskRun = {
    id: runId,
    taskId: task.id,
    name: `${task.name}${suffix}-${new Date(createdAt).toLocaleString('zh-CN', { hour12: false })}`,
    status: 'pending',
    inputSource: task.inputSource ?? 'excel',
    inputExcelPath: (task.inputSource ?? 'excel') === 'feishuBitable' ? path.join(runAssetDir, 'input', 'source.xlsx') : task.inputExcelPath,
    outputExcelPath: path.join(runAssetDir, 'output', 'result.xlsx'),
    inputBitable: task.inputBitable,
    outputBitable: task.outputBitable,
    assetDir: runAssetDir,
    candidateLimit: Math.max(1, Number(task.candidateLimit) || settings.candidateLimit),
    acceptedCandidateLimit: normalizeAcceptedCandidateLimit(task.acceptedCandidateLimit ?? settings.acceptedCandidateLimit, sourcingMode),
    sourcingMode,
    parseDetail: task.parseDetail,
    searchAdapterMode: settings.searchAdapterMode,
    totalCount: 0,
    successCount: 0,
    failedCount: 0,
    createdAt,
    feishuInputRecordId: options.feishuInputRecordId,
    feishuInputItem: options.feishuInputItem,
    feishuReviewBatchId: options.feishuReviewBatchId,
    feishuListingAutoRun: options.feishuListingAutoRun,
    localRowLimit: options.localRowLimit,
    localStatusFilter: options.localStatusFilter,
    feishuClaimStatus: options.feishuClaimStatus,
  };

  await ensureRunFolders(run);
  if ((task.inputSource ?? 'excel') === 'excel') {
    await fs.copyFile(task.inputExcelPath, path.join(run.assetDir, 'input', 'source.xlsx'));
  }
  store.set('runs', [run, ...(store.get('runs') ?? [])]);
  taskStore.updateTask(task.id, {
    status: 'pending',
    currentRunId: run.id,
    latestRunId: run.id,
    totalCount: 0,
    successCount: 0,
    failedCount: 0,
  });
  appendLog(run.id, 'info', '执行日志已创建，开始执行。');
  return run;
}

async function ensureTaskFeishuTables(task: Task, settings: AppSettings) {
  if ((task.inputSource ?? 'excel') !== 'feishuBitable') {
    return task;
  }

  assertFeishuCredentials(settings.feishuAppId, settings.feishuAppSecret);
  assertFeishuBitableConfig('输入', task.inputBitable);
  assertFeishuBitableConfig('输出', task.outputBitable);
  const feishuClient = new FeishuBitableClient({
    appId: settings.feishuAppId,
    appSecret: settings.feishuAppSecret,
  });
  if (isPriceComparisonThreeTableTask(task, settings)) {
    const ensuredTables = await feishuClient.ensurePriceComparisonTables(getPriceComparisonTableInput(settings));
    return taskStore.updateTask(task.id, {
      inputBitable: ensuredTables.inputBitable,
      outputBitable: ensuredTables.outputBitable,
    });
  }

  const ensuredTables = await feishuClient.ensureTaskTables({
    inputBitable: task.inputBitable,
    outputBitable: task.outputBitable,
  });

  return taskStore.updateTask(task.id, {
    inputBitable: ensuredTables.inputBitable,
    outputBitable: ensuredTables.outputBitable,
  });
}

function isPriceComparisonThreeTableTask(task: Task, settings: AppSettings) {
  const inputBitable = normalizeBitableConfig(task.inputBitable);
  const outputBitable = normalizeBitableConfig(task.outputBitable);
  const priceInputBitable = normalizeBitableConfig(settings.priceInputBitable);
  const priceOutputBitable = normalizeBitableConfig(settings.priceOutputBitable);

  return Boolean(
    priceInputBitable.tableId &&
      priceOutputBitable.tableId &&
      inputBitable.tableId === priceInputBitable.tableId &&
      outputBitable.tableId === priceOutputBitable.tableId,
  );
}

async function prepareTaskForRun(task: Task, settings: AppSettings) {
  return (task.inputSource ?? 'excel') === 'feishuBitable' ? await ensureTaskFeishuTables(task, settings) : task;
}

function sortTasks(tasks: Task[]) {
  return [...tasks].map(normalizeTask).sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

function sortRuns(runs: TaskRun[]) {
  return [...runs].map(normalizeRun).sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

function sortLogEntries(logs: TaskLogEntry[]) {
  return [...logs].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

function normalizeTask(task: Task): Task {
  return {
    ...task,
    inputSource: task.inputSource ?? 'excel',
    realtimeEnabled: realtimeTaskControllers.has(task.id),
    sourcingMode: normalizeSourcingMode(task.sourcingMode ?? store.get('settings')?.sourcingMode),
    acceptedCandidateLimit:
      normalizeAcceptedCandidateLimit(
        task.acceptedCandidateLimit ?? store.get('settings')?.acceptedCandidateLimit,
        normalizeSourcingMode(task.sourcingMode ?? store.get('settings')?.sourcingMode),
      ),
  };
}

function normalizeRun(run: TaskRun): TaskRun {
  return {
    ...run,
    inputSource: run.inputSource ?? 'excel',
    sourcingMode: normalizeSourcingMode(run.sourcingMode ?? store.get('settings')?.sourcingMode),
    acceptedCandidateLimit:
      normalizeAcceptedCandidateLimit(
        run.acceptedCandidateLimit ?? store.get('settings')?.acceptedCandidateLimit,
        normalizeSourcingMode(run.sourcingMode ?? store.get('settings')?.sourcingMode),
      ),
  };
}

function getActiveRun(excludedRunId?: string) {
  return taskStore
    .getRuns()
    .find((run) => {
      if (run.id === excludedRunId || (run.status !== 'pending' && run.status !== 'running')) {
        return false;
      }

      const task = taskStore.getTask(run.taskId);
      return task?.currentRunId === run.id;
    });
}

function getRealtimeIntervalMs(settings: AppSettings) {
  return Math.max(5, Number(settings.realtimePollIntervalSeconds) || defaultSettings.realtimePollIntervalSeconds) * 1000;
}

function stopRealtimeLoop(taskId: string) {
  const controller = realtimeTaskControllers.get(taskId);
  if (!controller) {
    return;
  }

  controller.stopped = true;
  if (controller.timer) {
    clearTimeout(controller.timer);
  }
  realtimeTaskControllers.delete(taskId);
  const task = taskStore.getTask(taskId);
  if (task) {
    taskStore.updateTask(taskId, { realtimeEnabled: false });
  }
}

async function runRealtimeTick(taskId: string) {
  const realtimeController = realtimeTaskControllers.get(taskId);
  if (!realtimeController || realtimeController.stopped || realtimeController.running) {
    return;
  }

  realtimeController.running = true;
  try {
    const settings = await getNormalizedSettings();
    const loadedTask = taskStore.getTask(taskId);
    if (!loadedTask) {
      stopRealtimeLoop(taskId);
      return;
    }
    const task = await prepareTaskForRun(loadedTask, settings);

    if (task.currentRunId) {
      const currentRun = taskStore.getRun(task.currentRunId);
      if (currentRun && (currentRun.status === 'pending' || currentRun.status === 'running')) {
        return;
      }
    }

    const activeRun = getActiveRun();
    if (activeRun) {
      return;
    }

    await ensureLoginBrowserReadyForTask(settings, task);

    let run: TaskRun | null = null;
    if ((task.inputSource ?? 'excel') === 'feishuBitable') {
      assertFeishuCredentials(settings.feishuAppId, settings.feishuAppSecret);
      assertFeishuBitableConfig('输入', task.inputBitable);
      assertFeishuBitableConfig('输出', task.outputBitable);
      const feishuClient = new FeishuBitableClient({
        appId: settings.feishuAppId,
        appSecret: settings.feishuAppSecret,
      });
      const claimedRecord = await feishuClient.claimNextPendingSelectionRecord(
        task.inputBitable,
        'pendingOnly',
        getPriceComparisonDuplicateScope(settings, task),
      );
      if (!claimedRecord) {
        return;
      }

      run = await createRunForTask(task, settings, {
        feishuInputRecordId: claimedRecord.recordId,
        feishuInputItem: claimedRecord.item,
        nameSuffix: '实时',
      });
      appendLog(run.id, 'info', `持续执行已领取一行：${claimedRecord.sourceUrl}`);
    } else {
      const hasPendingRows = await hasPendingLocalExcelRows(task.inputExcelPath);
      if (!hasPendingRows) {
        return;
      }

      run = await createRunForTask(task, settings, {
        localRowLimit: 1,
        localStatusFilter: 'pendingOnly',
        nameSuffix: '持续',
      });
      appendLog(run.id, 'info', '本地持续执行已扫描到 1 行待处理记录。');
    }

    const controller = new AbortController();
    runningRunControllers.set(run.id, controller);
    await startTaskRun(run.id, taskStore, controller.signal);
    runningRunControllers.delete(run.id);
  } catch (error) {
    const task = taskStore.getTask(taskId);
    if (task) {
      taskStore.updateTask(taskId, {
        status: 'failed',
        realtimeEnabled: true,
        finishedAt: new Date().toISOString(),
      });
    }
    console.error('Realtime task tick failed:', error);
  } finally {
    realtimeController.running = false;
    if (!realtimeController.stopped && realtimeTaskControllers.has(taskId)) {
      const settings = await getNormalizedSettings();
      realtimeController.timer = setTimeout(() => {
        void runRealtimeTick(taskId);
      }, getRealtimeIntervalMs(settings));
    }
  }
}

function appendLog(runId: string, level: TaskLogEntry['level'], message: string) {
  const run = taskStore.getRun(runId);
  if (!run) {
    throw new Error('执行日志不存在');
  }

  const logs = store.get('logs') ?? {};
  const entry: TaskLogEntry = {
    id: timestampId('log'),
    taskId: run.taskId,
    runId,
    createdAt: new Date().toISOString(),
    level,
    message,
  };

  logs[runId] = [...(logs[runId] ?? []), entry];
  store.set('logs', logs);
  return entry;
}

const taskStore: TaskStore = {
  getSettings: () => store.get('settings'),
  getTasks: () => store.get('tasks') ?? [],
  setTasks: (tasks) => store.set('tasks', tasks),
  getTask: (taskId) => {
    const task = (store.get('tasks') ?? []).find((item) => item.id === taskId);
    return task ? normalizeTask(task) : undefined;
  },
  updateTask: (taskId, patch) => {
    const tasks = store.get('tasks') ?? [];
    const nextTasks = tasks.map((task) => (task.id === taskId ? { ...task, ...patch } : task));
    const updatedTask = nextTasks.find((task) => task.id === taskId);
    if (!updatedTask) {
      throw new Error('任务不存在');
    }

    store.set('tasks', nextTasks);
    return updatedTask;
  },
  getRuns: () => (store.get('runs') ?? []).map(normalizeRun),
  setRuns: (runs) => store.set('runs', runs),
  getRun: (runId) => {
    const run = (store.get('runs') ?? []).find((item) => item.id === runId);
    return run ? normalizeRun(run) : undefined;
  },
  getTaskRuns: (taskId) => sortRuns((store.get('runs') ?? []).filter((run) => run.taskId === taskId)),
  updateRun: (runId, patch) => {
    const runs = store.get('runs') ?? [];
    const nextRuns = runs.map((run) => (run.id === runId ? { ...run, ...patch } : run));
    const updatedRun = nextRuns.find((run) => run.id === runId);
    if (!updatedRun) {
      throw new Error('执行日志不存在');
    }

    store.set('runs', nextRuns);
    return updatedRun;
  },
  appendLog,
};

export function registerIpcHandlers() {
  ipcMain.handle('auth:getStatus', () => authService.getStatus());
  ipcMain.handle('auth:login', async (_event, input) => authService.login(input));
  ipcMain.handle('auth:verify', async () => authService.verify());
  ipcMain.handle('auth:heartbeat', async () => authService.heartbeat());
  ipcMain.handle('auth:logout', async () => authService.logout());

  ipcMain.handle('settings:get', () => getNormalizedSettings());

  ipcMain.handle('window:openUserGuide', async () => {
    await openUserGuideWindow();
  });

  ipcMain.handle('settings:save', async (_event, settings: AppSettings) => {
    const currentSettings = await getNormalizedSettings();
    const sourcingMode = normalizeSourcingMode(settings.sourcingMode);
    const normalizedSettings: AppSettings = {
      ...currentSettings,
      ...settings,
      authServerBaseUrl: settings.authServerBaseUrl.trim() || defaultSettings.authServerBaseUrl,
      authAppKey: settings.authAppKey.trim() || defaultSettings.authAppKey,
      candidateLimit: Math.max(1, Number(settings.candidateLimit) || defaultSettings.candidateLimit),
      sourcingMode,
      acceptedCandidateLimit: normalizeAcceptedCandidateLimit(settings.acceptedCandidateLimit, sourcingMode),
      searchAdapterMode: settings.searchAdapterMode ?? defaultSettings.searchAdapterMode,
      taskBrowserMode: settings.taskBrowserMode ?? defaultSettings.taskBrowserMode,
      chromeMode: settings.chromeMode ?? currentSettings.chromeMode ?? defaultSettings.chromeMode,
      chromeCdpUrl: settings.chromeCdpUrl || currentSettings.chromeCdpUrl || defaultSettings.chromeCdpUrl,
      chromeExecutablePath: settings.chromeExecutablePath.trim(),
      chromeUserDataDir: getHiddenChromeUserDataDir(),
      feishuAppId: settings.feishuAppId.trim(),
      feishuAppSecret: settings.feishuAppSecret.trim(),
      targetShopName: settings.targetShopName.trim(),
      targetShopId: settings.targetShopId.trim(),
      targetSite: settings.targetSite.trim() || defaultSettings.targetSite,
      miaoshouPricingTemplatesJson: settings.miaoshouPricingTemplatesJson || defaultSettings.miaoshouPricingTemplatesJson,
      miaoshouPricingTemplateMappings: settings.miaoshouPricingTemplateMappings?.trim() ?? '',
      miaoshouTargetCategoryId: settings.miaoshouTargetCategoryId.trim(),
      miaoshouPricingTemplateName: settings.miaoshouPricingTemplateName.trim(),
      miaoshouSizeChartImageUrl: String(settings.miaoshouSizeChartImageUrl ?? '').trim(),
      miaoshouWarehouseName: settings.miaoshouWarehouseName.trim(),
      miaoshouLogisticsTemplateName: settings.miaoshouLogisticsTemplateName.trim(),
      miaoshouOpenApiBaseUrl: settings.miaoshouOpenApiBaseUrl.trim() || defaultSettings.miaoshouOpenApiBaseUrl,
      miaoshouOpenApiAppKey: settings.miaoshouOpenApiAppKey.trim(),
      miaoshouOpenApiAppSecret: settings.miaoshouOpenApiAppSecret.trim(),
      miaoshouOpenApiAccountId: settings.miaoshouOpenApiAccountId.trim(),
      enableMiaoshouListingApi: normalizeEnableMiaoshouListingApi(settings.enableMiaoshouListingApi),
      miaoshouDefaultStock: Math.max(1, Number(settings.miaoshouDefaultStock) || defaultSettings.miaoshouDefaultStock),
      listingCollectSource: normalizeListingCollectSource(settings.listingCollectSource),
      listingShopMappings: normalizeListingShopMappings(settings.listingShopMappings),
      listingExchangeRates: settings.listingExchangeRates.trim() || defaultSettings.listingExchangeRates,
      listingTargetProfitRate: normalizeRate(settings.listingTargetProfitRate, defaultSettings.listingTargetProfitRate, 0.95),
      listingDiscountRate: normalizeRate(settings.listingDiscountRate, defaultSettings.listingDiscountRate, 0.95),
      listingTkFeeRate: normalizeRate(settings.listingTkFeeRate, defaultSettings.listingTkFeeRate, 0.95),
      listingShippingFormulas: normalizeListingShippingFormulas(settings.listingShippingFormulas),
      freightForwarderAddress: settings.freightForwarderAddress.trim(),
      realtimePollIntervalSeconds: Math.max(
        5,
        Number(settings.realtimePollIntervalSeconds) || defaultSettings.realtimePollIntervalSeconds,
      ),
      lastFeishuInputBitable: normalizeBitableConfig(settings.lastFeishuInputBitable),
      lastFeishuOutputBitable: normalizeBitableConfig(settings.lastFeishuOutputBitable),
      priceInputBitable: normalizeBitableConfig(settings.priceInputBitable),
      priceOutputBitable: normalizeBitableConfig(settings.priceOutputBitable),
      priceReviewBitable: normalizeBitableConfig(settings.priceReviewBitable),
      listingResultBitable: normalizeBitableConfig(settings.listingResultBitable),
      weightGroupToleranceGram: Math.max(0, Number(settings.weightGroupToleranceGram) || defaultSettings.weightGroupToleranceGram),
      autoGenerateListingReviewTable: normalizeAutoGenerateListingReviewTable(settings.autoGenerateListingReviewTable),
      ...normalize1688EnhancedFilterSettings(settings),
      aiBaseUrl: settings.aiBaseUrl.trim(),
      aiApiKey: settings.aiApiKey.trim(),
      aiModel: settings.aiModel.trim() || defaultSettings.aiModel,
      aiSimilarityThreshold: Math.min(
        1,
        Math.max(0, Number(settings.aiSimilarityThreshold) || defaultSettings.aiSimilarityThreshold),
      ),
      pageTimeoutMs: Math.max(5000, Number(settings.pageTimeoutMs) || defaultSettings.pageTimeoutMs),
      retryCount: Math.max(0, Number(settings.retryCount) || 0),
      excelRowConcurrency: Math.max(1, Number(settings.excelRowConcurrency) || defaultSettings.excelRowConcurrency),
      detailPageConcurrency: Math.max(1, Number(settings.detailPageConcurrency) || defaultSettings.detailPageConcurrency),
      aiRequestConcurrency: Math.max(1, Number(settings.aiRequestConcurrency) || defaultSettings.aiRequestConcurrency),
      aiListBatchSize: Math.max(1, Number(settings.aiListBatchSize) || defaultSettings.aiListBatchSize),
    };

    store.set('settings', normalizedSettings);
    return normalizedSettings;
  });

  ipcMain.handle('tasks:list', () => sortTasks(store.get('tasks') ?? []));

  ipcMain.handle('priceComparison:ensureTables', async () => {
    await authService.assertFeature('aiPrice');
    const settings = await getNormalizedSettings();
    assertFeishuCredentials(settings.feishuAppId, settings.feishuAppSecret);
    const feishuClient = new FeishuBitableClient({
      appId: settings.feishuAppId,
      appSecret: settings.feishuAppSecret,
    });
    const result = await feishuClient.ensurePriceComparisonTables(getPriceComparisonTableInput(settings));
    store.set('settings', {
      ...settings,
      priceInputBitable: result.inputBitable,
      priceOutputBitable: result.outputBitable,
      priceReviewBitable: result.reviewBitable,
      lastFeishuInputBitable: result.inputBitable,
      lastFeishuOutputBitable: result.outputBitable,
    });
    return result;
  });

  ipcMain.handle('priceComparison:exportLocalTemplate', async () => {
    await authService.assertFeature('aiPrice');
    const settings = await getNormalizedSettings();
    const outputDir = settings.defaultOutputDir || path.join(os.homedir(), 'Documents', 'TikTok AI Flow', 'outputs');
    const outputExcelPath = path.join(outputDir, `ai-price-three-table-template-${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`);
    await writeLocalThreeTableTemplate(outputExcelPath);
    return { outputExcelPath };
  });

  ipcMain.handle('priceComparison:generateLocalReviewTable', async (_event, input: { workbookPath: string; weightToleranceGram?: number }) => {
    await authService.assertFeature('aiPrice');
    const settings = await getNormalizedSettings();
    const workbookPath = input.workbookPath?.trim();
    if (!workbookPath) {
      throw new Error('请选择本地三表 Excel 文件');
    }

    return generateLocalPriceComparisonReviewTable({
      workbookPath,
      weightToleranceGram: input.weightToleranceGram ?? settings.weightGroupToleranceGram,
    });
  });

  ipcMain.handle('priceComparison:generateReviewTable', async (_event, input: PriceComparisonReviewGenerationInput = {}) => {
    await authService.assertFeature('aiPrice');
    const settings = await getNormalizedSettings();
    assertFeishuCredentials(settings.feishuAppId, settings.feishuAppSecret);
    const feishuClient = new FeishuBitableClient({
      appId: settings.feishuAppId,
      appSecret: settings.feishuAppSecret,
    });
    const tableInput = getPriceComparisonTableInput(settings);
    const result = await feishuClient.generatePriceComparisonReviewTable({
      ...tableInput,
      weightToleranceGram: input.weightToleranceGram ?? settings.weightGroupToleranceGram,
    });
    await syncListingPricingForConfiguredSites(feishuClient, settings, tableInput);
    return result;
  });

  ipcMain.handle('priceComparison:confirmLatestBatchAndGenerateReviewTable', async () => {
    await authService.assertFeature('aiPrice');
    const settings = await getNormalizedSettings();
    assertFeishuCredentials(settings.feishuAppId, settings.feishuAppSecret);
    const feishuClient = new FeishuBitableClient({
      appId: settings.feishuAppId,
      appSecret: settings.feishuAppSecret,
    });
    const tableInput = getPriceComparisonTableInput(settings);
    const result = await feishuClient.confirmLatestPriceBatchAndGenerateReviewTable({
      ...tableInput,
      weightToleranceGram: settings.weightGroupToleranceGram,
    });
    const pricingSyncedCount = await syncListingPricingForConfiguredSites(feishuClient, settings, tableInput);
    return {
      ...result,
      pricingSyncedCount,
    };
  });

  ipcMain.handle('commerce:ensureMiaoshouListingResultTable', async () => {
    await authService.assertFeature('aiListing');
    const settings = await getNormalizedSettings();
    assertFeishuCredentials(settings.feishuAppId, settings.feishuAppSecret);
    const feishuClient = new FeishuBitableClient({
      appId: settings.feishuAppId,
      appSecret: settings.feishuAppSecret,
    });
    const input = getListingResultTableInput(settings);
    const result = await feishuClient.ensureListingResultTable(input);
    store.set('settings', {
      ...settings,
      listingResultBitable: result.listingResultBitable,
    });
    return result;
  });

  ipcMain.handle('tasks:start', async (_event, taskId: string) => {
    await authService.assertFeature('aiPrice');
    const settings = await getNormalizedSettings();
    const loadedTask = taskStore.getTask(taskId);
    if (!loadedTask) {
      throw new Error('任务不存在');
    }
    const task = await prepareTaskForRun(loadedTask, settings);

    if (task.currentRunId) {
      const currentRun = taskStore.getRun(task.currentRunId);
      if (currentRun && (currentRun.status === 'pending' || currentRun.status === 'running')) {
        return currentRun;
      }
    }

    const activeRun = getActiveRun();
    if (activeRun) {
      throw new Error('已有任务正在执行，请等待当前任务完成或先中断当前任务。');
    }

    await ensureLoginBrowserReadyForTask(settings, task);

    let run: TaskRun;
    if ((task.inputSource ?? 'excel') === 'feishuBitable') {
      assertFeishuCredentials(settings.feishuAppId, settings.feishuAppSecret);
      assertFeishuBitableConfig('输入', task.inputBitable);
      assertFeishuBitableConfig('输出', task.outputBitable);
      const feishuClient = new FeishuBitableClient({
        appId: settings.feishuAppId,
        appSecret: settings.feishuAppSecret,
      });
      const claimedRecord = await feishuClient.claimNextPendingSelectionRecord(
        task.inputBitable,
        'pendingOnly',
        getPriceComparisonDuplicateScope(settings, task),
      );
      if (!claimedRecord) {
        taskStore.updateTask(task.id, {
          status: 'success',
          currentRunId: undefined,
          finishedAt: new Date().toISOString(),
        });
        throw new Error('没有空状态/「待处理」/「待核实」记录，本次未执行；已完成记录会自动跳过。');
      }

      run = await createRunForTask(task, settings, {
        feishuInputRecordId: claimedRecord.recordId,
        feishuInputItem: claimedRecord.item,
        nameSuffix: '手动',
      });
      appendLog(run.id, 'info', `手动执行已领取一行：${claimedRecord.sourceUrl}`);
    } else {
      run = await createRunForTask(task, settings);
    }
    const controller = new AbortController();
    runningRunControllers.set(run.id, controller);
    void startTaskRun(run.id, taskStore, controller.signal).finally(() => {
      runningRunControllers.delete(run.id);
    });

    return taskStore.getRun(run.id) ?? run;
  });

  ipcMain.handle('tasks:retryFailed', async (_event, taskId: string) => {
    await authService.assertFeature('aiPrice');
    const settings = await getNormalizedSettings();
    const loadedTask = taskStore.getTask(taskId);
    if (!loadedTask) {
      throw new Error('任务不存在');
    }
    const task = await prepareTaskForRun(loadedTask, settings);

    if (task.currentRunId) {
      const currentRun = taskStore.getRun(task.currentRunId);
      if (currentRun && (currentRun.status === 'pending' || currentRun.status === 'running')) {
        return currentRun;
      }
    }

    const activeRun = getActiveRun();
    if (activeRun) {
      throw new Error('已有任务正在执行，请等待当前任务完成或先中断当前任务。');
    }

    await ensureLoginBrowserReadyForTask(settings, task);

    let run: TaskRun;
    if ((task.inputSource ?? 'excel') === 'feishuBitable') {
      assertFeishuCredentials(settings.feishuAppId, settings.feishuAppSecret);
      assertFeishuBitableConfig('输入', task.inputBitable);
      assertFeishuBitableConfig('输出', task.outputBitable);
      const feishuClient = new FeishuBitableClient({
        appId: settings.feishuAppId,
        appSecret: settings.feishuAppSecret,
      });
      const claimedRecord = await feishuClient.claimNextPendingSelectionRecord(
        task.inputBitable,
        'failedOnly',
        getPriceComparisonDuplicateScope(settings, task),
      );
      if (!claimedRecord) {
        taskStore.updateTask(task.id, {
          currentRunId: undefined,
          finishedAt: new Date().toISOString(),
        });
        throw new Error('没有「失败」记录可重跑。');
      }

      run = await createRunForTask(task, settings, {
        feishuInputRecordId: claimedRecord.recordId,
        feishuInputItem: claimedRecord.item,
        feishuClaimStatus: 'failedOnly',
        nameSuffix: '重跑失败',
      });
      appendLog(run.id, 'info', `重跑失败已领取一行：${claimedRecord.sourceUrl}`);
    } else {
      run = await createRunForTask(task, settings, {
        localStatusFilter: 'failedOnly',
        nameSuffix: '重跑失败',
      });
    }

    const controller = new AbortController();
    runningRunControllers.set(run.id, controller);
    void startTaskRun(run.id, taskStore, controller.signal).finally(() => {
      runningRunControllers.delete(run.id);
    });

    return taskStore.getRun(run.id) ?? run;
  });

  ipcMain.handle('tasks:startRealtime', async (_event, taskId: string) => {
    await authService.assertFeature('aiPrice');
    const settings = await getNormalizedSettings();
    const loadedTask = taskStore.getTask(taskId);
    if (!loadedTask) {
      throw new Error('任务不存在');
    }
    const task = await prepareTaskForRun(loadedTask, settings);

    if ((task.inputSource ?? 'excel') === 'feishuBitable') {
      assertFeishuCredentials(settings.feishuAppId, settings.feishuAppSecret);
      assertFeishuBitableConfig('输入', task.inputBitable);
      assertFeishuBitableConfig('输出', task.outputBitable);
    }

    if (!realtimeTaskControllers.has(taskId)) {
      realtimeTaskControllers.set(taskId, { running: false, stopped: false });
      taskStore.updateTask(taskId, { realtimeEnabled: true });
      void runRealtimeTick(taskId);
    }

    return taskStore.getTask(taskId) ?? task;
  });

  ipcMain.handle('tasks:stopRealtime', async (_event, taskId: string) => {
    const task = taskStore.getTask(taskId);
    if (!task) {
      throw new Error('任务不存在');
    }

    stopRealtimeLoop(taskId);
    return taskStore.getTask(taskId) ?? task;
  });

  ipcMain.handle('tasks:cancel', async (_event, taskId: string) => {
    const task = taskStore.getTask(taskId);
    if (!task) {
      throw new Error('任务不存在');
    }

    const runId = task.currentRunId;
    const runningRun = runId ? taskStore.getRun(runId) : undefined;
    const controller = runId ? runningRunControllers.get(runId) : undefined;
    if (!controller && task.status !== 'running') {
      if (runningRun && runningRun.status === 'pending') {
        const nextRun = taskStore.updateRun(runningRun.id, {
          status: 'cancelled',
          finishedAt: new Date().toISOString(),
        });
        taskStore.updateTask(taskId, {
          status: 'cancelled',
          currentRunId: undefined,
          latestRunId: runningRun.id,
          finishedAt: nextRun.finishedAt,
        });
        appendLog(runningRun.id, 'warn', '任务已中断。');
        return nextRun;
      }

      return task;
    }

    controller?.abort();
    if (runningRun) {
      appendLog(runningRun.id, 'warn', '已收到中断请求，正在停止当前执行步骤。');
      const nextRun = taskStore.updateRun(runningRun.id, {
        status: 'cancelled',
        finishedAt: new Date().toISOString(),
      });
      taskStore.updateTask(taskId, {
        status: 'cancelled',
        currentRunId: undefined,
        latestRunId: runningRun.id,
        finishedAt: nextRun.finishedAt,
      });
      return nextRun;
    }

    return taskStore.updateTask(taskId, {
      status: 'cancelled',
      finishedAt: new Date().toISOString(),
    });
  });

  ipcMain.handle('browser:openLoginBrowser', async () => {
    const settings = await getNormalizedSettings();
    await assertChromeCdpPortAvailableOrAppOwned({
      chromeCdpUrl: settings.chromeCdpUrl || defaultSettings.chromeCdpUrl,
      chromeUserDataDir: settings.chromeUserDataDir,
    });
    await openAppChromeLoginPage({
      chromeExecutablePath: settings.chromeExecutablePath,
      chromeUserDataDir: settings.chromeUserDataDir,
      imageSearchUrl: settings.imageSearchUrl || defaultSettings.imageSearchUrl,
      extraLoginUrls: [
        'https://zhenghedata.com/',
        'https://erp.91miaoshou.com/',
      ],
      pageTimeoutMs: settings.pageTimeoutMs,
      headless: false,
    });
    return settings;
  });

  ipcMain.handle('tasks:delete', async (_event, taskId: string) => {
    const tasks = store.get('tasks') ?? [];
    const targetTask = tasks.find((task) => task.id === taskId);
    if (!targetTask) {
      return tasks;
    }

    stopRealtimeLoop(taskId);
    for (const run of taskStore.getTaskRuns(taskId)) {
      runningRunControllers.get(run.id)?.abort();
      runningRunControllers.delete(run.id);
    }
    await removeTaskAssets(targetTask);

    const nextTasks = tasks.filter((task) => task.id !== taskId);
    const nextRuns = (store.get('runs') ?? []).filter((run) => run.taskId !== taskId);
    const logs = store.get('logs') ?? {};
    for (const run of taskStore.getTaskRuns(taskId)) {
      delete logs[run.id];
    }
    store.set('tasks', nextTasks);
    store.set('runs', nextRuns);
    store.set('logs', logs);
    return sortTasks(nextTasks);
  });

  ipcMain.handle('tasks:clear', async () => {
    const tasks = store.get('tasks') ?? [];
    for (const taskId of realtimeTaskControllers.keys()) {
      stopRealtimeLoop(taskId);
    }
    for (const runId of runningRunControllers.keys()) {
      runningRunControllers.get(runId)?.abort();
    }
    runningRunControllers.clear();
    await Promise.all(tasks.map((task) => removeTaskAssets(task)));
    store.set('tasks', []);
    store.set('runs', []);
    store.set('logs', {});
    return [];
  });

  ipcMain.handle('tasks:create', async (_event, input: CreateTaskInput) => {
    await authService.assertFeature('aiPrice');
    const settings = store.get('settings');
    const id = timestampId('task');
    const createdAt = new Date().toISOString();
    const inputSource = input.inputSource ?? 'excel';
    const feishuAppId = input.feishuAppId?.trim() || settings.feishuAppId;
    const feishuAppSecret = input.feishuAppSecret?.trim() || settings.feishuAppSecret;
    let inputBitable = normalizeBitableConfig(input.inputBitable);
    let outputBitable = normalizeBitableConfig(input.outputBitable);
    let reviewBitable = normalizeBitableConfig(input.reviewBitable);
    const sharedAppToken = inputBitable.appToken || outputBitable.appToken || reviewBitable.appToken;
    inputBitable = {
      ...inputBitable,
      appToken: inputBitable.appToken || sharedAppToken,
    };
    outputBitable = {
      ...outputBitable,
      appToken: outputBitable.appToken || sharedAppToken,
    };
    reviewBitable = {
      ...reviewBitable,
      appToken: reviewBitable.appToken || sharedAppToken,
    };
    if (inputSource === 'excel' && !input.inputExcelPath?.trim()) {
      throw new Error('请选择输入 Excel 文件');
    }
    if (inputSource === 'feishuBitable') {
      assertFeishuCredentials(feishuAppId, feishuAppSecret);
      if (!inputBitable.appToken || !outputBitable.appToken) {
        throw new Error('输入表和输出货源表 app_token 必填；可直接粘贴飞书多维表格链接自动提取');
      }

      const feishuClient = new FeishuBitableClient({
        appId: feishuAppId,
        appSecret: feishuAppSecret,
      });
      const candidateTask = {
        inputSource: 'feishuBitable',
        inputBitable,
        outputBitable,
      } as Task;
      const shouldEnsurePriceTables = Boolean(
        reviewBitable.appToken ||
          reviewBitable.tableId ||
          settings.priceReviewBitable.appToken ||
          settings.priceReviewBitable.tableId ||
          isPriceComparisonThreeTableTask(candidateTask, settings),
      );
      if (shouldEnsurePriceTables) {
        const ensuredTables = await feishuClient.ensurePriceComparisonTables(getPriceComparisonTableInput({
            ...settings,
            priceInputBitable: inputBitable,
            priceOutputBitable: outputBitable,
            priceReviewBitable: reviewBitable,
          }));
        inputBitable = ensuredTables.inputBitable;
        outputBitable = ensuredTables.outputBitable;
        reviewBitable = ensuredTables.reviewBitable;
      } else {
        const ensuredTables = await feishuClient.ensureTaskTables({
          inputBitable,
          outputBitable,
        });
        inputBitable = ensuredTables.inputBitable;
        outputBitable = ensuredTables.outputBitable;
      }
      assertFeishuBitableConfig('输入', inputBitable);
      assertFeishuBitableConfig('输出', outputBitable);
      store.set('settings', {
        ...settings,
        feishuAppId,
        feishuAppSecret,
        lastFeishuInputBitable: inputBitable,
        lastFeishuOutputBitable: outputBitable,
        priceInputBitable: inputBitable,
        priceOutputBitable: outputBitable,
        priceReviewBitable: reviewBitable,
      });
    }
    const inputExcelPath = inputSource === 'excel' ? input.inputExcelPath?.trim() ?? '' : formatBitableLocation(inputBitable);
    const inputName =
      inputSource === 'excel'
        ? path.basename(inputExcelPath, path.extname(inputExcelPath))
        : `feishu-${inputBitable.tableId}`;
    const taskName = sanitizeFilePart(inputName || 'sourcing-task');
    const assetRoot = input.outputDir || settings.defaultAssetDir;
    const assetDir = path.join(assetRoot, `${taskName}-${id}`);
    const sourcingMode = normalizeSourcingMode(input.sourcingMode ?? settings.sourcingMode);

    const task: Task = {
      id,
      name: taskName,
      status: 'pending',
      inputSource,
      inputExcelPath,
      inputBitable: inputSource === 'feishuBitable' ? inputBitable : undefined,
      outputBitable: inputSource === 'feishuBitable' ? outputBitable : undefined,
      assetDir,
      candidateLimit: input.candidateLimit ?? settings.candidateLimit,
      acceptedCandidateLimit: normalizeAcceptedCandidateLimit(
        input.acceptedCandidateLimit ?? settings.acceptedCandidateLimit,
        sourcingMode,
      ),
      sourcingMode,
      parseDetail: input.parseDetail ?? settings.parseDetailByDefault,
      searchAdapterMode: settings.searchAdapterMode,
      totalCount: 0,
      successCount: 0,
      failedCount: 0,
      createdAt,
    };

    await ensureTaskFolders(task);
    if (inputSource === 'excel') {
      await fs.copyFile(inputExcelPath, path.join(task.assetDir, 'input', 'source.xlsx'));
    }

    const tasks = store.get('tasks') ?? [];
    store.set('tasks', [task, ...tasks]);

    return task;
  });

  ipcMain.handle('tasks:logs', (_event, taskId: string) => {
    const logs = store.get('logs') ?? {};
    const runs = taskStore.getTaskRuns(taskId);
    const run = runs.find((item) => item.status === 'running') ?? runs[0];
    return run ? sortLogEntries(logs[run.id] ?? []) : [];
  });

  ipcMain.handle('tasks:runs', (_event, taskId: string) => taskStore.getTaskRuns(taskId));

  ipcMain.handle('runs:logs', (_event, runId: string) => {
    const logs = store.get('logs') ?? {};
    return sortLogEntries(logs[runId] ?? []);
  });

  ipcMain.handle('runs:delete', async (_event, runId: string) => {
    const run = taskStore.getRun(runId);
    if (!run) {
      return [];
    }

    runningRunControllers.get(runId)?.abort();
    runningRunControllers.delete(runId);
    await removeRunAssets(run);

    const nextRuns = (store.get('runs') ?? []).filter((item) => item.id !== runId);
    store.set('runs', nextRuns);
    const logs = store.get('logs') ?? {};
    delete logs[runId];
    store.set('logs', logs);

    const taskRuns = sortRuns(nextRuns.filter((item) => item.taskId === run.taskId));
    const latestRun = taskRuns[0];
    taskStore.updateTask(run.taskId, {
      status: latestRun?.status ?? 'pending',
      totalCount: latestRun?.totalCount ?? 0,
      successCount: latestRun?.successCount ?? 0,
      failedCount: latestRun?.failedCount ?? 0,
      currentRunId: latestRun?.status === 'running' ? latestRun.id : undefined,
      latestRunId: latestRun?.id,
      finishedAt: latestRun?.finishedAt,
      startedAt: latestRun?.startedAt,
    });

    return taskRuns;
  });

  ipcMain.handle('commerce:queryMiaoshouShops', async (_event, input: CommerceShopQueryInput) => {
    await authService.assertFeature('aiListing');
    const settings = await getNormalizedSettings();
    assertMiaoshouListingApiEnabled(settings);
    assertMiaoshouCredentials({
      appKey: settings.miaoshouOpenApiAppKey,
      appSecret: settings.miaoshouOpenApiAppSecret,
    });
    const miaoshouClient = new MiaoshouOpenApiClient({
      baseUrl: settings.miaoshouOpenApiBaseUrl,
      appKey: settings.miaoshouOpenApiAppKey,
      appSecret: settings.miaoshouOpenApiAppSecret,
      accountId: settings.miaoshouOpenApiAccountId,
    });
    const querySites = Array.isArray(input.sites) ? normalizeShopConfigSites(input.sites) : [];
    const shops = querySites.length > 0
      ? await miaoshouClient.queryShopsBySites(querySites)
      : await miaoshouClient.queryShops({
        platform: input.platform || 'tiktok',
        site: input.site ?? settings.targetSite,
      });
    return { shops };
  });

  ipcMain.handle('commerce:exportMiaoshouShopConfig', async (_event, input: CommerceShopConfigExportInput = {}) => {
    await authService.assertFeature('aiListing');
    const settings = await getNormalizedSettings();
    assertMiaoshouListingApiEnabled(settings);
    assertMiaoshouCredentials({
      appKey: settings.miaoshouOpenApiAppKey,
      appSecret: settings.miaoshouOpenApiAppSecret,
    });
    const miaoshouClient = new MiaoshouOpenApiClient({
      baseUrl: settings.miaoshouOpenApiBaseUrl,
      appKey: settings.miaoshouOpenApiAppKey,
      appSecret: settings.miaoshouOpenApiAppSecret,
      accountId: settings.miaoshouOpenApiAccountId,
    });
    const sites = normalizeShopConfigSites(input.sites);
    const shops = await miaoshouClient.queryShopsBySites(sites);
    const outputDir = settings.defaultOutputDir || path.join(os.homedir(), 'Documents', 'TikTok AI Flow', 'outputs');
    const outputExcelPath = path.join(outputDir, `miaoshou-shop-config-${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`);
    await writeMiaoshouShopConfigExcel(outputExcelPath, shops);
    return {
      outputExcelPath,
      shopCount: shops.length,
    };
  });

  ipcMain.handle('commerce:refreshMiaoshouPricingTemplates', async (_event, input: { site?: string } = {}) => {
    await authService.assertFeature('aiListing');
    const settings = await getNormalizedSettings();
    assertMiaoshouListingApiEnabled(settings);
    const templates = await refreshMiaoshouPricingTemplatesFromBrowser(settings, {
      site: input.site || settings.targetSite,
    });
    let mappings = settings.miaoshouPricingTemplateMappings || '';
    const selectedSite = (input.site || settings.targetSite || '').trim().toUpperCase();
    const firstForSite = templates.find((template) => template.site === selectedSite) ?? templates[0];
    if (firstForSite) {
      mappings = upsertTemplateMapping(mappings, firstForSite);
    }
    store.set('settings', {
      ...settings,
      miaoshouPricingTemplatesJson: JSON.stringify(templates, null, 2),
      miaoshouPricingTemplateMappings: mappings,
      miaoshouPricingTemplateName: firstForSite?.name ?? settings.miaoshouPricingTemplateName,
    });
    return { templates };
  });

  ipcMain.handle('commerce:syncListingPricingConfigToReviewTable', async (_event, input: CommerceListingPricingSyncInput) => {
    await authService.assertFeature('aiListing');
    const settings = await getNormalizedSettings();
    assertFeishuCredentials(settings.feishuAppId, settings.feishuAppSecret);
    const feishuClient = new FeishuBitableClient({
      appId: settings.feishuAppId,
      appSecret: settings.feishuAppSecret,
    });
    const appToken =
      settings.priceReviewBitable.appToken ||
      settings.priceOutputBitable.appToken ||
      settings.priceInputBitable.appToken ||
      settings.lastFeishuOutputBitable.appToken ||
      settings.lastFeishuInputBitable.appToken;
    return feishuClient.syncListingPricingConfigToReviewTable({
      appToken,
      inputBitable: settings.priceInputBitable,
      outputBitable: settings.priceOutputBitable,
      reviewBitable: settings.priceReviewBitable,
      site: input.site || settings.targetSite,
      exchangeRate: input.exchangeRate,
      targetProfitRate: input.targetProfitRate ?? settings.listingTargetProfitRate,
      discountRate: input.discountRate ?? settings.listingDiscountRate,
      tkFeeRate: input.tkFeeRate ?? settings.listingTkFeeRate,
      shippingFormulas: input.shippingFormulas ?? settings.listingShippingFormulas,
    });
  });

  ipcMain.handle('commerce:checkMiaoshouPublishReadiness', async (_event, input: CommercePublishCheckInput) => {
    await authService.assertFeature('aiListing');
    const settings = await getNormalizedSettings();
    assertMiaoshouListingApiEnabled(settings);
    assertMiaoshouCredentials({
      appKey: settings.miaoshouOpenApiAppKey,
      appSecret: settings.miaoshouOpenApiAppSecret,
    });
    const task = taskStore.getTask(input.taskId);
    if (!task) {
      throw new Error('任务不存在');
    }
    const feishuClient = new FeishuBitableClient({
      appId: settings.feishuAppId,
      appSecret: settings.feishuAppSecret,
    });
    const miaoshouClient = new MiaoshouOpenApiClient({
      baseUrl: settings.miaoshouOpenApiBaseUrl,
      appKey: settings.miaoshouOpenApiAppKey,
      appSecret: settings.miaoshouOpenApiAppSecret,
      accountId: settings.miaoshouOpenApiAccountId,
    });

    return feishuClient.checkMiaoshouPublishReadiness({
      ...getCommerceTableInput(task),
      ...input,
      site: input.site || settings.targetSite,
      shopId: input.shopId || settings.targetShopId,
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
            ...(collectBoxItems.length === 0 ? ['TikTok采集箱待发布商品'] : []),
            ...(warehouseList.length === 0 ? ['店铺仓库'] : []),
          ],
        };
      },
    });
  });

  ipcMain.handle('commerce:generateMiaoshouListingEditTable', async (_event, input: CommerceListingEditInput) => {
    await authService.assertFeature('aiListing');
    const settings = await getNormalizedSettings();
    assertFeishuCredentials(settings.feishuAppId, settings.feishuAppSecret);
    assertMiaoshouCredentials({
      appKey: settings.miaoshouOpenApiAppKey,
      appSecret: settings.miaoshouOpenApiAppSecret,
    });
    const task = taskStore.getTask(input.taskId);
    if (!task) {
      throw new Error('任务不存在');
    }
    const feishuClient = new FeishuBitableClient({
      appId: settings.feishuAppId,
      appSecret: settings.feishuAppSecret,
    });
    const miaoshouClient = new MiaoshouOpenApiClient({
      baseUrl: settings.miaoshouOpenApiBaseUrl,
      appKey: settings.miaoshouOpenApiAppKey,
      appSecret: settings.miaoshouOpenApiAppSecret,
      accountId: settings.miaoshouOpenApiAccountId,
    });
    let reviewBatchId = input.batchId?.trim() ?? '';
    let approvedReviewCount = 0;
    let generatedReviewCount = 0;
    let failedReviewCount = 0;
    if (input.autoGenerateReviewFromLatestOutput && !input.retryFailedOnly) {
      const tableInput = getPriceComparisonTableInput(settings);
      const generated = await feishuClient.confirmLatestPriceBatchAndGenerateReviewTable({
        ...tableInput,
        batchId: reviewBatchId,
        weightToleranceGram: settings.weightGroupToleranceGram,
      });
      reviewBatchId = generated.batchId;
      generatedReviewCount = generated.generatedCount;
      failedReviewCount = generated.failedCount;
      await syncListingPricingForConfiguredSites(feishuClient, settings, tableInput);
    }
    if (input.autoApproveLatestReview) {
      const tableInput = getPriceComparisonTableInput(settings);
      const approved = await feishuClient.approveLatestReviewBatch({
        ...tableInput,
        batchId: reviewBatchId,
        weightToleranceGram: settings.weightGroupToleranceGram,
      });
      reviewBatchId = approved.batchId;
      approvedReviewCount = approved.approvedReviewCount;
    }

    const result = await feishuClient.generateMiaoshouListingEditTable({
      ...getCommerceTableInput(task),
      ...input,
      batchId: reviewBatchId || input.batchId,
      priceReviewBitable: normalizeBitableConfig(settings.priceReviewBitable),
      targetShopId: input.shopId || settings.targetShopId,
      targetShopName: input.shopName || settings.targetShopName,
      targetSite: input.site || settings.targetSite,
      shopMappings: parseListingShopMappings(settings.listingShopMappings),
      importLinks: async (links) => {
        const data = await miaoshouClient.importSourceLinks(links);
        return data.sourceItemIdAndDetailIdMap ?? {};
      },
      getCommonCollectBoxDetail: async (detailId) => miaoshouClient.getCommonCollectBoxDetail(detailId),
      claimToPlatform: async (detailIds, platform) => {
        const data = await miaoshouClient.claimCommonCollectBoxToPlatform(detailIds, platform);
        return data.platformCollectBoxDetailIdMap?.[platform] ?? {};
      },
      searchTiktokCollectBox: async (searchInput) => miaoshouClient.searchTiktokCollectBox(searchInput),
      claimToShop: async (claimInput) => miaoshouClient.claimTiktokCollectBoxToShop(claimInput),
      getShopCollectItemInfo: async (detailInput) => miaoshouClient.getShopCollectItemInfo(detailInput),
      getSiteCollectItemInfo: async (detailInput) => miaoshouClient.getSiteCollectItemInfo(detailInput),
    });
    return {
      ...result,
      reviewBatchId: result.reviewBatchId || reviewBatchId,
      approvedReviewCount,
      generatedReviewCount,
      failedReviewCount,
    };
  });

  ipcMain.handle('commerce:prepareMiaoshouListingDraftRetry', async (_event, input: CommerceMiaoshouDraftRetryInput) => {
    await authService.assertFeature('aiListing');
    const settings = await getNormalizedSettings();
    assertFeishuCredentials(settings.feishuAppId, settings.feishuAppSecret);
    const task = taskStore.getTask(input.taskId);
    if (!task) {
      throw new Error('任务不存在');
    }
    const feishuClient = new FeishuBitableClient({
      appId: settings.feishuAppId,
      appSecret: settings.feishuAppSecret,
    });

    return feishuClient.prepareMiaoshouListingDraftRetry({
      ...getCommerceTableInput(task),
      ...input,
      targetShopId: input.shopId ?? '',
      targetShopName: input.shopName ?? '',
      targetSite: input.site ?? '',
    });
  });

  ipcMain.handle('commerce:saveMiaoshouListingDrafts', async (_event, input: CommerceMiaoshouDraftSaveInput) => {
    await authService.assertFeature('aiListing');
    const settings = await getNormalizedSettings();
    assertFeishuCredentials(settings.feishuAppId, settings.feishuAppSecret);
    assertMiaoshouListingApiEnabled(settings);
    assertMiaoshouCredentials({
      appKey: settings.miaoshouOpenApiAppKey,
      appSecret: settings.miaoshouOpenApiAppSecret,
    });
    const task = taskStore.getTask(input.taskId);
    if (!task) {
      throw new Error('任务不存在');
    }
    const feishuClient = new FeishuBitableClient({
      appId: settings.feishuAppId,
      appSecret: settings.feishuAppSecret,
    });
    const miaoshouClient = new MiaoshouOpenApiClient({
      baseUrl: settings.miaoshouOpenApiBaseUrl,
      appKey: settings.miaoshouOpenApiAppKey,
      appSecret: settings.miaoshouOpenApiAppSecret,
      accountId: settings.miaoshouOpenApiAccountId,
    });

    return feishuClient.saveMiaoshouListingDrafts({
      ...getCommerceTableInput(task),
      ...input,
      targetShopId: input.shopId ?? '',
      targetShopName: input.shopName ?? '',
      targetSite: input.site ?? '',
      getShopCollectItemInfo: async (detailInput) => miaoshouClient.getShopCollectItemInfo(detailInput),
      getSiteCollectItemInfo: async (detailInput) => miaoshouClient.getSiteCollectItemInfo(detailInput),
      saveShopCollectItemInfo: async (saveInput) => miaoshouClient.saveShopCollectItemInfo(saveInput),
      saveSiteCollectItemInfo: async (saveInput) => miaoshouClient.saveSiteCollectItemInfo(saveInput),
    });
  });

  ipcMain.handle('commerce:publishMiaoshouListingProducts', async (_event, input: CommerceMiaoshouPublishInput) => {
    await authService.assertFeature('aiListing');
    const settings = await getNormalizedSettings();
    assertFeishuCredentials(settings.feishuAppId, settings.feishuAppSecret);
    assertMiaoshouListingApiEnabled(settings);
    assertMiaoshouCredentials({
      appKey: settings.miaoshouOpenApiAppKey,
      appSecret: settings.miaoshouOpenApiAppSecret,
    });
    const task = taskStore.getTask(input.taskId);
    if (!task) {
      throw new Error('任务不存在');
    }
    const feishuClient = new FeishuBitableClient({
      appId: settings.feishuAppId,
      appSecret: settings.feishuAppSecret,
    });
    const miaoshouClient = new MiaoshouOpenApiClient({
      baseUrl: settings.miaoshouOpenApiBaseUrl,
      appKey: settings.miaoshouOpenApiAppKey,
      appSecret: settings.miaoshouOpenApiAppSecret,
      accountId: settings.miaoshouOpenApiAccountId,
    });

    return feishuClient.publishMiaoshouListingProducts({
      ...getCommerceTableInput(task),
      ...input,
      targetShopId: input.shopId ?? '',
      targetShopName: input.shopName ?? '',
      targetSite: input.site ?? '',
      publishProducts: async (publishInput) => miaoshouClient.publishCollectTask(publishInput),
    });
  });

  ipcMain.handle('commerce:publishMiaoshouListingProductsByBrowser', async (_event, input: CommerceMiaoshouBrowserPublishInput) => {
    await authService.assertFeature('miaoshouBrowserPublish');
    const settings = await getNormalizedSettings();
    assertFeishuCredentials(settings.feishuAppId, settings.feishuAppSecret);
    const task = taskStore.getTask(input.taskId);
    if (!task) {
      throw new Error('任务不存在');
    }
    const feishuClient = new FeishuBitableClient({
      appId: settings.feishuAppId,
      appSecret: settings.feishuAppSecret,
    });
    const resultInput = getListingResultTableInput(settings);
    const ensuredResultTable = await feishuClient.ensureListingResultTable(resultInput);
    store.set('settings', {
      ...settings,
      listingResultBitable: ensuredResultTable.listingResultBitable,
    });
    const templates = parseMiaoshouPricingTemplatesJson(settings.miaoshouPricingTemplatesJson);
    const screenshotDir = path.join(
      settings.defaultOutputDir || path.join(os.homedir(), 'Documents', 'TikTok AI Flow', 'outputs'),
      'miaoshou-browser-screenshots',
    );

    return feishuClient.publishMiaoshouListingProductsByBrowser({
      ...getCommerceTableInput(task),
      ...input,
      listingResultBitable: ensuredResultTable.listingResultBitable,
      hasPricingTemplate: (row) => Boolean(resolvePricingTemplateForSite(
        templates,
        settings.miaoshouPricingTemplateMappings,
        row.targetShopSite || row.site,
      )),
      publishByBrowser: async (row) => publishMiaoshouListingRowByBrowser({
        settings,
        row: {
          recordId: row.recordId,
          key: row.key,
          productId: row.productId,
          site: row.targetShopSite || row.site,
          tiktokCollectBoxId: row.tiktokCollectBoxId,
          sourceItemId: row.collectSourceItemId || row.productId,
          sourcePrice: Number(row.unifiedSourcePrice),
          weightGram: Number(row.weightGram),
          lengthCm: Number(row.lengthCm) || 10,
          widthCm: Number(row.widthCm) || 10,
          heightCm: Number(row.heightCm) || 10,
          targetShopId: row.targetShopId,
          targetShopName: row.targetShopName,
        },
        template: resolvePricingTemplateForSite(templates, settings.miaoshouPricingTemplateMappings, row.targetShopSite || row.site),
        screenshotDir,
      }),
    });
  });

  ipcMain.handle('commerce:verifyMiaoshouPublishResults', async (_event, input: CommerceMiaoshouPublishVerifyInput) => {
    await authService.assertFeature('aiListing');
    const settings = await getNormalizedSettings();
    assertFeishuCredentials(settings.feishuAppId, settings.feishuAppSecret);
    assertMiaoshouListingApiEnabled(settings);
    assertMiaoshouCredentials({
      appKey: settings.miaoshouOpenApiAppKey,
      appSecret: settings.miaoshouOpenApiAppSecret,
    });
    const task = taskStore.getTask(input.taskId);
    if (!task) {
      throw new Error('任务不存在');
    }
    const feishuClient = new FeishuBitableClient({
      appId: settings.feishuAppId,
      appSecret: settings.feishuAppSecret,
    });
    const miaoshouClient = new MiaoshouOpenApiClient({
      baseUrl: settings.miaoshouOpenApiBaseUrl,
      appKey: settings.miaoshouOpenApiAppKey,
      appSecret: settings.miaoshouOpenApiAppSecret,
      accountId: settings.miaoshouOpenApiAccountId,
    });

    return feishuClient.verifyMiaoshouPublishResults({
      ...getCommerceTableInput(task),
      ...input,
      targetShopId: input.shopId ?? '',
      targetSite: input.site ?? '',
      searchTiktokCollectBox: async (searchInput) => miaoshouClient.searchTiktokCollectBox(searchInput),
    });
  });

  ipcMain.handle('commerce:preparePublishedListingMaintenance', async (_event, input: CommercePublishedMaintenanceInput) => {
    await authService.assertFeature('aiListing');
    const settings = await getNormalizedSettings();
    assertFeishuCredentials(settings.feishuAppId, settings.feishuAppSecret);
    const task = taskStore.getTask(input.taskId);
    if (!task) {
      throw new Error('任务不存在');
    }
    const feishuClient = new FeishuBitableClient({
      appId: settings.feishuAppId,
      appSecret: settings.feishuAppSecret,
    });

    return feishuClient.preparePublishedListingMaintenance({
      ...getCommerceTableInput(task),
      ...input,
    });
  });

  ipcMain.handle('dialog:selectExcel', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择选品 Excel 文件',
      properties: ['openFile'],
      filters: [{ name: 'Excel', extensions: ['xlsx', 'xls'] }],
    });

    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('dialog:selectChromeExecutable', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择 Chrome 可执行程序',
      properties: ['openFile'],
      filters:
        process.platform === 'win32'
          ? [{ name: 'Chrome', extensions: ['exe'] }]
          : process.platform === 'darwin'
            ? [{ name: 'Chrome', extensions: ['app'] }]
            : [{ name: 'Chrome', extensions: [''] }],
    });

    return result.canceled ? null : normalizeChromeSelection(result.filePaths[0]);
  });

  ipcMain.handle('dialog:selectDirectory', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择目录',
      properties: ['openDirectory', 'createDirectory'],
    });

    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('shell:openPath', async (_event, targetPath: string) => {
    const error = await shell.openPath(targetPath);
    if (error) {
      throw new Error(error);
    }
  });
}

function normalizeChromeSelection(selectedPath: string) {
  if (process.platform === 'darwin' && selectedPath.endsWith('.app')) {
    const appName = path.basename(selectedPath, '.app');
    return path.join(selectedPath, 'Contents', 'MacOS', appName);
  }

  return selectedPath;
}
