export type TaskStatus =
  | 'pending'
  | 'running'
  | 'skipped'
  | 'success'
  | 'partial_failed'
  | 'failed'
  | 'cancelled';

export type AppSettings = {
  authServerBaseUrl: string;
  authAppKey: string;
  defaultOutputDir: string;
  defaultAssetDir: string;
  targetShopName: string;
  targetShopId: string;
  targetSite: string;
  listingShopMappings: string;
  miaoshouPricingTemplatesJson: string;
  miaoshouPricingTemplateMappings: string;
  miaoshouTargetCategoryId: string;
  miaoshouPricingTemplateName: string;
  miaoshouSizeChartImageUrl: string;
  miaoshouWarehouseName: string;
  miaoshouLogisticsTemplateName: string;
  miaoshouOpenApiBaseUrl: string;
  miaoshouOpenApiAppKey: string;
  miaoshouOpenApiAppSecret: string;
  miaoshouOpenApiAccountId: string;
  enableMiaoshouListingApi: boolean;
  miaoshouDefaultStock: number;
  listingCollectSource: 'sourceUrl' | 'offerUrl';
  listingExchangeRates: string;
  listingTargetProfitRate: number;
  listingDiscountRate: number;
  listingTkFeeRate: number;
  listingShippingFormulas: string;
  freightForwarderAddress: string;
  feishuAppId: string;
  feishuAppSecret: string;
  realtimePollIntervalSeconds: number;
  lastFeishuInputBitable: FeishuBitableConfig;
  lastFeishuOutputBitable: FeishuBitableConfig;
  priceInputBitable: FeishuBitableConfig;
  priceOutputBitable: FeishuBitableConfig;
  priceReviewBitable: FeishuBitableConfig;
  listingResultBitable: FeishuBitableConfig;
  weightGroupToleranceGram: number;
  autoGenerateListingReviewTable: boolean;
  enable1688RealFactoryFilter: boolean;
  enable1688StrengthFactoryFilter: boolean;
  enable1688AnnualSalesFilter: boolean;
  min1688AnnualSales: number;
  enable1688MonthlySalesFilter: boolean;
  min1688MonthlySales: number;
  enable1688SalesReference: boolean;
  min1688SalesVolume: number;
  missing1688SalesAction: 'ignore' | 'markRisk' | 'filter';
  candidateLimit: number;
  acceptedCandidateLimit: number;
  sourcingMode: 'fast' | 'accurate';
  parseDetailByDefault: boolean;
  searchAdapterMode: 'mock' | 'real1688';
  chromeMode: 'connect' | 'launch';
  taskBrowserMode: 'headed' | 'headless';
  chromeCdpUrl: string;
  chromeExecutablePath: string;
  chromeUserDataDir: string;
  imageSearchUrl: string;
  aiBaseUrl: string;
  aiApiKey: string;
  aiModel: string;
  aiSimilarityThreshold: number;
  pageTimeoutMs: number;
  retryCount: number;
  excelRowConcurrency: number;
  detailPageConcurrency: number;
  aiRequestConcurrency: number;
  aiListBatchSize: number;
};

export type AuthConfig = {
  serverBaseUrl: string;
  appKey: string;
};

export type AuthPermission = {
  expiresAt?: string;
  maxDevices?: number;
  features?: Record<string, unknown>;
  [key: string]: unknown;
};

export type AuthSession = {
  accessToken: string;
  username: string;
  user?: Record<string, unknown>;
  app?: Record<string, unknown>;
  permission?: AuthPermission;
  device?: Record<string, unknown>;
  loggedInAt: string;
  verifiedAt: string;
  expiresAt?: string;
};

export type AuthStatus = {
  authenticated: boolean;
  config: AuthConfig;
  session?: AuthSession;
  message?: string;
};

export type AuthLoginInput = {
  username: string;
  password: string;
  serverBaseUrl?: string;
  appKey?: string;
};

export type FeishuBitableConfig = {
  appToken: string;
  tableId: string;
  viewId: string;
};

export type CommerceTablesResult = {
  listingBitable: FeishuBitableConfig;
  listingAuditBitable: FeishuBitableConfig;
  publicationBitable: FeishuBitableConfig;
  purchaseBitable: FeishuBitableConfig;
};

export type PriceComparisonTablesResult = {
  inputBitable: FeishuBitableConfig;
  outputBitable: FeishuBitableConfig;
  reviewBitable: FeishuBitableConfig;
};

export type PriceComparisonReviewGenerationInput = {
  weightToleranceGram?: number;
  batchId?: string;
};

export type PriceComparisonReviewGenerationResult = PriceComparisonTablesResult & {
  scannedGroupCount: number;
  generatedCount: number;
  failedCount: number;
};

export type PriceComparisonConfirmLatestBatchResult = PriceComparisonReviewGenerationResult & {
  batchId: string;
  verifiedOutputCount: number;
  pricingSyncedCount: number;
};

export type LocalThreeTableTemplateResult = {
  outputExcelPath: string;
};

export type LocalPriceComparisonReviewGenerationInput = {
  workbookPath: string;
  weightToleranceGram?: number;
};

export type LocalPriceComparisonReviewGenerationResult = {
  outputExcelPath: string;
  scannedGroupCount: number;
  generatedCount: number;
  failedCount: number;
};

export type CommerceSyncResult = CommerceTablesResult & {
  scannedCount: number;
  createdCount: number;
  skippedCount: number;
};

export type CommerceExportInput = {
  taskId: string;
  pricingTemplateName?: string;
  warehouseName?: string;
  logisticsTemplateName?: string;
  shopName?: string;
  site?: string;
};

export type CommerceExportResult = CommerceTablesResult & {
  exportedCount: number;
  publicationTaskCount: number;
  outputExcelPath: string;
};

export type CommerceListingAuditInput = {
  taskId: string;
  exchangeRates?: string;
  targetProfitRate?: number;
};

export type CommerceListingAuditResult = CommerceTablesResult & {
  scannedCount: number;
  auditedCount: number;
  skippedCount: number;
  unavailableCount: number;
  outputExcelPath?: string;
};

export type CommercePurchaseInput = {
  taskId: string;
  freightForwarderAddress?: string;
};

export type CommercePurchaseResult = CommerceTablesResult & {
  scannedCount: number;
  updatedCount: number;
  manualCount: number;
};

export type CommerceMiaoshouDraftInput = {
  taskId: string;
  stock?: number;
};

export type CommerceMiaoshouDraftResult = CommerceTablesResult & {
  scannedCount: number;
  createdCount: number;
  skippedCount: number;
  failedCount: number;
};

export type MiaoshouShop = {
  shopId: number | string;
  site: string;
  siteName?: string;
  shopNick?: string;
  platform?: string;
  parentShopId?: number | string | null;
  isCb?: number | string;
  isCnsc?: number | string;
  status?: string;
  gmtExpire?: string;
  gmtLastAuth?: string;
};

export type ListingShopMapping = {
  site: string;
  shopId: string;
  shopName: string;
};

export type MiaoshouPricingTemplate = {
  priceTemplateId: string;
  name: string;
  site: string;
  siteType?: string;
  currency?: string;
  profitPercent?: number | string;
  discount?: number | string;
  platformChargePercent?: number | string;
  paymentChargePercent?: number | string;
  withdrawChargePercent?: number | string;
  affiliateChargePercent?: number | string;
  vatChargePercent?: number | string;
  tariffChargePercent?: number | string;
  bcpChargePercent?: number | string;
  otherCharge?: number | string;
  weightRefType?: string;
  logisticsComputeType?: string;
  displayWeightUnit?: string;
  updatedAt?: string;
};

export type CommerceShopQueryInput = {
  platform?: string;
  site?: string;
  sites?: string[];
};

export type CommerceShopQueryResult = {
  shops: MiaoshouShop[];
};

export type CommerceShopConfigExportInput = {
  sites?: string[];
};

export type CommerceShopConfigExportResult = {
  outputExcelPath: string;
  shopCount: number;
};

export type MiaoshouPricingTemplateRefreshInput = {
  site?: string;
};

export type MiaoshouPricingTemplateRefreshResult = {
  templates: MiaoshouPricingTemplate[];
};

export type CommerceListingPricingSyncInput = {
  site?: string;
  exchangeRate?: number;
  targetProfitRate?: number;
  discountRate?: number;
  tkFeeRate?: number;
  shippingFormulas?: string;
};

export type CommerceListingPricingSyncResult = {
  reviewBitable: FeishuBitableConfig;
  scannedCount: number;
  updatedCount: number;
  skippedCount: number;
};

export type CommerceSourceImportInput = {
  taskId: string;
  collectSource?: AppSettings['listingCollectSource'];
};

export type CommerceSourceImportResult = CommerceTablesResult & {
  scannedCount: number;
  importedCount: number;
  skippedCount: number;
  failedCount: number;
};

export type CommerceClaimInput = {
  taskId: string;
  platform?: string;
};

export type CommerceClaimResult = CommerceTablesResult & {
  scannedCount: number;
  claimedCount: number;
  skippedCount: number;
  failedCount: number;
};

export type CommercePublishCheckInput = {
  taskId: string;
  site?: string;
  shopId?: string;
  categoryId?: string;
  requireDraftSaved?: boolean;
};

export type CommercePublishCheckResult = {
  collectBoxCount: number;
  warehouseCount: number;
  categoryMetadataLoaded: boolean;
  missing: string[];
  scannedCount?: number;
  readyCount?: number;
  alreadySubmittedCount?: number;
  failedCount?: number;
};

export type CommerceListingEditInput = {
  taskId: string;
  site?: string;
  shopId?: string;
  shopName?: string;
  categoryId?: string;
  limit?: number;
  batchId?: string;
  autoApproveLatestReview?: boolean;
  autoGenerateReviewFromLatestOutput?: boolean;
  retryFailedOnly?: boolean;
};

type CommerceListingEditTableResult = {
  listingEditBitable: FeishuBitableConfig;
};

export type CommerceListingResultTableResult = {
  listingResultBitable: FeishuBitableConfig;
};

export type CommerceListingEditResult = CommerceListingEditTableResult & {
  scannedCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  reviewBatchId?: string;
  approvedReviewCount?: number;
  generatedReviewCount?: number;
  failedReviewCount?: number;
};

export type CommerceMiaoshouDraftSaveInput = {
  taskId: string;
  site?: string;
  shopId?: string;
  shopName?: string;
  categoryId?: string;
  limit?: number;
};

export type CommerceMiaoshouDraftRetryInput = {
  taskId: string;
  site?: string;
  shopId?: string;
  shopName?: string;
  limit?: number;
};

export type CommerceMiaoshouDraftRetryResult = CommerceListingEditTableResult & {
  scannedCount: number;
  preparedCount: number;
  skippedCount: number;
  failedCount: number;
};

export type CommerceMiaoshouDraftSaveResult = CommerceListingEditTableResult & {
  scannedCount: number;
  savedCount: number;
  skippedCount: number;
  failedCount: number;
};

export type CommerceMiaoshouPublishInput = {
  taskId: string;
  site?: string;
  shopId?: string;
  shopName?: string;
  limit?: number;
  confirmPublish?: boolean;
};

export type CommerceMiaoshouPublishResult = CommerceListingEditTableResult & {
  scannedCount: number;
  publishedCount: number;
  skippedCount: number;
  failedCount: number;
};

export type CommerceMiaoshouBrowserPublishInput = {
  taskId: string;
  limit?: number;
  batchId?: string;
  failedOnly?: boolean;
};

export type CommerceMiaoshouBrowserPublishResult = CommerceListingEditTableResult &
  CommerceListingResultTableResult & {
    scannedCount: number;
    executedCount: number;
    skippedCount: number;
    failedCount: number;
  };

export type CommerceMiaoshouPublishVerifyInput = {
  taskId: string;
  site?: string;
  shopId?: string;
  limit?: number;
};

export type CommerceMiaoshouPublishVerifyResult = CommerceListingEditTableResult & {
  scannedCount: number;
  verifiedCount: number;
  publishedCount: number;
  pendingCount: number;
  notFoundCount: number;
  failedCount: number;
};

export type CommercePublishedMaintenanceInput = {
  taskId: string;
  limit?: number;
};

export type CommercePublishedMaintenanceResult = CommerceListingEditTableResult & {
  scannedCount: number;
  preparedCount: number;
  skippedCount: number;
  failedCount: number;
};

export type TaskInputSource = 'excel' | 'feishuBitable';

export type Task = {
  id: string;
  name: string;
  status: TaskStatus;
  inputSource: TaskInputSource;
  inputExcelPath: string;
  inputBitable?: FeishuBitableConfig;
  outputBitable?: FeishuBitableConfig;
  assetDir: string;
  candidateLimit: number;
  acceptedCandidateLimit: number;
  sourcingMode: AppSettings['sourcingMode'];
  parseDetail: boolean;
  searchAdapterMode: AppSettings['searchAdapterMode'];
  totalCount: number;
  successCount: number;
  failedCount: number;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  currentRunId?: string;
  latestRunId?: string;
  realtimeEnabled?: boolean;
};

export type TaskRun = {
  id: string;
  taskId: string;
  name: string;
  status: TaskStatus;
  inputSource: TaskInputSource;
  inputExcelPath: string;
  outputExcelPath: string;
  inputBitable?: FeishuBitableConfig;
  outputBitable?: FeishuBitableConfig;
  assetDir: string;
  candidateLimit: number;
  acceptedCandidateLimit: number;
  sourcingMode: AppSettings['sourcingMode'];
  parseDetail: boolean;
  searchAdapterMode: AppSettings['searchAdapterMode'];
  totalCount: number;
  successCount: number;
  failedCount: number;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  feishuInputRecordId?: string;
  feishuInputItem?: ProductItem;
  feishuReviewBatchId?: string;
  feishuListingAutoRun?: boolean;
  localRowLimit?: number;
  localStatusFilter?: RowStatusFilter;
  feishuClaimStatus?: RowStatusFilter;
};

export type RowStatusFilter = 'pendingOnly' | 'failedOnly' | 'retryable';

export type AiUsageStats = {
  provider: 'mock' | 'openai_compatible';
  model: string;
  singleImageCalls: number;
  batchImageCalls: number;
  attributeCalls: number;
  imageCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type ProductItemStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'missing_image'
  | 'not_found'
  | 'failed';

export type ProductItem = {
  rowIndex: number;
  productId: string;
  sourceUrl?: string;
  zhengheDataUrl?: string;
  imageUrl?: string;
  sourceImageUrl?: string;
  localImagePath?: string;
  title?: string;
  country?: string;
  category?: string;
  status: ProductItemStatus;
  errorMessage?: string;
  candidates?: SupplierCandidate[];
  skuMatches?: SkuMatchResult[];
};

export type SupplierCandidate = {
  productId: string;
  offerUrl: string;
  offerId: string;
  title: string;
  supplier: string;
  supplierType: '工厂' | '供应商' | '未识别';
  member: boolean;
  coverImageUrl?: string;
  listPrice?: number;
  listImageSimilarity?: number;
  riskFlags: string[];
  score: number;
  suggestion: '待详情验证' | '不建议';
  annualSalesVolume?: number;
  annualSalesText?: string;
  monthlyDistributionVolume?: number;
  monthlyDistributionText?: string;
  pluginExtraText?: string;
  salesVolume?: number;
  salesText?: string;
  salesRiskNote?: string;
};

export type SkuMatchResult = {
  productId: string;
  offerId: string;
  offerUrl: string;
  skuId: string;
  skuName: string;
  skuImageUrl?: string;
  skuImageSimilarity: number;
  isSameProduct: boolean;
  itemPrice?: number;
  shippingFee?: number;
  purchaseCost?: number;
  currency: 'CNY';
  quantity: number;
  dimensions?: string;
  weightGram?: number;
  weightSource?: '属性' | '文本' | '详情页' | '物流/运费' | '未识别';
  weightConfidence?: '高' | '中' | '低';
  extractionSource: 'mock' | 'detail_page';
  riskFlags: string[];
};

export type CreateTaskInput = {
  inputSource?: TaskInputSource;
  inputExcelPath?: string;
  inputBitable?: FeishuBitableConfig;
  outputBitable?: FeishuBitableConfig;
  reviewBitable?: FeishuBitableConfig;
  feishuAppId?: string;
  feishuAppSecret?: string;
  candidateLimit?: number;
  acceptedCandidateLimit?: number;
  sourcingMode?: AppSettings['sourcingMode'];
  parseDetail?: boolean;
  outputDir?: string;
};

export type TaskLogEntry = {
  id: string;
  taskId: string;
  runId: string;
  createdAt: string;
  level: 'info' | 'warn' | 'error';
  message: string;
};

export type AppApi = {
  getAuthStatus: () => Promise<AuthStatus>;
  loginAuth: (input: AuthLoginInput) => Promise<AuthStatus>;
  verifyAuth: () => Promise<AuthStatus>;
  heartbeatAuth: () => Promise<AuthStatus>;
  logoutAuth: () => Promise<AuthStatus>;
  getSettings: () => Promise<AppSettings>;
  saveSettings: (settings: AppSettings) => Promise<AppSettings>;
  listTasks: () => Promise<Task[]>;
  createTask: (input: CreateTaskInput) => Promise<Task>;
  startTask: (taskId: string) => Promise<TaskRun>;
  retryFailedTask: (taskId: string) => Promise<TaskRun>;
  startRealtimeTask: (taskId: string) => Promise<Task>;
  stopRealtimeTask: (taskId: string) => Promise<Task>;
  cancelTask: (taskId: string) => Promise<TaskRun | Task>;
  deleteTask: (taskId: string) => Promise<Task[]>;
  clearTasks: () => Promise<Task[]>;
  listTaskRuns: (taskId: string) => Promise<TaskRun[]>;
  deleteTaskRun: (runId: string) => Promise<TaskRun[]>;
  getTaskLogs: (taskId: string) => Promise<TaskLogEntry[]>;
  getRunLogEntries: (runId: string) => Promise<TaskLogEntry[]>;
  selectExcelFile: () => Promise<string | null>;
  selectChromeExecutable: () => Promise<string | null>;
  selectDirectory: () => Promise<string | null>;
  openLoginBrowser: () => Promise<AppSettings>;
  openPath: (targetPath: string) => Promise<void>;
  openUserGuide: () => Promise<void>;
  ensurePriceComparisonTables: () => Promise<PriceComparisonTablesResult>;
  exportLocalThreeTableTemplate: () => Promise<LocalThreeTableTemplateResult>;
  generateLocalPriceComparisonReviewTable: (
    input: LocalPriceComparisonReviewGenerationInput,
  ) => Promise<LocalPriceComparisonReviewGenerationResult>;
  generatePriceComparisonReviewTable: (
    input?: PriceComparisonReviewGenerationInput,
  ) => Promise<PriceComparisonReviewGenerationResult>;
  confirmLatestPriceBatchAndGenerateReviewTable: () => Promise<PriceComparisonConfirmLatestBatchResult>;
  queryMiaoshouShops: (input: CommerceShopQueryInput) => Promise<CommerceShopQueryResult>;
  exportMiaoshouShopConfig: (input?: CommerceShopConfigExportInput) => Promise<CommerceShopConfigExportResult>;
  refreshMiaoshouPricingTemplates: (
    input?: MiaoshouPricingTemplateRefreshInput,
  ) => Promise<MiaoshouPricingTemplateRefreshResult>;
  syncListingPricingConfigToReviewTable: (
    input: CommerceListingPricingSyncInput,
  ) => Promise<CommerceListingPricingSyncResult>;
  ensureMiaoshouListingResultTable: () => Promise<CommerceListingResultTableResult>;
  checkMiaoshouPublishReadiness: (input: CommercePublishCheckInput) => Promise<CommercePublishCheckResult>;
  generateMiaoshouListingEditTable: (input: CommerceListingEditInput) => Promise<CommerceListingEditResult>;
  prepareMiaoshouListingDraftRetry: (input: CommerceMiaoshouDraftRetryInput) => Promise<CommerceMiaoshouDraftRetryResult>;
  saveMiaoshouListingDrafts: (input: CommerceMiaoshouDraftSaveInput) => Promise<CommerceMiaoshouDraftSaveResult>;
  publishMiaoshouListingProducts: (input: CommerceMiaoshouPublishInput) => Promise<CommerceMiaoshouPublishResult>;
  publishMiaoshouListingProductsByBrowser: (
    input: CommerceMiaoshouBrowserPublishInput,
  ) => Promise<CommerceMiaoshouBrowserPublishResult>;
  verifyMiaoshouPublishResults: (input: CommerceMiaoshouPublishVerifyInput) => Promise<CommerceMiaoshouPublishVerifyResult>;
  preparePublishedListingMaintenance: (input: CommercePublishedMaintenanceInput) => Promise<CommercePublishedMaintenanceResult>;
};
