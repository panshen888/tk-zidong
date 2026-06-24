import fs from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import type {
  CommerceClaimInput,
  CommerceExportInput,
  CommerceListingAuditInput,
  CommerceListingEditInput,
  CommerceListingEditResult,
  CommerceListingPricingSyncInput,
  CommerceListingPricingSyncResult,
  CommerceMiaoshouDraftInput,
  CommerceMiaoshouDraftRetryInput,
  CommerceMiaoshouDraftRetryResult,
  CommerceMiaoshouDraftSaveInput,
  CommerceMiaoshouDraftSaveResult,
  CommerceMiaoshouBrowserPublishInput,
  CommerceMiaoshouBrowserPublishResult,
  CommerceMiaoshouPublishInput,
  CommerceMiaoshouPublishResult,
  CommerceMiaoshouPublishVerifyInput,
  CommerceMiaoshouPublishVerifyResult,
  CommercePublishedMaintenanceInput,
  CommercePublishedMaintenanceResult,
  CommercePublishCheckInput,
  CommercePurchaseInput,
  CommerceSourceImportInput,
  CommerceTablesResult,
  FeishuBitableConfig,
  ListingShopMapping,
  MiaoshouCategoryNode,
  MiaoshouPricingTemplate,
  PriceComparisonReviewGenerationInput,
  PriceComparisonReviewGenerationResult,
  PriceComparisonTablesResult,
  ProductItem,
  RowStatusFilter,
} from '../../shared/types';
import {
  duplicateLocations,
  priceInputFailureReasons,
  priceInputHeaders,
  priceInputStatuses,
  priceInputTableName,
  priceOutputCandidateStatuses,
  priceOutputFailureReasons,
  priceOutputGroupStatuses,
  priceOutputHeaders,
  priceOutputTableName,
  priceReviewFailureReasons,
  priceReviewHeaders,
  priceReviewStatuses,
  priceReviewTableName,
} from '../../shared/priceComparisonSchema';
import {
  buildTikTokProductUrl,
  parseZhengheProductReference,
  ZhengheDataClient,
  type ZhengheDataClient as ZhengheDataClientType,
} from './zhengheDataService';
import {
  buildListingAuditRows,
  getListingAuditHeaders,
  listingAuditRowToChineseFields,
  writeListingAuditExcel,
} from './listingAuditService';
import { parseTikTokProductUrl } from './tiktokProductUrl';

type FeishuFieldType =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 7
  | 11
  | 13
  | 15
  | 17
  | 18
  | 19
  | 20
  | 21
  | 22
  | 23
  | 1001
  | 1002
  | 1003
  | 1004
  | 1005;

type FeishuField = {
  field_id: string;
  field_name?: string;
  name?: string;
  type: FeishuFieldType;
};

type FeishuCreateField = {
  field_name: string;
  type: FeishuFieldType;
  ui_type?: string;
  property?: Record<string, unknown>;
};

type PriceComparisonFieldOptions = {
  options?: string[];
};

type FeishuTable = {
  table_id: string;
  name: string;
  revision?: number;
};

type FeishuRecord = {
  record_id: string;
  fields: Record<string, unknown>;
};

type FeishuListResponse<T> = {
  code: number;
  msg: string;
  data?: {
    has_more?: boolean;
    page_token?: string;
    items?: T[];
  };
};

type FeishuSingleResponse<T> = {
  code: number;
  msg: string;
  data?: T;
};

export type FeishuBitableClientOptions = {
  appId: string;
  appSecret: string;
  baseUrl?: string;
  defaultSite?: string;
};

export type ExportBitableToExcelInput = {
  bitable: FeishuBitableConfig;
  outputExcelPath: string;
};

export type ExportSelectionRecordToExcelInput = ExportBitableToExcelInput & {
  recordId: string;
};

export type ClaimedSelectionRecord = {
  recordId: string;
  sourceUrl: string;
  item: ProductItem;
};

export type PriceComparisonDuplicateScope = {
  inputBitable?: FeishuBitableConfig;
  outputBitable?: FeishuBitableConfig;
  reviewBitable?: FeishuBitableConfig;
};

export type WriteOutputRowsInput = {
  bitable: FeishuBitableConfig;
  items: ProductItem[];
  batchId?: string;
  candidateOutputLimit?: number;
  inputRecordId?: string;
};

export type EnsureTaskTablesInput = {
  inputBitable: FeishuBitableConfig;
  outputBitable: FeishuBitableConfig;
};

export type EnsureTaskTablesResult = {
  inputBitable: FeishuBitableConfig;
  outputBitable: FeishuBitableConfig;
};

export type EnsureCommerceTablesInput = {
  appToken: string;
  listingBitable?: Partial<FeishuBitableConfig>;
  publicationBitable?: Partial<FeishuBitableConfig>;
  purchaseBitable?: Partial<FeishuBitableConfig>;
};

export type EnsurePriceComparisonTablesInput = {
  appToken: string;
  inputBitable?: Partial<FeishuBitableConfig>;
  outputBitable?: Partial<FeishuBitableConfig>;
  reviewBitable?: Partial<FeishuBitableConfig>;
};

export type EnsureListingResultTableInput = {
  appToken: string;
  listingResultBitable?: Partial<FeishuBitableConfig>;
};

export type SyncListingProductsInput = EnsureCommerceTablesInput & {
  outputBitable: FeishuBitableConfig;
};

export type ExportMiaoshouListingInput = EnsureCommerceTablesInput & CommerceExportInput & {
  outputExcelPath: string;
};

export type GenerateListingAuditInput = EnsureCommerceTablesInput & CommerceListingAuditInput & {
  outputBitable: FeishuBitableConfig;
  outputExcelPath?: string;
  zhengheClient: ZhengheDataClientType;
};

export type GeneratePurchaseTasksInput = EnsureCommerceTablesInput & CommercePurchaseInput;

export type CreateMiaoshouCollectBoxDraftsInput = EnsureCommerceTablesInput &
  CommerceMiaoshouDraftInput & {
    createDraft: (row: ListingProductRecord, stock: number) => Promise<{ draftId?: string }>;
  };

export type ImportMiaoshouSourceLinksInput = EnsureCommerceTablesInput &
  CommerceSourceImportInput & {
    importLinks: (links: string[]) => Promise<Record<string, string | number>>;
  };

export type ClaimMiaoshouProductsInput = EnsureCommerceTablesInput &
  CommerceClaimInput & {
    claimProducts: (detailIds: Array<string | number>, platform: string) => Promise<Record<string, string | number>>;
  };

export type CheckMiaoshouPublishReadinessInput = EnsureCommerceTablesInput &
  CommercePublishCheckInput & {
    checkRemote: (input: { site: string; shopId: string }) => Promise<{
      collectBoxCount: number;
      warehouseCount: number;
      categoryMetadataLoaded: boolean;
      missing: string[];
    }>;
    checkDraft?: (input: { detailId: string | number; shopId: string | number; site: string }) => Promise<unknown>;
  };

export type GenerateMiaoshouListingEditTableInput = EnsureCommerceTablesInput &
  CommerceListingEditInput & {
    priceReviewBitable?: FeishuBitableConfig;
    targetShopId: string;
    targetShopName: string;
    targetSite: string;
    targetCategoryId?: string;
    categoryTreeCacheJson?: string;
    sizeChartImageUrl?: string;
    requiredAttributeDefaults?: string;
    shopMappings?: ListingShopMapping[];
    importLinks: (links: string[]) => Promise<Record<string, string | number>>;
    getCommonCollectBoxDetail: (detailId: string | number) => Promise<unknown>;
    claimToPlatform: (detailIds: Array<string | number>, platform: string) => Promise<Record<string, string | number>>;
    searchTiktokCollectBox: (input: { sourceItemIdKeyword?: string; pageSize?: number; status?: string }) => Promise<unknown[]>;
    claimToShop: (input: { detailIds: Array<string | number>; shopIds: Array<string | number> }) => Promise<unknown>;
    getShopCollectItemInfo: (input: { detailId: string | number; shopId: string | number }) => Promise<unknown>;
    getSiteCollectItemInfo: (input: { detailId: string | number; site: string }) => Promise<unknown>;
    getCategoryTreeBySite?: (site: string) => Promise<MiaoshouCategoryNode[]>;
    getCategoryMetadata?: (input: { site: string; cid: string; shopIds: Array<string | number> }) => Promise<unknown>;
    saveShopCollectItemInfo?: (input: {
      detailId: string | number;
      shopId: string | number;
      ossMd5: string;
      shopCollectItemInfo: unknown;
    }) => Promise<unknown>;
  };

export type PrepareMiaoshouListingDraftRetryInput = EnsureCommerceTablesInput &
  CommerceMiaoshouDraftRetryInput & {
    targetShopId: string;
    targetShopName: string;
    targetSite: string;
  };

export type SaveMiaoshouListingDraftsInput = EnsureCommerceTablesInput &
  CommerceMiaoshouDraftSaveInput & {
    targetShopId: string;
    targetShopName: string;
    targetSite: string;
    targetCategoryId?: string;
    getShopCollectItemInfo: (input: { detailId: string | number; shopId: string | number }) => Promise<unknown>;
    getSiteCollectItemInfo: (input: { detailId: string | number; site: string }) => Promise<unknown>;
    saveShopCollectItemInfo: (input: {
      detailId: string | number;
      shopId: string | number;
      ossMd5: string;
      shopCollectItemInfo: unknown;
    }) => Promise<unknown>;
    saveSiteCollectItemInfo: (input: {
      detailId: string | number;
      site: string;
      ossMd5: string;
      siteCollectItemInfo: unknown;
    }) => Promise<unknown>;
  };

export type PublishMiaoshouListingProductsInput = EnsureCommerceTablesInput &
  CommerceMiaoshouPublishInput & {
    targetShopId: string;
    targetShopName: string;
    targetSite: string;
    publishProducts: (input: { detailIds: Array<string | number>; shopIds: Array<string | number> }) => Promise<unknown>;
  };

export type PublishMiaoshouListingProductsByBrowserInput = EnsureCommerceTablesInput &
  CommerceMiaoshouBrowserPublishInput & {
    listingResultBitable?: FeishuBitableConfig;
    hasPricingTemplate?: (row: ListingEditRecord) => boolean;
    publishByBrowser: (row: ListingEditRecord) => Promise<{
      status: 'success' | 'failed';
      currentStep: string;
      publishResult: string;
      failureReason: string;
      screenshotPath: string;
      template?: MiaoshouPricingTemplate;
    }>;
  };

export type VerifyMiaoshouPublishResultsInput = EnsureCommerceTablesInput &
  CommerceMiaoshouPublishVerifyInput & {
    targetShopId: string;
    targetSite: string;
    searchTiktokCollectBox: (input: { sourceItemIdKeyword?: string; pageSize?: number; status?: string }) => Promise<unknown[]>;
  };

export type PreparePublishedListingMaintenanceInput = EnsureCommerceTablesInput &
  CommercePublishedMaintenanceInput;

const selectionSheetName = '閫夊搧琛?;
const feishuApiBaseUrl = 'https://open.feishu.cn/open-apis';
const inputColumns = [
  { targetHeader: '鍘熷晢鍝両D', candidates: ['鍟嗗搧ID', '鍘熷晢鍝両D', '浜у搧ID', 'Product ID', 'productId'] },
  { targetHeader: '鍘熷晢鍝侀摼鎺?, candidates: ['鍘熷晢鍝侀摼鎺?, '鍟嗗搧閾炬帴', '鍟嗗搧URL', '閾炬帴', 'sourceUrl'] },
  { targetHeader: '閮戝拰鏁版嵁閾炬帴', candidates: ['閮戝拰鏁版嵁閾炬帴', '閮戝拰閾炬帴', '閮戝拰鍟嗗搧閾炬帴', 'zhengheUrl', 'zhengheDataUrl'] },
  { targetHeader: '鍘熷晢鍝佷富鍥綰RL', candidates: ['鍘熷晢鍝佷富鍥綰RL', '涓诲浘URL', '鍟嗗搧涓诲浘', '鍥剧墖URL', '鍥剧墖', 'imageUrl'] },
  { targetHeader: '鍟嗗搧鏍囬', candidates: ['鍟嗗搧鏍囬', '鏍囬', '鍝佸悕', 'title'] },
  { targetHeader: '鍥藉', candidates: ['鍥藉/绔欑偣', '鍥藉', '绔欑偣', '甯傚満', 'country'] },
  { targetHeader: '绫荤洰', candidates: ['绫荤洰', '鍒嗙被', 'category'] },
  { targetHeader: '鐩爣绔欑偣绫荤洰', candidates: ['鐩爣绔欑偣绫荤洰', '鐩爣绫荤洰', '涓婃灦绫荤洰', 'targetSiteCategory'] },
];
const statusFieldCandidates = ['鐘舵€?, '鏍稿疄鐘舵€?, '澶勭悊鐘舵€?];
const sourceUrlFieldCandidates = ['鍘熷晢鍝侀摼鎺?, '鍟嗗搧閾炬帴', '鍟嗗搧URL', '閾炬帴', 'sourceUrl'];
const imageUrlFieldCandidates = ['鍘熷晢鍝佷富鍥綰RL', '涓诲浘URL', '鍟嗗搧涓诲浘', '鍥剧墖URL', '鍥剧墖', 'imageUrl'];
const productIdFieldCandidates = ['鍟嗗搧ID', '鍘熷晢鍝両D', '浜у搧ID', 'Product ID'];
const countryFieldCandidates = ['鍥藉/绔欑偣', '鍥藉', '绔欑偣', '甯傚満', 'country'];
const titleFieldCandidates = ['鍟嗗搧鏍囬', '鏍囬', '鍝佸悕', 'title'];
const categoryFieldCandidates = ['绫荤洰', '鍒嗙被', 'category'];
const targetSiteCategoryFieldCandidates = ['鐩爣绔欑偣绫荤洰', '鐩爣绫荤洰', '涓婃灦绫荤洰', 'targetSiteCategory'];

const inputTableName = '杈撳叆琛?;
const outputTableName = '杈撳嚭璐ф簮琛?;
const listingTableName = '寰呬笂鏋跺晢鍝佽〃';
const listingAuditTableName = 'AI涓婃灦瀹℃牳琛?;
const publicationTableName = '鍒婄櫥浠诲姟琛?;
const listingEditTableName = 'AI涓婃灦缂栬緫琛?;
const listingResultTableName = 'AI涓婃灦缁撴灉琛?;
const purchaseTableName = '閲囪喘浠诲姟琛?;
const defaultViewName = '琛ㄦ牸瑙嗗浘';

const inputTableFields: FeishuCreateField[] = [
  { field_name: '鍘熷晢鍝両D', type: 1 },
  { field_name: '鍘熷晢鍝侀摼鎺?, type: 15, ui_type: 'Url' },
  { field_name: '閮戝拰鏁版嵁閾炬帴', type: 15, ui_type: 'Url' },
  { field_name: '鍘熷晢鍝佷富鍥綰RL', type: 15, ui_type: 'Url' },
  { field_name: '鍟嗗搧鏍囬', type: 1 },
  { field_name: '鍥藉', type: 1 },
  { field_name: '绫荤洰', type: 1 },
  { field_name: '鐘舵€?, type: 1 },
];
const outputTableFields: FeishuCreateField[] = [
  { field_name: '鍘熷晢鍝両D', type: 1 },
  { field_name: '鍘熷晢鍝侀摼鎺?, type: 15, ui_type: 'Url' },
  { field_name: '閮戝拰鏁版嵁閾炬帴', type: 15, ui_type: 'Url' },
  { field_name: '鐘舵€?, type: 1 },
  { field_name: '鍘熷晢鍝佹爣棰?, type: 1 },
  { field_name: '鍥藉', type: 1 },
  { field_name: '绫荤洰', type: 1 },
  { field_name: '鍘熷晢鍝佷富鍥綰RL', type: 15, ui_type: 'Url' },
  { field_name: '鎼滃浘鐘舵€?, type: 1 },
  { field_name: '鎺ㄨ崘鎺掑悕', type: 2, ui_type: 'Number', property: { formatter: '0' } },
  { field_name: '1688閾炬帴', type: 15, ui_type: 'Url' },
  { field_name: 'offerId', type: 1 },
  { field_name: '1688涓诲浘URL', type: 15, ui_type: 'Url' },
  { field_name: '鍒楄〃鍥剧墖鐩镐技搴?, type: 2, ui_type: 'Number', property: { formatter: '0.00%' } },
  { field_name: '1688鍊欓€夋暟', type: 2, ui_type: 'Number', property: { formatter: '0' } },
  { field_name: '渚涘簲鍟嗙被鍨?, type: 1 },
  { field_name: '浼氬憳渚涘簲鍟?, type: 1 },
  { field_name: '渚涘簲鍟嗚瘎鍒?, type: 2, ui_type: 'Number', property: { formatter: '0' } },
  { field_name: '閲囩撼寤鸿', type: 1 },
  { field_name: 'SKU鍚嶇О', type: 1 },
  { field_name: 'SKU鍥剧墖URL', type: 15, ui_type: 'Url' },
  { field_name: 'SKU鍥剧墖鐩镐技搴?, type: 2, ui_type: 'Number', property: { formatter: '0.00%' } },
  { field_name: '鍟嗗搧浠?, type: 2, ui_type: 'Number', property: { formatter: '0.00' } },
  { field_name: '杩愯垂', type: 2, ui_type: 'Number', property: { formatter: '0.00' } },
  { field_name: '閲囪喘鎴愭湰浠?, type: 2, ui_type: 'Number', property: { formatter: '0.00' } },
  { field_name: '灏哄', type: 1 },
  { field_name: '鍏嬮噸', type: 2, ui_type: 'Number', property: { formatter: '0' } },
  { field_name: '鍏嬮噸鏉ユ簮', type: 1 },
  { field_name: '鍏嬮噸缃俊搴?, type: 1 },
  { field_name: '鎻愬彇鏉ユ簮', type: 1 },
  { field_name: '1688渚涘簲鍟?, type: 1 },
  { field_name: '1688鍟嗗搧鏍囬', type: 1 },
  { field_name: '椋庨櫓澶囨敞', type: 1 },
];
const listingTableFields: FeishuCreateField[] = [
  { field_name: '鍏宠仈閿?, type: 1 },
  { field_name: '鍟嗗搧ID', type: 1 },
  { field_name: '鍘熷晢鍝侀摼鎺?, type: 15, ui_type: 'Url' },
  { field_name: '閮戝拰鏁版嵁閾炬帴', type: 15, ui_type: 'Url' },
  { field_name: '鍘熷晢鍝佷富鍥綰RL', type: 15, ui_type: 'Url' },
  { field_name: '1688閾炬帴', type: 15, ui_type: 'Url' },
  { field_name: 'offerId', type: 1 },
  { field_name: 'SKU鍚嶇О', type: 1 },
  { field_name: 'SKU鍥剧墖URL', type: 15, ui_type: 'Url' },
  { field_name: '閲囪喘鎴愭湰浠?, type: 2, ui_type: 'Number', property: { formatter: '0.00' } },
  { field_name: '鍟嗗搧浠?, type: 2, ui_type: 'Number', property: { formatter: '0.00' } },
  { field_name: '杩愯垂', type: 2, ui_type: 'Number', property: { formatter: '0.00' } },
  { field_name: '灏哄', type: 1 },
  { field_name: '鍏嬮噸', type: 2, ui_type: 'Number', property: { formatter: '0' } },
  { field_name: '渚涘簲鍟?, type: 1 },
  { field_name: '鐩镐技搴?, type: 2, ui_type: 'Number', property: { formatter: '0.00%' } },
  { field_name: '椋庨櫓澶囨敞', type: 1 },
  { field_name: '瀹℃牳鐘舵€?, type: 1 },
  { field_name: '鍒婄櫥鐘舵€?, type: 1 },
  { field_name: '閲囪喘缁戝畾鐘舵€?, type: 1 },
  { field_name: '鍟嗗搧鏍囬', type: 1 },
  { field_name: '鍥藉', type: 1 },
  { field_name: '绫荤洰', type: 1 },
  { field_name: '鏈€鍚庢洿鏂版椂闂?, type: 5, ui_type: 'DateTime' },
];
const listingAuditTableFields: FeishuCreateField[] = getListingAuditHeaders().map((fieldName) => {
  const numericFields = new Set([
    '璇勪环鏁?,
    '浣ｉ噾姣斾緥',
    '鎬婚攢閲?,
    '杩?0澶╅攢閲?,
    '杩?0澶〨MV',
    '杩?0澶╁潎浠?,
    '鍓嶇SKU浠锋牸',
    '鍓嶇SKU搴撳瓨',
    '姹囩巼鍒颁汉姘戝竵',
    '鍓嶇鍞环浜烘皯甯?,
    'SKU鍖归厤缃俊搴?,
    '鎺ㄨ崘閲囪喘浠?,
    '鎺ㄨ崘杩愯垂',
    '閲囪喘鎴愭湰浜烘皯甯?,
    '鎺ㄨ崘閲囪喘鍏嬮噸',
    '鐩镐技搴?,
    '棰勪及鍒╂鼎浜烘皯甯?,
    '棰勪及鍒╂鼎鐜?,
    '5%鍒╂鼎鏈€浣庡敭浠蜂汉姘戝竵',
  ]);
  const urlFields = new Set(['鍘熷晢鍝侀摼鎺?, '閮戝拰鏁版嵁閾炬帴', 'TikTok鍓嶇閾炬帴', '鎺ㄨ崘1688閾炬帴']);
  const isNumeric = numericFields.has(fieldName);
  const isUrl = urlFields.has(fieldName);
  return {
    field_name: fieldName,
    type: isNumeric ? 2 : isUrl ? 15 : 1,
    ui_type: isNumeric ? 'Number' : isUrl ? 'Url' : undefined,
    property: isNumeric
      ? { formatter: fieldName.includes('鐜?) || fieldName.includes('缃俊搴?) || fieldName.includes('浣ｉ噾') || fieldName.includes('鐩镐技搴?) ? '0.00%' : '0.00' }
      : undefined,
  } satisfies FeishuCreateField;
});
const publicationTableFields: FeishuCreateField[] = [
  { field_name: '鍏宠仈閿?, type: 1 },
  { field_name: '鍟嗗搧ID', type: 1 },
  { field_name: '绔欑偣', type: 1 },
  { field_name: '搴楅摵', type: 1 },
  { field_name: '搴楅摵ID', type: 1 },
  { field_name: '濡欐墜妯℃澘鍚?, type: 1 },
  { field_name: '濡欐墜鑽夌ID', type: 1 },
  { field_name: '鍏叡閲囬泦绠盜D', type: 1 },
  { field_name: 'TikTok閲囬泦绠盜D', type: 1 },
  { field_name: '瀵煎叆鎵规鍙?, type: 1 },
  { field_name: '鍒婄櫥鐘舵€?, type: 1 },
  { field_name: '澶辫触鍘熷洜', type: 1 },
  { field_name: '鍙戝竷鍓嶆鏌?, type: 1 },
  { field_name: '璧勬枡鍖呰矾寰?, type: 15, ui_type: 'Url' },
  { field_name: '鏈€鍚庢洿鏂版椂闂?, type: 5, ui_type: 'DateTime' },
];
const listingEditStatuses = [
  '寰呴噰闆?,
  '閲囬泦涓?,
  '宸查噰闆嗗叕鍏遍噰闆嗙',
  '璁ら涓?,
  '宸茶棰員ikTok閲囬泦绠?,
  '搴楅摵璁ら涓?,
  '宸茶棰嗙洰鏍囧簵閾?,
  '宸茶鍙栧鎵嬭鎯?,
  '寰呬汉宸ョ紪杈?,
  '寰呬繚瀛樿崏绋?,
  '淇濆瓨涓?,
  '鑽夌宸蹭繚瀛?,
  '鍙戝竷涓?,
  '宸叉彁浜ゅ彂甯?,
  '鍙戝竷澶辫触',
  '宸插彂甯?,
  '鍙戝竷涓緟澶嶆牳',
  '寰呯淮鎶?,
  '缁存姢涓?,
  '缁存姢宸插噯澶?,
  '闇€浜哄伐閫夋嫨搴楅摵',
  '闇€浜哄伐澶勭悊',
  '澶辫触',
] as const;
const listingEditTableFields: FeishuCreateField[] = [
  { field_name: '鍏宠仈閿?, type: 1 },
  { field_name: '鍟嗗搧ID', type: 1 },
  { field_name: '鍥藉/绔欑偣', type: 1 },
  { field_name: '姣斾环鎵规鍙?, type: 1 },
  { field_name: '琛ㄤ笁璁板綍ID', type: 1 },
  { field_name: '鍘熷晢鍝侀摼鎺?, type: 15, ui_type: 'Url' },
  { field_name: '鎺ㄨ崘1688閾炬帴', type: 15, ui_type: 'Url' },
  { field_name: 'offerId', type: 1 },
  { field_name: '閲囬泦婧愯揣婧怚D', type: 1 },
  { field_name: '閲囪喘鎬绘垚鏈?, type: 2, ui_type: 'Number', property: { formatter: '0.00' } },
  { field_name: '缁熶竴璐ф簮浠锋牸', type: 2, ui_type: 'Number', property: { formatter: '0.00' } },
  { field_name: '灞曠ず浠锋牸', type: 2, ui_type: 'Number', property: { formatter: '0.00' } },
  { field_name: '鏈湴灞曠ず浠?, type: 2, ui_type: 'Number', property: { formatter: '0.00' } },
  { field_name: '缂栬緫鏍囬', type: 1 },
  { field_name: '鍖呰９閲嶉噺g', type: 2, ui_type: 'Number', property: { formatter: '0' } },
  { field_name: '鍖呰９闀垮害cm', type: 2, ui_type: 'Number', property: { formatter: '0.00' } },
  { field_name: '鍖呰９瀹藉害cm', type: 2, ui_type: 'Number', property: { formatter: '0.00' } },
  { field_name: '鍖呰９楂樺害cm', type: 2, ui_type: 'Number', property: { formatter: '0.00' } },
  { field_name: '鐩爣搴楅摵ID', type: 1 },
  { field_name: '鐩爣搴楅摵鍚嶇О', type: 1 },
  { field_name: '鐩爣搴楅摵绔欑偣', type: 1 },
  { field_name: '鐩爣绔欑偣绫荤洰', type: 1 },
  { field_name: '鐩爣绫荤洰ID', type: 1 },
  { field_name: '濡欐墜绫荤洰璺緞', type: 1 },
  { field_name: '绫荤洰鍖归厤鐘舵€?, type: 1 },
  { field_name: '绫荤洰澶辫触鍘熷洜', type: 1 },
  { field_name: '灏虹爜琛ㄧ姸鎬?, type: 1 },
  { field_name: '缂栬緫妯″紡', type: 1 },
  { field_name: '鍏叡閲囬泦绠盜D', type: 1 },
  { field_name: 'TikTok閲囬泦绠盜D', type: 1 },
  { field_name: 'SKU鏁伴噺', type: 2, ui_type: 'Number', property: { formatter: '0' } },
  { field_name: '閲囬泦鐘舵€?, type: 3, ui_type: 'SingleSelect', property: { options: listingEditStatuses.map((name) => ({ name })) } },
  { field_name: '璁ら鐘舵€?, type: 3, ui_type: 'SingleSelect', property: { options: listingEditStatuses.map((name) => ({ name })) } },
  { field_name: '搴楅摵璁ら鐘舵€?, type: 3, ui_type: 'SingleSelect', property: { options: listingEditStatuses.map((name) => ({ name })) } },
  { field_name: '缂栬緫鐘舵€?, type: 3, ui_type: 'SingleSelect', property: { options: listingEditStatuses.map((name) => ({ name })) } },
  { field_name: '鍙戝竷鍑嗗鐘舵€?, type: 1 },
  { field_name: '鍙戝竷澶嶆牳鐘舵€?, type: 1 },
  { field_name: '鍙戝竷澶嶆牳鏃堕棿', type: 5, ui_type: 'DateTime' },
  { field_name: '濡欐墜鍙戝竷鐘舵€?, type: 1 },
  { field_name: '濡欐墜鍙戝竷浠诲姟ID', type: 1 },
  { field_name: 'TikTok鍟嗗搧ID', type: 1 },
  { field_name: '宸插彂甯冨晢鍝侀摼鎺?, type: 15, ui_type: 'Url' },
  { field_name: '缁存姢鐘舵€?, type: 1 },
  { field_name: '缁存姢澶囨敞', type: 1 },
  { field_name: '澶辫触鍘熷洜', type: 1 },
  { field_name: '鏈€鍚庢洿鏂版椂闂?, type: 5, ui_type: 'DateTime' },
];
const listingResultStatuses = [
  '寰呮墽琛?,
  '鎼滅储涓?,
  '缂栬緫涓?,
  '鍙戝竷涓?,
  '宸叉彁浜ゅ彂甯?,
  '宸插彂甯?,
  '闇€浜哄伐澶勭悊',
  '澶辫触',
] as const;
const listingResultTableFields: FeishuCreateField[] = [
  { field_name: '鍏宠仈閿?, type: 1 },
  { field_name: '鍟嗗搧ID', type: 1 },
  { field_name: '鍥藉/绔欑偣', type: 1 },
  { field_name: '琛ㄤ笁璁板綍ID', type: 1 },
  { field_name: 'AI涓婃灦缂栬緫琛ㄨ褰旾D', type: 1 },
  { field_name: 'offerId', type: 1 },
  { field_name: '璐ф簮ID', type: 1 },
  { field_name: '閲囬泦婧愯揣婧怚D', type: 1 },
  { field_name: '閲囪喘鎬绘垚鏈?, type: 2, ui_type: 'Number', property: { formatter: '0.00' } },
  { field_name: '鍏嬮噸', type: 2, ui_type: 'Number', property: { formatter: '0' } },
  { field_name: '鐩爣搴楅摵ID', type: 1 },
  { field_name: '鐩爣搴楅摵鍚嶇О', type: 1 },
  { field_name: '鐩爣绔欑偣绫荤洰', type: 1 },
  { field_name: '鐩爣绫荤洰ID', type: 1 },
  { field_name: '绫荤洰鍖归厤鐘舵€?, type: 1 },
  { field_name: '灏虹爜琛ㄧ姸鎬?, type: 1 },
  { field_name: '鍏叡閲囬泦绠盜D', type: 1 },
  { field_name: 'TikTok閲囬泦绠盜D', type: 1 },
  { field_name: '濡欐墜瀹氫环妯℃澘ID', type: 1 },
  { field_name: '濡欐墜瀹氫环妯℃澘鍚?, type: 1 },
  { field_name: '娴忚鍣ㄦā鎷熺姸鎬?, type: 3, ui_type: 'SingleSelect', property: { options: listingResultStatuses.map((name) => ({ name })) } },
  { field_name: '褰撳墠姝ラ', type: 1 },
  { field_name: '鍙戝竷缁撴灉', type: 1 },
  { field_name: '澶辫触鍘熷洜', type: 1 },
  { field_name: '澶辫触鎴浘璺緞', type: 1 },
  { field_name: '鏈€鍚庢洿鏂版椂闂?, type: 5, ui_type: 'DateTime' },
];
const purchaseTableFields: FeishuCreateField[] = [
  { field_name: '鍏宠仈閿?, type: 1 },
  { field_name: '璁㈠崟鍙?, type: 1 },
  { field_name: '鍟嗗搧ID', type: 1 },
  { field_name: 'offerId', type: 1 },
  { field_name: '1688閾炬帴', type: 15, ui_type: 'Url' },
  { field_name: 'SKU鍚嶇О', type: 1 },
  { field_name: '閲囪喘鏁伴噺', type: 2, ui_type: 'Number', property: { formatter: '0' } },
  { field_name: '閲囪喘鍗曚环', type: 2, ui_type: 'Number', property: { formatter: '0.00' } },
  { field_name: '閲囪喘杩愯垂', type: 2, ui_type: 'Number', property: { formatter: '0.00' } },
  { field_name: '璐т唬鍦板潃', type: 1 },
  { field_name: '纭鐘舵€?, type: 1 },
  { field_name: '1688璁㈠崟鍙?, type: 1 },
  { field_name: '閲囪喘鐘舵€?, type: 1 },
  { field_name: '鐗╂祦鍗曞彿', type: 1 },
  { field_name: '寮傚父澶囨敞', type: 1 },
  { field_name: '鏈€鍚庢洿鏂版椂闂?, type: 5, ui_type: 'DateTime' },
];

const numberPriceFields = new Set([
  '閲囪喘鎬绘垚鏈?,
  '閲囪喘鎬绘垚鏈?CNY',
  '閲囪喘鎬绘垚鏈紙CNY锛?,
  '閲囪喘浠?,
  '杩愯垂',
  '灞曠ず浠锋牸',
  '鏈湴灞曠ず浠?,
  '鏈湴灞曠ず浠?MYR',
  '鏈湴灞曠ず浠?鎶樺悗)(MYR)',
  '鏈湴灞曠ず浠?鍘熶环)(MYR)',
  '姹囩巼(CNY/MYR)',
  '鐩爣鍒╂鼎鐜?,
  'TK璐圭敤鍚堣鎬昏垂鐜?MYR)',
  '骞冲彴澶勭悊璐?CNY',
  '璺ㄥ鐗╂祦鎴愭湰(褰撳湴璐у竵)',
  '璐т唬璐圭敤(CNY)',
  '鎶樻墸鐜?,
  '浼樻儬鍒?MYR)',
  '鍒╂鼎(MYR)',
  '鍏朵粬璐圭敤(CNY)',
]);
const integerNumberFields = new Set(['鍏嬮噸', '鍏嬮噸锛坓锛?, '鍊欓€夊簭鍙?, '璧锋壒閲?, '骞撮攢閲?, '鏈堜唬閿€', '1688閿€閲?, '鍊欓€夋暟閲?, '鏈夋晥鍊欓€夋暟閲?]);
const urlLikeFields = new Set([
  '閮戝拰鏁版嵁閾炬帴',
  '鍘熷晢鍝侀摼鎺?,
  '鍘熷晢鍝佷富鍥綰RL',
  '1688閾炬帴',
  'SKU鍥剧墖URL',
  '鎺ㄨ崘1688閾炬帴',
]);
const checkboxFields = new Set(['浜哄伐鎸囧畾涓婃灦璐ф簮']);
const datetimeFields = new Set(['鏈€鍚庢洿鏂版椂闂?]);

const priceInputTableFields: FeishuCreateField[] = priceInputHeaders.map((fieldName) =>
  createPriceComparisonField(fieldName, {
    options:
      fieldName === '鐘舵€?
        ? [...priceInputStatuses]
        : fieldName === '澶辫触褰掑洜'
          ? [...priceInputFailureReasons]
          : fieldName === '閲嶅浣嶇疆'
            ? [...duplicateLocations]
            : undefined,
  }),
);

const priceOutputTableFields: FeishuCreateField[] = priceOutputHeaders.map((fieldName) =>
  createPriceComparisonField(fieldName, {
    options:
      fieldName === '鍟嗗搧缁勭姸鎬?
        ? [...priceOutputGroupStatuses]
        : fieldName === '鍊欓€夌姸鎬?
          ? [...priceOutputCandidateStatuses]
          : fieldName === '澶辫触褰掑洜'
            ? [...priceOutputFailureReasons]
            : undefined,
  }),
);

const priceReviewTableFields: FeishuCreateField[] = priceReviewHeaders.map((fieldName) =>
  createPriceComparisonField(fieldName, {
    options:
      fieldName === '鐘舵€?
        ? [...priceReviewStatuses]
        : fieldName === '澶辫触褰掑洜'
            ? [...priceReviewFailureReasons]
            : fieldName === '閲嶅浣嶇疆'
              ? [...duplicateLocations]
              : undefined,
  }),
);
const compatibleOutputTableFields = mergeCreateFields(outputTableFields, priceOutputTableFields);

function createPriceComparisonField(fieldName: string, options: PriceComparisonFieldOptions = {}): FeishuCreateField {
  if (checkboxFields.has(fieldName)) {
    return { field_name: fieldName, type: 7, ui_type: 'Checkbox' };
  }

  if (datetimeFields.has(fieldName)) {
    return { field_name: fieldName, type: 5, ui_type: 'DateTime' };
  }

  if (numberPriceFields.has(fieldName)) {
    return { field_name: fieldName, type: 2, ui_type: 'Number', property: { formatter: '0.00' } };
  }

  if (integerNumberFields.has(fieldName)) {
    return { field_name: fieldName, type: 2, ui_type: 'Number', property: { formatter: '0' } };
  }

  if (fieldName === '鐩镐技搴?) {
    return { field_name: fieldName, type: 2, ui_type: 'Number', property: { formatter: '0.00' } };
  }

  if (urlLikeFields.has(fieldName)) {
    return { field_name: fieldName, type: 15, ui_type: 'Url' };
  }

  if (options.options?.length) {
    const isMultiSelect = fieldName === '澶辫触褰掑洜';
    return {
      field_name: fieldName,
      type: isMultiSelect ? 4 : 3,
      ui_type: isMultiSelect ? 'MultiSelect' : 'SingleSelect',
      property: {
        options: options.options.map((name) => ({ name })),
      },
    };
  }

  if (fieldName === '澶囨敞' || fieldName === '椋庨櫓澶囨敞') {
    return { field_name: fieldName, type: 1, ui_type: 'Text' };
  }

  return { field_name: fieldName, type: 1, ui_type: 'Text' };
}

function mergeCreateFields(...fieldGroups: FeishuCreateField[][]) {
  const merged = new Map<string, FeishuCreateField>();
  for (const field of fieldGroups.flat()) {
    const key = normalizeHeaderName(field.field_name);
    if (!merged.has(key)) {
      merged.set(key, field);
    }
  }

  return [...merged.values()];
}

export type SourcingOutputRecord = {
  key: string;
  productId: string;
  sourceUrl: string;
  zhengheDataUrl: string;
  sourceImageUrl: string;
  offerUrl: string;
  offerId: string;
  skuName: string;
  skuImageUrl: string;
  purchaseCost: number | '';
  itemPrice: number | '';
  shippingFee: number | '';
  dimensions: string;
  weightGram: number | '';
  supplier: string;
  similarity: number | '';
  riskNote: string;
  title: string;
  country: string;
  category: string;
  targetSiteCategory: string;
  status: string;
  rank: number;
};

export type ListingProductRecord = SourcingOutputRecord & {
  reviewStatus: string;
  publicationStatus: string;
  purchaseBindingStatus: string;
};

type PriceReviewRecord = {
  recordId: string;
  productId: string;
  site: string;
  status: string;
  batchId: string;
  sourceUrl: string;
  offerUrl: string;
  offerId: string;
  collectSourceItemId: string;
  purchaseCost: number | '';
  displayPrice: number | '';
  weightGram: number | '';
  dimensions: string;
  targetSiteCategory: string;
};

export type ListingEditRecord = {
  recordId: string;
  key: string;
  productId: string;
  reviewRecordId: string;
  batchId: string;
  offerId: string;
  collectSourceItemId: string;
  site: string;
  sourceUrl: string;
  offerUrl: string;
  purchaseCost: number | '';
  unifiedSourcePrice: number | '';
  displayPrice: number | '';
  editTitle: string;
  weightGram: number | '';
  lengthCm: number | '';
  widthCm: number | '';
  heightCm: number | '';
  targetShopId: string;
  targetShopName: string;
  targetShopSite: string;
  targetCategoryId: string;
  targetSiteCategory: string;
  miaoshouCategoryPath: string;
  categoryMatchStatus: string;
  categoryFailureReason: string;
  sizeChartStatus: string;
  editModel: string;
  commonCollectBoxId: string;
  tiktokCollectBoxId: string;
  skuCount: number | '';
  collectStatus: string;
  claimStatus: string;
  shopClaimStatus: string;
  editStatus: string;
  publishReadyStatus: string;
  publishVerifyStatus: string;
  miaoshouPublishStatus: string;
  miaoshouPublishTaskId: string;
  tiktokProductId: string;
  publishedProductUrl: string;
  maintenanceStatus: string;
  maintenanceNote: string;
  failureReason: string;
};

type RankedSkuMatch = NonNullable<ProductItem['skuMatches']>[number] & {
  rank: number;
};

type OutputRow = {
  item: ProductItem;
  match?: RankedSkuMatch;
  candidate?: NonNullable<ProductItem['candidates']>[number];
  rank?: number;
  groupStatus?: string;
  candidateStatus?: string;
};

type PriceOutputRow = {
  recordId: string;
  productId: string;
  site: string;
  groupStatus: string;
  candidateStatus: string;
  purchaseCost: number | '';
  weightGram: number | '';
  dimensions: string;
  manuallySelected: boolean;
  batchId: string;
  inputRecordId: string;
  candidateRank: number | '';
  offerUrl: string;
  offerId: string;
  skuName: string;
  skuImageUrl: string;
  itemPrice: number | '';
  shippingFee: number | '';
  supplier: string;
  similarity: number | '';
  minimumOrderQuantity: number | '';
  annualSalesVolume: number | '';
  monthlyDistributionVolume: number | '';
  salesVolume: number | '';
  salesText: string;
  salesRiskNote: string;
  riskNote: string;
  failureReason: string;
  zhengheDataUrl: string;
  sourceUrl: string;
  sourceImageUrl: string;
  targetSiteCategory: string;
};

type PriceOutputGroup = {
  key: string;
  productId: string;
  site: string;
  rows: PriceOutputRow[];
};

type ListingShippingFormula = {
  site: string;
  currency: string;
  type: 'firstWeight' | 'fixed';
  firstWeightGram: number;
  firstFee: number;
  stepGram: number;
  stepFee: number;
  fixedFee: number;
  minFee: number | '';
  maxFee: number | '';
};

type ReviewRecommendation = {
  success: boolean;
  values: Record<string, unknown>;
};

type OutputColumn = {
  names: string[];
  getter: (row: OutputRow) => string | number;
};

const baseOutputColumns: OutputColumn[] = [
  { names: ['鍟嗗搧ID', '鍘熷晢鍝両D', '浜у搧ID', 'Product ID'], getter: ({ item }) => item.productId },
  { names: ['鍘熷晢鍝侀摼鎺?, '鍟嗗搧閾炬帴', '鍟嗗搧URL', '鍘熼摼鎺?], getter: ({ item }) => item.sourceUrl ?? '' },
  { names: ['閮戝拰鏁版嵁閾炬帴', '閮戝拰閾炬帴', '閮戝拰鍟嗗搧閾炬帴'], getter: ({ item }) => item.zhengheDataUrl ?? '' },
  { names: ['鐘舵€?, '鍘熼摼鎺ョ姸鎬?], getter: ({ item }) => getRealtimeRowStatus(item) },
  { names: ['鍘熷晢鍝佹爣棰?, '鍟嗗搧鏍囬', '鏍囬', '鍝佸悕'], getter: ({ item }) => item.title ?? '' },
  { names: ['鍥藉/绔欑偣', '鍥藉', '绔欑偣', '甯傚満'], getter: ({ item }) => item.country ?? '' },
  { names: ['绫荤洰', '鍒嗙被'], getter: ({ item }) => item.category ?? '' },
  { names: ['鍘熷晢鍝佷富鍥綰RL', '涓诲浘URL', '鍟嗗搧涓诲浘', '鍥剧墖URL'], getter: ({ item }) => item.sourceImageUrl ?? item.imageUrl ?? '' },
  { names: ['鍘熷晢鍝佷富鍥炬湰鍦拌矾寰?, '涓诲浘鏈湴璺緞'], getter: ({ item }) => item.localImagePath ?? '' },
  { names: ['鎼滃浘鐘舵€?, '澶勭悊鐘舵€?], getter: ({ item }) => getSelectionRowStatus(item) },
  { names: ['椋庨櫓澶囨敞', '椋庨櫓鏍囪', '澶囨敞', '澶辫触鍘熷洜'], getter: (row) => getRiskNoteForOutputRow(row) },
];

const summaryOutputColumns: OutputColumn[] = [
  { names: ['1688鍊欓€夋暟', '鍊欓€夋暟', '璐ф簮鏁?], getter: ({ item }) => item.candidates?.length ?? 0 },
  { names: ['鎺ㄨ崘1688閾炬帴1', '鎺ㄨ崘璐ф簮閾炬帴1', '璐ф簮閾炬帴1'], getter: ({ item }) => getTopPriceMatches(item, 3)[0]?.offerUrl ?? item.candidates?.[0]?.offerUrl ?? '' },
  { names: ['鎺ㄨ崘1688閾炬帴2', '鎺ㄨ崘璐ф簮閾炬帴2', '璐ф簮閾炬帴2'], getter: ({ item }) => getTopPriceMatches(item, 3)[1]?.offerUrl ?? item.candidates?.[1]?.offerUrl ?? '' },
  { names: ['鎺ㄨ崘1688閾炬帴3', '鎺ㄨ崘璐ф簮閾炬帴3', '璐ф簮閾炬帴3'], getter: ({ item }) => getTopPriceMatches(item, 3)[2]?.offerUrl ?? item.candidates?.[2]?.offerUrl ?? '' },
  { names: ['鍖归厤SKU', 'SKU鍚嶇О', 'SKU'], getter: ({ item }) => getBestPriceMatch(item)?.skuName ?? '' },
  { names: ['閲囪喘鎴愭湰浠?, '閲囪喘鎴愭湰', '鎴愭湰浠?], getter: ({ item }) => getBestPriceMatch(item)?.purchaseCost ?? '' },
  { names: ['鍟嗗搧浠?, '鍟嗗搧浠锋牸', '璐ф簮浠锋牸'], getter: ({ item }) => getBestPriceMatch(item)?.itemPrice ?? '' },
  { names: ['杩愯垂', '棰勪及杩愯垂'], getter: ({ item }) => getBestPriceMatch(item)?.shippingFee ?? '' },
  { names: ['灏哄', '瑙勬牸灏哄'], getter: ({ item }) => getBestPriceMatch(item)?.dimensions ?? '' },
  { names: ['鍏嬮噸', '鍏嬮噸g', '閲嶉噺g', '閲嶉噺'], getter: ({ item }) => getBestPriceMatch(item)?.weightGram ?? '' },
  { names: ['鍏嬮噸缃俊搴?, '閲嶉噺缃俊搴?], getter: ({ item }) => getBestPriceMatch(item)?.weightConfidence ?? '' },
  { names: ['SKU鍥剧墖鐩镐技搴?, 'SKU鐩镐技搴?, '鐩镐技搴?], getter: ({ item }) => getBestPriceMatch(item)?.skuImageSimilarity ?? '' },
  { names: ['SKU鍥剧墖URL'], getter: ({ item }) => getBestPriceMatch(item)?.skuImageUrl ?? '' },
  { names: ['渚涘簲鍟嗚瘎鍒?, '璐ф簮璇勫垎'], getter: ({ item }) => item.candidates?.[0]?.score ?? '' },
  { names: ['1688渚涘簲鍟?, '渚涘簲鍟?, '璐ф簮渚涘簲鍟?], getter: ({ item }) => findCandidateByOfferId(item, getBestPriceMatch(item)?.offerId ?? '')?.supplier ?? '' },
  { names: ['1688鍟嗗搧鏍囬', '璐ф簮鏍囬'], getter: ({ item }) => findCandidateByOfferId(item, getBestPriceMatch(item)?.offerId ?? '')?.title ?? '' },
];

const candidateOutputColumns: OutputColumn[] = [
  { names: ['鍊欓€夊簭鍙?, '鎺ㄨ崘鎺掑悕', '璐ф簮鎺掑悕', '鎺掑悕'], getter: ({ match, rank }) => match?.rank ?? rank ?? '' },
  { names: ['1688閾炬帴', '璐ф簮閾炬帴', '1688璐ф簮閾炬帴', '鎺ㄨ崘1688閾炬帴'], getter: ({ match, candidate }) => match?.offerUrl ?? candidate?.offerUrl ?? '' },
  { names: ['offerId', 'Offer ID', '璐ф簮ID'], getter: ({ match, candidate }) => match?.offerId ?? candidate?.offerId ?? '' },
  { names: ['1688涓诲浘URL', '鍊欓€夊浘鐗嘦RL', '璐ф簮涓诲浘URL'], getter: ({ candidate }) => candidate?.coverImageUrl ?? '' },
  { names: ['鍒楄〃鍥剧墖鐩镐技搴?, '鍒楄〃鐩镐技搴?], getter: ({ candidate }) => candidate?.listImageSimilarity ?? '' },
  { names: ['1688鍊欓€夋暟', '鍊欓€夋暟', '璐ф簮鏁?], getter: ({ item }) => item.candidates?.length ?? 0 },
  { names: ['渚涘簲鍟嗙被鍨?, '璐ф簮绫诲瀷'], getter: ({ candidate }) => candidate?.supplierType ?? '' },
  { names: ['浼氬憳渚涘簲鍟?, '鏄惁浼氬憳渚涘簲鍟?, '浼氬憳'], getter: ({ candidate }) => (candidate ? (candidate.member ? '鏄? : '鍚?) : '') },
  { names: ['渚涘簲鍟嗚瘎鍒?, '璐ф簮璇勫垎'], getter: ({ candidate }) => candidate?.score ?? '' },
  { names: ['閲囩撼寤鸿', '寤鸿'], getter: ({ candidate }) => candidate?.suggestion ?? '' },
  { names: ['SKU鍚嶇О', '鍖归厤SKU', 'SKU'], getter: ({ match }) => match?.skuName ?? '' },
  { names: ['SKU鍥剧墖URL'], getter: ({ match }) => match?.skuImageUrl ?? '' },
  { names: ['SKU鍥剧墖鐩镐技搴?, 'SKU鐩镐技搴?, '鐩镐技搴?], getter: ({ match }) => match?.skuImageSimilarity ?? '' },
  { names: ['閲囪喘浠?, '鍟嗗搧浠?, '鍟嗗搧浠锋牸', '璐ф簮浠锋牸'], getter: ({ match }) => match?.itemPrice ?? '' },
  { names: ['杩愯垂', '棰勪及杩愯垂'], getter: ({ match }) => match?.shippingFee ?? '' },
  { names: ['閲囪喘鎬绘垚鏈?, '閲囪喘鎴愭湰浠?, '閲囪喘鎴愭湰', '鎴愭湰浠?], getter: ({ match }) => match?.purchaseCost ?? '' },
  { names: ['灏哄', '瑙勬牸灏哄'], getter: ({ match }) => match?.dimensions ?? '' },
  { names: ['鍏嬮噸', '鍏嬮噸g', '閲嶉噺g', '閲嶉噺'], getter: ({ match }) => match?.weightGram ?? '' },
  { names: ['璧锋壒閲?, '鏈€灏忚捣璁㈤噺'], getter: ({ match }) => match?.quantity ?? '' },
  { names: ['骞撮攢閲?], getter: ({ candidate }) => candidate?.annualSalesVolume ?? '' },
  { names: ['鏈堜唬閿€'], getter: ({ candidate }) => candidate?.monthlyDistributionVolume ?? '' },
  { names: ['1688閿€閲?, '閿€閲?], getter: ({ candidate }) => candidate?.salesVolume ?? '' },
  { names: ['1688閿€閲忔枃鏈?, '閿€閲忔枃鏈?], getter: ({ candidate }) => candidate?.salesText ?? '' },
  { names: ['閿€閲忛闄╁娉?], getter: ({ candidate }) => candidate?.salesRiskNote ?? '' },
  { names: ['鍏嬮噸鏉ユ簮', '閲嶉噺鏉ユ簮'], getter: ({ match }) => match?.weightSource ?? '' },
  { names: ['鍏嬮噸缃俊搴?, '閲嶉噺缃俊搴?], getter: ({ match }) => match?.weightConfidence ?? '' },
  { names: ['鎻愬彇鏉ユ簮'], getter: ({ match }) => match?.extractionSource ?? '' },
  { names: ['1688渚涘簲鍟?, '渚涘簲鍟?, '璐ф簮渚涘簲鍟?], getter: ({ candidate }) => candidate?.supplier ?? '' },
  { names: ['1688鍟嗗搧鏍囬', '璐ф簮鏍囬'], getter: ({ candidate }) => candidate?.title ?? '' },
];

export class FeishuBitableClient {
  private accessToken = '';
  private accessTokenExpiresAt = 0;
  private readonly baseUrl: string;

  constructor(private readonly options: FeishuBitableClientOptions) {
    this.baseUrl = options.baseUrl ?? feishuApiBaseUrl;
  }

  async ensureTaskTables(input: EnsureTaskTablesInput): Promise<EnsureTaskTablesResult> {
    const inputBitable = await this.ensureTable({
      bitable: input.inputBitable,
      tableName: inputTableName,
      fields: inputTableFields,
    });
    const outputBitable = await this.ensureTable({
      bitable: input.outputBitable,
      tableName: outputTableName,
      fields: compatibleOutputTableFields,
    });

    return { inputBitable, outputBitable };
  }

  async ensurePriceComparisonTables(input: EnsurePriceComparisonTablesInput): Promise<PriceComparisonTablesResult> {
    const appToken = input.appToken.trim();
    if (!appToken) {
      throw new Error('椋炰功澶氱淮琛ㄦ牸 app_token 蹇呭～');
    }

    const inputBitable = await this.ensureTable({
      bitable: normalizeBitableForApp(input.inputBitable, appToken),
      tableName: priceInputTableName,
      fields: priceInputTableFields,
      strictTypes: true,
    });
    const outputBitable = await this.ensureTable({
      bitable: normalizeBitableForApp(input.outputBitable, appToken),
      tableName: priceOutputTableName,
      fields: priceOutputTableFields,
      strictTypes: true,
    });
    const reviewBitable = await this.ensureTable({
      bitable: normalizeBitableForApp(input.reviewBitable, appToken),
      tableName: priceReviewTableName,
      fields: priceReviewTableFields,
      strictTypes: true,
    });

    return { inputBitable, outputBitable, reviewBitable };
  }

  async generatePriceComparisonReviewTable(
    input: EnsurePriceComparisonTablesInput & PriceComparisonReviewGenerationInput,
  ): Promise<PriceComparisonReviewGenerationResult> {
    const tables = await this.ensurePriceComparisonTables(input);
    const inputFields = await this.listFields(tables.inputBitable);
    const outputFields = await this.listFields(tables.outputBitable);
    const reviewFields = await this.listFields(tables.reviewBitable);
    const inputRecords = await this.searchRecordsWithoutView(tables.inputBitable);
    const outputRecords = await this.searchRecordsWithoutView(tables.outputBitable);
    const reviewRecords = await this.searchRecordsWithoutView(tables.reviewBitable);
    const inputContextByRecordId = buildInputContextByRecordId(inputFields, inputRecords);
    const reviewRecordByKey = new Map(
      reviewRecords
        .map((record) => [buildProductSiteKey(
          readTextByCandidates(reviewFields, record, ['鍟嗗搧ID']),
          readTextByCandidates(reviewFields, record, ['鍥藉/绔欑偣', '鍥藉', '绔欑偣']),
        ), record] as const)
        .filter(([key]) => Boolean(key)),
    );
    const groups = groupPriceOutputRecords(outputFields, outputRecords, inputContextByRecordId);
    const targetBatchId = input.batchId?.trim();
    const targetGroups = [...groups.values()]
      .map((group) => ({ ...group, rows: getLatestBatchRows(group.rows) }))
      .filter((group) => !targetBatchId || group.rows.some((row) => row.batchId === targetBatchId))
      .filter((group) =>
        group.rows.some((row) => row.groupStatus === '宸叉牳瀹? || row.groupStatus === '寰呮洿鏂拌〃涓?)
        && group.rows.some((row) => row.candidateStatus !== '澶辫触'),
      );
    let generatedCount = 0;
    let failedCount = 0;

    for (const group of targetGroups) {
      await this.syncOutputGroupStatus(tables.outputBitable, outputFields, group);
      const reviewResult = buildReviewRecommendation(group.rows, input.weightToleranceGram ?? 5);
      const existingRecord = reviewRecordByKey.get(buildProductSiteKey(group.productId, group.site));
      const fieldsToWrite = buildFieldsByNames(reviewFields, {
        ...reviewResult.values,
        鐘舵€? reviewResult.success ? '寰呮牳瀹? : '澶辫触',
        鏈€鍚庢洿鏂版椂闂? Date.now(),
      });
      if (reviewResult.success) {
        const failureReasonField = pickField(reviewFields, ['澶辫触褰掑洜', '澶辫触鍘熷洜']);
        const failureReasonFieldName = failureReasonField ? getFeishuFieldName(failureReasonField) : '';
        if (failureReasonFieldName) {
          fieldsToWrite[failureReasonFieldName] = failureReasonField?.type === 4 ? [] : '';
        }
      }

      if (existingRecord) {
        await this.updateRecordFields(tables.reviewBitable, existingRecord.record_id, fieldsToWrite);
      } else {
        await this.batchCreateRecords(tables.reviewBitable, [{ fields: fieldsToWrite }]);
      }

      if (reviewResult.success) {
        generatedCount += 1;
      } else {
        failedCount += 1;
      }
    }

    return {
      ...tables,
      scannedGroupCount: targetGroups.length,
      generatedCount,
      failedCount,
    };
  }

  async confirmLatestPriceBatchAndGenerateReviewTable(
    input: EnsurePriceComparisonTablesInput & PriceComparisonReviewGenerationInput,
  ): Promise<PriceComparisonReviewGenerationResult & { batchId: string; verifiedOutputCount: number }> {
    const tables = await this.ensurePriceComparisonTables(input);
    const outputFields = await this.listFields(tables.outputBitable);
    const outputRecords = await this.searchRecordsWithoutView(tables.outputBitable);
    const outputRows = outputRecords.map((record) => readPriceOutputRow(outputFields, record));
    const batchId = input.batchId?.trim() || getLatestSuccessfulOutputBatchId(outputRows);
    if (!batchId) {
      throw new Error('杈撳嚭璐ф簮琛ㄦ病鏈夊彲纭鐨勬垚鍔熸瘮浠锋壒娆°€傝鍏堝畬鎴愪竴娆℃瘮浠峰苟鍐欏叆琛ㄤ簩銆?);
    }

    const statusField = pickField(outputFields, ['鍟嗗搧缁勭姸鎬?]);
    if (!statusField) {
      throw new Error('杈撳嚭璐ф簮琛ㄧ己灏戙€屽晢鍝佺粍鐘舵€併€嶅瓧娈碉紝鏃犳硶纭鎵规銆?);
    }

    const statusFieldName = getFeishuFieldName(statusField);
    let verifiedOutputCount = 0;
    for (const row of outputRows) {
      if (row.batchId !== batchId || row.candidateStatus === '澶辫触') {
        continue;
      }
      if (row.groupStatus !== '宸叉牳瀹?) {
        await this.updateRecordFields(tables.outputBitable, row.recordId, {
          [statusFieldName]: normalizeValueForField('宸叉牳瀹?, statusField),
        });
      }
      verifiedOutputCount += 1;
    }

    const generationResult = await this.generatePriceComparisonReviewTable({
      ...input,
      ...tables,
      batchId,
    });
    return {
      ...generationResult,
      batchId,
      verifiedOutputCount,
    };
  }

  async approveLatestReviewBatch(
    input: EnsurePriceComparisonTablesInput & PriceComparisonReviewGenerationInput,
  ): Promise<{ batchId: string; approvedReviewCount: number }> {
    const tables = await this.ensurePriceComparisonTables(input);
    const reviewFields = await this.listFields(tables.reviewBitable);
    const reviewRecords = await this.searchRecordsWithoutView(tables.reviewBitable);
    const reviewRows = reviewRecords.map((record) => readPriceReviewRecord(reviewFields, record));
    const batchId = input.batchId?.trim() || getLatestSuccessfulReviewBatchId(reviewRows);
    if (!batchId) {
      throw new Error('寰呬汉宸ユ牳瀹炰笂鏋惰〃娌℃湁鍙‘璁ょ殑鏈€鏂版壒娆★紝璇峰厛瀹屾垚姣斾环骞剁敓鎴愯〃涓夈€?);
    }

    const statusField = pickField(reviewFields, ['鐘舵€?]);
    if (!statusField) {
      throw new Error('寰呬汉宸ユ牳瀹炰笂鏋惰〃缂哄皯銆岀姸鎬併€嶅瓧娈碉紝鏃犳硶纭杩涘叆涓婃灦銆?);
    }

    const statusFieldName = getFeishuFieldName(statusField);
    let approvedReviewCount = 0;
    for (const row of reviewRows) {
      if (row.batchId !== batchId || row.status === '澶辫触') {
        continue;
      }
      if (row.status !== '宸插鏍?) {
        await this.updateRecordFields(tables.reviewBitable, row.recordId, {
          [statusFieldName]: normalizeValueForField('宸插鏍?, statusField),
        });
      }
      approvedReviewCount += 1;
    }

    return { batchId, approvedReviewCount };
  }

  async syncListingPricingConfigToReviewTable(
    input: EnsurePriceComparisonTablesInput & CommerceListingPricingSyncInput,
  ): Promise<CommerceListingPricingSyncResult> {
    const tables = await this.ensurePriceComparisonTables(input);
    const fields = await this.listFields(tables.reviewBitable);
    const records = await this.searchRecords(tables.reviewBitable);
    const targetSite = normalizeSite(input.site);
    const values: Record<string, unknown> = {};

    if (typeof input.exchangeRate === 'number' && Number.isFinite(input.exchangeRate)) {
      values.姹囩巼 = input.exchangeRate;
      values['姹囩巼(CNY/MYR)'] = input.exchangeRate;
    }
    if (typeof input.targetProfitRate === 'number' && Number.isFinite(input.targetProfitRate)) {
      values.鐩爣鍒╂鼎鐜?= input.targetProfitRate;
    }
    if (typeof input.discountRate === 'number' && Number.isFinite(input.discountRate)) {
      values.鎶樻墸鐜?= input.discountRate;
    }
    if (typeof input.tkFeeRate === 'number' && Number.isFinite(input.tkFeeRate)) {
      values.TK璐圭敤鍚堣鎬昏垂鐜?= input.tkFeeRate;
      values['TK璐圭敤鍚堣鎬昏垂鐜?MYR)'] = input.tkFeeRate;
    }

    const basePatch = buildFieldsByNames(fields, values);
    const formulas = parseListingShippingFormulaConfig(input.shippingFormulas ?? '');
    const shippingFormula = targetSite ? formulas.get(targetSite) : undefined;
    if (Object.keys(basePatch).length === 0 && !shippingFormula) {
      return {
        reviewBitable: tables.reviewBitable,
        scannedCount: records.length,
        updatedCount: 0,
        skippedCount: records.length,
      };
    }

    let updatedCount = 0;
    let skippedCount = 0;
    for (const record of records) {
      const rowSite = normalizeSite(readTextByCandidates(fields, record, ['鍥藉/绔欑偣', '鍥藉', '绔欑偣', '甯傚満']));
      if (targetSite && rowSite !== targetSite) {
        skippedCount += 1;
        continue;
      }
      const patch = { ...basePatch };
      const weightGram = readNumberByCandidates(fields, record, ['鍏嬮噸锛坓锛?, '鍏嬮噸', '閲嶉噺g', '鍖呰９閲嶉噺g']);
      const shippingCost = typeof weightGram === 'number' && shippingFormula
        ? calculateListingShippingCost(weightGram, shippingFormula)
        : '';
      if (typeof shippingCost === 'number') {
        Object.assign(patch, buildFirstWritableFieldByNames(fields, [
          '璺ㄥ鐗╂祦鎴愭湰(褰撳湴璐у竵)',
        ], shippingCost));
      }
      if (Object.keys(patch).length === 0) {
        skippedCount += 1;
        continue;
      }
      await this.updateRecordFields(tables.reviewBitable, record.record_id, patch);
      updatedCount += 1;
    }

    return {
      reviewBitable: tables.reviewBitable,
      scannedCount: records.length,
      updatedCount,
      skippedCount,
    };
  }

  async ensureCommerceTables(input: EnsureCommerceTablesInput): Promise<CommerceTablesResult> {
    if ((input as { allowLegacyCommerceTables?: boolean }).allowLegacyCommerceTables !== true) {
      throw new Error('鏃т笂鏋?閲囪喘鍥涜〃閾捐矾宸插仠鐢紱褰撳墠鍙厑璁镐娇鐢?杈撳叆琛ㄣ€佽緭鍑鸿揣婧愯〃銆佸緟浜哄伐鏍稿疄涓婃灦琛ㄣ€丄I涓婃灦缂栬緫琛ㄣ€?);
    }

    const appToken = input.appToken.trim();
    if (!appToken) {
      throw new Error('椋炰功澶氱淮琛ㄦ牸 app_token 蹇呭～');
    }

    const listingBitable = await this.ensureTable({
      bitable: normalizeBitableForApp(input.listingBitable, appToken),
      tableName: listingTableName,
      fields: listingTableFields,
    });
    const publicationBitable = await this.ensureTable({
      bitable: normalizeBitableForApp(input.publicationBitable, appToken),
      tableName: publicationTableName,
      fields: publicationTableFields,
    });
    const listingAuditBitable = await this.ensureTable({
      bitable: normalizeBitableForApp(undefined, appToken),
      tableName: listingAuditTableName,
      fields: listingAuditTableFields,
    });
    const purchaseBitable = await this.ensureTable({
      bitable: normalizeBitableForApp(input.purchaseBitable, appToken),
      tableName: purchaseTableName,
      fields: purchaseTableFields,
    });

    return { listingBitable, listingAuditBitable, publicationBitable, purchaseBitable };
  }

  async ensureListingResultTable(input: EnsureListingResultTableInput) {
    const appToken = input.appToken.trim();
    if (!appToken) {
      throw new Error('AI涓婃灦缁撴灉琛?app_token 蹇呭～');
    }

    const listingResultBitable = await this.ensureTable({
      bitable: normalizeBitableForApp(input.listingResultBitable, appToken),
      tableName: listingResultTableName,
      fields: listingResultTableFields,
    });

    return { listingResultBitable };
  }

  async generateMiaoshouListingEditTable(input: GenerateMiaoshouListingEditTableInput): Promise<CommerceListingEditResult> {
    const listingEditBitable = await this.ensureListingEditTable(input.appToken);
    const defaultShopId = input.shopId?.trim() || input.targetShopId.trim();
    const defaultShopName = input.shopName?.trim() || input.targetShopName.trim();
    const targetCategoryId = '';
    const defaultShopSite = normalizeSite(input.site || input.targetSite);
    if (!defaultShopId && !(input.shopMappings ?? []).some((mapping) => mapping.shopId.trim())) {
      throw new Error('璇峰厛鍦ˋI涓婃灦閰嶇疆閲屽～鍐欑洰鏍囧簵閾篒D');
    }

    const reviewBitable = await this.resolvePriceReviewBitable(input);
    const reviewFields = await this.listFields(reviewBitable);
    const reviewRecords = await this.searchRecords(reviewBitable);
    const reviewBatchId = input.batchId?.trim() ?? '';
    const approvedRows = reviewRecords
      .map((record) => readPriceReviewRecord(reviewFields, record))
      .filter((row) => row.status === '宸插鏍?)
      .filter((row) => !reviewBatchId || row.batchId === reviewBatchId)
      .slice(0, getOptionalLimit(input.limit));

    const editFields = await this.listFields(listingEditBitable);
    const editRecords = await this.searchRecordsWithoutView(listingEditBitable);
    const existingByKey = new Map(
      editRecords
        .map((record) => {
          const row = readListingEditRecord(editFields, record);
          return [row.key || buildListingEditKey(row.productId, row.site, row.targetShopId), record] as const;
        })
        .filter(([key]) => Boolean(key)),
    );

    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const reviewRow of approvedRows) {
      const sourceSite = normalizeSite(reviewRow.site);
      const site = defaultShopSite || sourceSite;
      const targetShop = resolveListingTargetShop({
        site,
        defaultShopId,
        defaultShopName,
        defaultShopSite,
        mappings: input.shopMappings,
      });
      const key = buildListingEditKey(reviewRow.productId, targetShop.site || site || sourceSite, targetShop.shopId);
      if (!key) {
        failedCount += 1;
        await this.upsertListingEditFailure({
          listingEditBitable,
          editFields,
          existingRecord: key ? existingByKey.get(key) : undefined,
          reviewRow,
          key,
          targetShopId: targetShop.shopId,
          targetShopName: targetShop.shopName,
          targetShopSite: targetShop.site,
          targetCategoryId,
          reason: '鍟嗗搧ID銆佸浗瀹?绔欑偣鎴栫洰鏍囧簵閾篒D缂哄け',
        });
        continue;
      }

      const existingRecord = existingByKey.get(key);
      const existingRow = existingRecord ? readListingEditRecord(editFields, existingRecord) : null;
      if (input.retryFailedOnly && !isListingEditRetryCandidate(existingRow)) {
        skippedCount += 1;
        continue;
      }

      const baseValues = buildListingEditBaseValues(reviewRow, {
        key,
        targetShopId: targetShop.shopId,
        targetShopName: targetShop.shopName,
        targetShopSite: targetShop.site,
        targetCategoryId,
        existingRow,
      });

      const collectUrl = getReviewCollectUrl(reviewRow);
      if (!collectUrl) {
        failedCount += 1;
        await this.writeListingEditStatus(listingEditBitable, editFields, existingRecord, {
          ...baseValues,
          缂栬緫鐘舵€? '闇€浜哄伐澶勭悊',
          閲囬泦鐘舵€? '澶辫触',
          澶辫触鍘熷洜: '缂哄皯閲囬泦閾炬帴锛氬師鍟嗗搧閾炬帴鍜?688閾炬帴鍧囦负绌?,
        });
        continue;
      }

      try {
        const currentRecord = existingRecord ?? await this.createListingEditRecord(listingEditBitable, editFields, baseValues);
        if (!existingRecord) {
          createdCount += 1;
          existingByKey.set(key, currentRecord);
        }

        if (existingRecord && existingRow && isListingEditLockedStatus(existingRow.editStatus)) {
          await this.writeListingEditStatus(listingEditBitable, editFields, existingRecord, {
          ...baseValues,
          鍏叡閲囬泦绠盜D: existingRow.commonCollectBoxId,
          TikTok閲囬泦绠盜D: existingRow.tiktokCollectBoxId,
          缂栬緫妯″紡: existingRow.editModel,
          SKU鏁伴噺: existingRow.skuCount,
          閲囬泦鐘舵€? existingRow.collectStatus,
          璁ら鐘舵€? existingRow.claimStatus,
          搴楅摵璁ら鐘舵€? existingRow.shopClaimStatus,
          缂栬緫鐘舵€? existingRow.editStatus,
          鍙戝竷鍑嗗鐘舵€? existingRow.publishReadyStatus,
          鍙戝竷澶嶆牳鐘舵€? existingRow.publishVerifyStatus,
          濡欐墜鍙戝竷鐘舵€? existingRow.miaoshouPublishStatus,
          濡欐墜鍙戝竷浠诲姟ID: existingRow.miaoshouPublishTaskId,
          TikTok鍟嗗搧ID: existingRow.tiktokProductId,
          宸插彂甯冨晢鍝侀摼鎺? existingRow.publishedProductUrl,
          缁存姢鐘舵€? existingRow.maintenanceStatus,
          缁存姢澶囨敞: existingRow.maintenanceNote,
          澶辫触鍘熷洜: existingRow.failureReason,
        });
          updatedCount += 1;
          continue;
        }

        const progressed = await this.progressListingEditRecord({
          listingEditBitable,
          editFields,
          record: currentRecord,
          reviewRow,
          key,
          targetShopId: targetShop.shopId,
          targetShopName: targetShop.shopName,
          targetShopSite: targetShop.site,
          targetCategoryId,
          importLinks: input.importLinks,
          getCommonCollectBoxDetail: input.getCommonCollectBoxDetail,
          claimToPlatform: input.claimToPlatform,
          searchTiktokCollectBox: input.searchTiktokCollectBox,
          claimToShop: input.claimToShop,
          getShopCollectItemInfo: input.getShopCollectItemInfo,
          getSiteCollectItemInfo: input.getSiteCollectItemInfo,
          getCategoryTreeBySite: input.getCategoryTreeBySite,
          getCategoryMetadata: input.getCategoryMetadata,
          saveShopCollectItemInfo: input.saveShopCollectItemInfo,
          categoryTreeCacheJson: input.categoryTreeCacheJson,
          sizeChartImageUrl: input.sizeChartImageUrl,
          requiredAttributeDefaults: input.requiredAttributeDefaults,
        });
        if (progressed) {
          updatedCount += 1;
        } else {
          failedCount += 1;
        }
      } catch (error) {
        failedCount += 1;
        await this.writeListingEditStatus(listingEditBitable, editFields, existingByKey.get(key), {
          ...baseValues,
          缂栬緫鐘舵€? '澶辫触',
          澶辫触鍘熷洜: error instanceof Error ? error.message : 'AI涓婃灦缂栬緫琛ㄧ敓鎴愬け璐?,
        });
      }
    }

    return {
      listingEditBitable,
      scannedCount: approvedRows.length,
      createdCount,
      updatedCount,
      skippedCount,
      failedCount,
      reviewBatchId,
      approvedReviewCount: 0,
    };
  }

  async prepareMiaoshouListingDraftRetry(input: PrepareMiaoshouListingDraftRetryInput): Promise<CommerceMiaoshouDraftRetryResult> {
    const listingEditBitable = await this.ensureListingEditTable(input.appToken);
    const editFields = await this.listFields(listingEditBitable);
    const editRecords = await this.searchRecords(listingEditBitable);
    const targetShopId = input.shopId?.trim() || input.targetShopId.trim();
    const hasExplicitShopFilter = Boolean(input.shopId?.trim());
    const retryableStatuses = new Set(['寰呬汉宸ョ紪杈?, '闇€浜哄伐澶勭悊', '鍙戝竷澶辫触', '澶辫触', '鑽夌宸蹭繚瀛?]);
    const rows = editRecords
      .map((record) => ({ record, row: readListingEditRecord(editFields, record) }))
      .filter(({ row }) => retryableStatuses.has(row.editStatus) || row.publishReadyStatus === '鍙戝竷澶辫触')
      .filter(({ row }) => {
        const rowShopId = row.targetShopId || targetShopId;
        return !hasExplicitShopFilter || String(rowShopId) === String(targetShopId);
      })
      .slice(0, getOptionalLimit(input.limit));

    let preparedCount = 0;
    let failedCount = 0;

    for (const { record, row } of rows) {
      const missing: string[] = [];
      const siteMismatch = getListingSiteMismatchReason(row, {
        targetShopId,
        targetSite: input.site || input.targetSite || row.targetShopSite || row.site,
      });
      if (siteMismatch) {
        missing.push(siteMismatch);
      }
      if (!row.tiktokCollectBoxId) {
        missing.push('TikTok閲囬泦绠盜D');
      }
      if (typeof row.unifiedSourcePrice !== 'number' || row.unifiedSourcePrice <= 0) {
        missing.push('缁熶竴璐ф簮浠锋牸');
      }
      if (typeof row.displayPrice !== 'number' || row.displayPrice <= 0) {
        missing.push('鏈湴灞曠ず浠?);
      }
      if (typeof row.weightGram !== 'number' || row.weightGram <= 0) {
        missing.push('鍖呰９閲嶉噺g');
      }

      if (missing.length > 0) {
        failedCount += 1;
        await this.updateRecordFields(
          listingEditBitable,
          record.record_id,
          buildFieldsByNames(editFields, {
            缂栬緫鐘舵€? '闇€浜哄伐澶勭悊',
            鍙戝竷鍑嗗鐘舵€? missing.includes('鏈湴灞曠ず浠?) ? '浠锋牸寮傚父' : '璧勬枡缂哄け',
            澶辫触鍘熷洜: `璇峰厛淇锛?{missing.join('銆?)}`,
            鏈€鍚庢洿鏂版椂闂? Date.now(),
          }),
        );
        continue;
      }

      await this.updateRecordFields(
        listingEditBitable,
        record.record_id,
        buildFieldsByNamesAllowEmpty(editFields, {
          缂栬緫鐘舵€? '寰呬繚瀛樿崏绋?,
          鍙戝竷鍑嗗鐘舵€? '寰呴噸鏂颁繚瀛?,
          澶辫触鍘熷洜: '',
          鏈€鍚庢洿鏂版椂闂? Date.now(),
        }, ['澶辫触鍘熷洜']),
      );
      preparedCount += 1;
    }

    return {
      listingEditBitable,
      scannedCount: editRecords.length,
      preparedCount,
      skippedCount: editRecords.length - rows.length,
      failedCount,
    };
  }

  async saveMiaoshouListingDrafts(input: SaveMiaoshouListingDraftsInput): Promise<CommerceMiaoshouDraftSaveResult> {
    const listingEditBitable = await this.ensureListingEditTable(input.appToken);
    const editFields = await this.listFields(listingEditBitable);
    const editRecords = await this.searchRecords(listingEditBitable);
    const targetShopId = input.shopId?.trim() || input.targetShopId.trim();
    const hasExplicitShopFilter = Boolean(input.shopId?.trim());
    const rows = editRecords
      .map((record) => ({ record, row: readListingEditRecord(editFields, record) }))
      .filter(({ row }) => row.editStatus === '寰呬繚瀛樿崏绋?)
      .filter(({ row }) => {
        const rowShopId = row.targetShopId || targetShopId;
        return !hasExplicitShopFilter || String(rowShopId) === String(targetShopId);
      })
      .slice(0, getOptionalLimit(input.limit));
    let savedCount = 0;
    let failedCount = 0;

    for (const { record, row } of rows) {
      try {
        await this.updateRecordFields(
          listingEditBitable,
          record.record_id,
          buildFieldsByNamesAllowEmpty(editFields, {
            缂栬緫鐘舵€? '淇濆瓨涓?,
            澶辫触鍘熷洜: '',
            鏈€鍚庢洿鏂版椂闂? Date.now(),
          }, ['澶辫触鍘熷洜']),
        );
        const shopId = row.targetShopId || targetShopId;
        if (!shopId) {
          throw new Error('鐩爣搴楅摵ID涓虹┖');
        }
        if (!row.tiktokCollectBoxId) {
          throw new Error('TikTok閲囬泦绠盜D涓虹┖');
        }
        if (typeof row.weightGram !== 'number' || row.weightGram <= 0) {
          throw new Error('鍖呰９閲嶉噺g缂哄け');
        }
        if (typeof row.unifiedSourcePrice !== 'number' || row.unifiedSourcePrice <= 0) {
          throw new Error('缁熶竴璐ф簮浠锋牸缂哄け');
        }
        const shopSite = normalizeSite(row.targetShopSite || input.targetSite || row.site);
        const siteMismatch = getListingSiteMismatchReason(row, {
          targetShopId,
          targetSite: shopSite,
        });
        if (siteMismatch) {
          throw new Error(siteMismatch);
        }

        const detailPayload = await pollMiaoshouEditablePayloadWithCategory({
          detailId: row.tiktokCollectBoxId,
          shopId,
          site: shopSite,
          preferredMode: row.editModel,
          getShopCollectItemInfo: input.getShopCollectItemInfo,
          getSiteCollectItemInfo: input.getSiteCollectItemInfo,
        });
        const { ossMd5 } = detailPayload;
        const shopCollectItemInfo = detailPayload.itemInfo;
        if (!ossMd5) {
          throw new Error('濡欐墜璇︽儏鏈繑鍥瀘ssMd5');
        }
        if (!shopCollectItemInfo || typeof shopCollectItemInfo !== 'object') {
          throw new Error('濡欐墜璇︽儏鏈繑鍥炲簵閾烘ā寮忓晢鍝佷俊鎭?);
        }

        const nextInfo = clonePlainObject(shopCollectItemInfo);
        applyListingEditToShopInfo(nextInfo, row);
        if (!hasMiaoshouCategory(nextInfo)) {
          throw new Error('濡欐墜鏈嚜鍔ㄥ尮閰嶇被鐩紝鍙兘鏄洰鏍囧簵閾烘湭寮€閫氳绫荤洰鎴朤ikTok绫荤洰闄愬埗锛涜浜哄伐澶勭悊璇ュ晢鍝?);
        }
        if (detailPayload.mode === 'site') {
          await input.saveSiteCollectItemInfo({
            detailId: row.tiktokCollectBoxId,
            site: shopSite,
            ossMd5,
            siteCollectItemInfo: nextInfo,
          });
        } else {
          await input.saveShopCollectItemInfo({
            detailId: row.tiktokCollectBoxId,
            shopId,
            ossMd5,
            shopCollectItemInfo: nextInfo,
          });
        }

        const verifyPayload = await readMiaoshouEditablePayload({
          detailId: row.tiktokCollectBoxId,
          shopId,
          site: shopSite,
          preferredMode: detailPayload.mode,
          getShopCollectItemInfo: input.getShopCollectItemInfo,
          getSiteCollectItemInfo: input.getSiteCollectItemInfo,
        });
        const verifyFailures = verifySavedShopInfo(verifyPayload.itemInfo, row);
        if (verifyFailures.length > 0) {
          throw new Error(`淇濆瓨鍚庢牎楠屼笉涓€鑷达細${verifyFailures.join('銆?)}`);
        }

        await this.updateRecordFields(
          listingEditBitable,
          record.record_id,
          buildFieldsByNamesAllowEmpty(editFields, {
            缂栬緫鐘舵€? '鑽夌宸蹭繚瀛?,
            鍙戝竷鍑嗗鐘舵€? getListingPublishReadyStatus(row),
            澶辫触鍘熷洜: getListingPublishReadyFailureReason(),
            鏈€鍚庢洿鏂版椂闂? Date.now(),
          }, ['澶辫触鍘熷洜']),
        );
        savedCount += 1;
      } catch (error) {
        failedCount += 1;
        await this.updateRecordFields(
          listingEditBitable,
          record.record_id,
          buildFieldsByNames(editFields, {
            缂栬緫鐘舵€? '闇€浜哄伐澶勭悊',
            澶辫触鍘熷洜: error instanceof Error ? error.message : '淇濆瓨濡欐墜鑽夌澶辫触',
            鏈€鍚庢洿鏂版椂闂? Date.now(),
          }),
        );
      }
    }

    return {
      listingEditBitable,
      scannedCount: editRecords.length,
      savedCount,
      skippedCount: editRecords.length - rows.length,
      failedCount,
    };
  }

  async publishMiaoshouListingProducts(input: PublishMiaoshouListingProductsInput): Promise<CommerceMiaoshouPublishResult> {
    if (input.confirmPublish !== true) {
      throw new Error('鍙戝竷闇€瑕佷簩娆＄‘璁?);
    }
    const listingEditBitable = await this.ensureListingEditTable(input.appToken);
    const editFields = await this.listFields(listingEditBitable);
    const editRecords = await this.searchRecords(listingEditBitable);
    const targetShopId = input.shopId?.trim() || input.targetShopId.trim();
    const hasExplicitShopFilter = Boolean(input.shopId?.trim());
    const rows = editRecords
      .map((record) => ({ record, row: readListingEditRecord(editFields, record) }))
      .filter(({ row }) => row.editStatus === '鑽夌宸蹭繚瀛?)
      .filter(({ row }) => !row.publishReadyStatus.includes('宸叉彁浜ゅ彂甯?))
      .filter(({ row }) => {
        const rowShopId = row.targetShopId || targetShopId;
        return !hasExplicitShopFilter || String(rowShopId) === String(targetShopId);
      })
      .slice(0, getOptionalLimit(input.limit));

    let publishedCount = 0;
    let failedCount = 0;

    for (const { record, row } of rows) {
      try {
        const rowShopId = row.targetShopId || targetShopId;
        const rowSite = normalizeSite(row.targetShopSite || input.site || input.targetSite || row.site);
        const rowFailures = getListingPublishReadinessFailures(row, {
          targetShopId: hasExplicitShopFilter ? targetShopId : rowShopId,
          targetSite: hasExplicitShopFilter ? input.site || input.targetSite : rowSite,
          requireDraftSaved: true,
        });
        if (rowFailures.length > 0) {
          throw new Error(`鍙戝竷鍓嶆鏌ユ湭閫氳繃锛?{rowFailures.join('銆?)}`);
        }
        if (!rowShopId) {
          throw new Error('鐩爣搴楅摵ID涓虹┖');
        }
        await this.updateRecordFields(
          listingEditBitable,
          record.record_id,
          buildFieldsByNamesAllowEmpty(editFields, {
            鍙戝竷鍑嗗鐘舵€? '鍙戝竷涓?,
            澶辫触鍘熷洜: '',
            鏈€鍚庢洿鏂版椂闂? Date.now(),
          }, ['澶辫触鍘熷洜']),
        );
        await input.publishProducts({
          detailIds: [row.tiktokCollectBoxId],
          shopIds: [rowShopId],
        });
        await this.updateRecordFields(
          listingEditBitable,
          record.record_id,
          buildFieldsByNamesAllowEmpty(editFields, {
            缂栬緫鐘舵€? '宸叉彁浜ゅ彂甯?,
            鍙戝竷鍑嗗鐘舵€? '宸叉彁浜ゅ彂甯?,
            鍙戝竷澶嶆牳鐘舵€? '寰呭鏍?,
            濡欐墜鍙戝竷鐘舵€? '',
            TikTok鍟嗗搧ID: '',
            宸插彂甯冨晢鍝侀摼鎺? '',
            缁存姢鐘舵€? '',
            缁存姢澶囨敞: '',
            澶辫触鍘熷洜: '',
            鏈€鍚庢洿鏂版椂闂? Date.now(),
          }, ['澶辫触鍘熷洜', '濡欐墜鍙戝竷鐘舵€?, 'TikTok鍟嗗搧ID', '宸插彂甯冨晢鍝侀摼鎺?, '缁存姢鐘舵€?, '缁存姢澶囨敞']),
        );
        publishedCount += 1;
      } catch (error) {
        failedCount += 1;
        await this.updateRecordFields(
          listingEditBitable,
          record.record_id,
          buildFieldsByNames(editFields, {
            缂栬緫鐘舵€? '闇€浜哄伐澶勭悊',
            鍙戝竷鍑嗗鐘舵€? '鍙戝竷澶辫触',
            澶辫触鍘熷洜: error instanceof Error ? error.message : '濡欐墜鎻愪氦鍙戝竷澶辫触',
            鏈€鍚庢洿鏂版椂闂? Date.now(),
          }),
        );
      }
    }

    return {
      listingEditBitable,
      scannedCount: editRecords.length,
      publishedCount,
      skippedCount: editRecords.length - rows.length,
      failedCount,
    };
  }

  async publishMiaoshouListingProductsByBrowser(
    input: PublishMiaoshouListingProductsByBrowserInput,
  ): Promise<CommerceMiaoshouBrowserPublishResult> {
    const listingEditBitable = await this.ensureListingEditTable(input.appToken);
    const listingResultBitable = await this.ensureListingResultTable({
      appToken: input.appToken,
      listingResultBitable: input.listingResultBitable,
    }).then((result) => result.listingResultBitable);
    const editFields = await this.listFields(listingEditBitable);
    const resultFields = await this.listFields(listingResultBitable);
    const editRecords = await this.searchRecords(listingEditBitable);
    const editableRows = editRecords
      .map((record) => ({ record, row: readListingEditRecord(editFields, record) }))
      .filter(({ row }) => !input.batchId || row.batchId === input.batchId)
      .filter(({ row }) => !input.failedOnly || isBrowserPublishRetryCandidate(row));
    const rows: typeof editableRows = [];
    let preflightFailedCount = 0;
    for (const item of editableRows) {
      const failureReason = getBrowserPublishPreflightFailure(item.row, {
        hasPricingTemplate: Boolean(input.hasPricingTemplate?.(item.row)),
      });
      if (failureReason) {
        if (isBrowserPublishPreflightReportable(item.row)) {
          preflightFailedCount += 1;
          await this.updateRecordFields(
            listingEditBitable,
            item.record.record_id,
            buildFieldsByNames(editFields, {
              缂栬緫鐘舵€? '闇€浜哄伐澶勭悊',
              鍙戝竷鍑嗗鐘舵€? '璧勬枡缂哄け',
              澶辫触鍘熷洜: failureReason,
              鏈€鍚庢洿鏂版椂闂? Date.now(),
            }),
          );
        }
        continue;
      }
      rows.push(item);
    }
    const limitedRows = rows
      .slice(0, getOptionalLimit(input.limit));

    let executedCount = 0;
    let failedCount = preflightFailedCount;

    for (const { record, row } of limitedRows) {
      await this.updateRecordFields(
        listingEditBitable,
        record.record_id,
        buildFieldsByNamesAllowEmpty(editFields, {
          缂栬緫鐘舵€? '鍙戝竷涓?,
          鍙戝竷鍑嗗鐘舵€? '娴忚鍣ㄦā鎷熷彂甯冧腑',
          澶辫触鍘熷洜: '',
          鏈€鍚庢洿鏂版椂闂? Date.now(),
        }, ['澶辫触鍘熷洜']),
      );

      const result = await input.publishByBrowser(row).catch((error) => ({
        status: 'failed' as const,
        currentStep: '娴忚鍣ㄦā鎷熷紓甯?,
        publishResult: '',
        failureReason: error instanceof Error ? error.message : String(error),
        screenshotPath: '',
        template: undefined,
      }));
      const status = result.status === 'success' ? '宸叉彁浜ゅ彂甯? : '闇€浜哄伐澶勭悊';
      await this.writeListingBrowserResultRecord({
        listingResultBitable,
        resultFields,
        row,
        editRecordId: record.record_id,
        browserResult: result,
      });

      if (result.status === 'success') {
        executedCount += 1;
        await this.updateRecordFields(
          listingEditBitable,
          record.record_id,
          buildFieldsByNamesAllowEmpty(editFields, {
            缂栬緫鐘舵€? status,
            鍙戝竷鍑嗗鐘舵€? '宸叉彁浜ゅ彂甯?,
            鍙戝竷澶嶆牳鐘舵€? '寰呭鏍?,
            濡欐墜鍙戝竷鐘舵€? result.publishResult || '娴忚鍣ㄥ凡鐐瑰嚮淇濆瓨骞跺彂甯?,
            澶辫触鍘熷洜: '',
            鏈€鍚庢洿鏂版椂闂? Date.now(),
          }, ['澶辫触鍘熷洜']),
        );
      } else {
        failedCount += 1;
        await this.updateRecordFields(
          listingEditBitable,
          record.record_id,
          buildFieldsByNames(editFields, {
            缂栬緫鐘舵€? status,
            鍙戝竷鍑嗗鐘舵€? result.currentStep || '娴忚鍣ㄦā鎷熷け璐?,
            澶辫触鍘熷洜: result.failureReason || '娴忚鍣ㄦā鎷熶繚瀛樺苟鍙戝竷澶辫触',
            鏈€鍚庢洿鏂版椂闂? Date.now(),
          }),
        );
      }
    }

    return {
      listingEditBitable,
      listingResultBitable,
      scannedCount: editRecords.length,
      executedCount,
      skippedCount: editRecords.length - limitedRows.length - preflightFailedCount,
      failedCount,
    };
  }

  async verifyMiaoshouPublishResults(input: VerifyMiaoshouPublishResultsInput): Promise<CommerceMiaoshouPublishVerifyResult> {
    const listingEditBitable = await this.ensureListingEditTable(input.appToken);
    const editFields = await this.listFields(listingEditBitable);
    const editRecords = await this.searchRecords(listingEditBitable);
    const targetShopId = input.shopId?.trim() || input.targetShopId.trim();
    const targetSite = normalizeSite(input.site || input.targetSite);
    const hasExplicitShopFilter = Boolean(input.shopId?.trim());
    const hasExplicitSiteFilter = Boolean(input.site?.trim());
    const rows = editRecords
      .map((record) => ({ record, row: readListingEditRecord(editFields, record) }))
      .filter(({ row }) => {
        const rowShopId = row.targetShopId || targetShopId;
        const rowSite = normalizeSite(row.targetShopSite || row.site || targetSite);
        return (
          (row.editStatus === '宸叉彁浜ゅ彂甯? || row.publishReadyStatus.includes('宸叉彁浜ゅ彂甯?) || Boolean(row.publishVerifyStatus)) &&
          (!hasExplicitShopFilter || String(rowShopId) === String(targetShopId)) &&
          (!hasExplicitSiteFilter || rowSite === targetSite)
        );
      })
      .slice(0, getOptionalLimit(input.limit));

    let verifiedCount = 0;
    let publishedCount = 0;
    let pendingCount = 0;
    let notFoundCount = 0;
    let failedCount = 0;

    for (const { record, row } of rows) {
      try {
        const result = await resolveMiaoshouPublishStatus({
          row,
          searchTiktokCollectBox: input.searchTiktokCollectBox,
        });
        const isPublished = result.publishVerifyStatus === '宸插彂甯?;
        const isPending = ['鍙戝竷涓?, '鍙戝竷涓緟澶嶆牳', '鏈彂甯?].includes(result.publishVerifyStatus);
        await this.updateRecordFields(
          listingEditBitable,
          record.record_id,
          buildFieldsByNamesAllowEmpty(editFields, {
            缂栬緫鐘舵€? row.editStatus,
            鍙戝竷澶嶆牳鐘舵€? result.publishVerifyStatus,
            鍙戝竷澶嶆牳鏃堕棿: Date.now(),
            濡欐墜鍙戝竷鐘舵€? result.miaoshouPublishStatus,
            濡欐墜鍙戝竷浠诲姟ID: result.miaoshouPublishTaskId,
            TikTok鍟嗗搧ID: result.tiktokProductId,
            宸插彂甯冨晢鍝侀摼鎺? result.publishedProductUrl,
            缁存姢鐘舵€? isPublished ? row.maintenanceStatus || '鍙淮鎶? : row.maintenanceStatus,
            缁存姢澶囨敞: isPublished ? row.maintenanceNote || '鍙戝竷澶嶆牳宸茬‘璁わ紝鍙繘鍏ュ凡鍙戝竷缁存姢鍏ュ彛' : row.maintenanceNote,
            澶辫触鍘熷洜: result.failureReason,
            鏈€鍚庢洿鏂版椂闂? Date.now(),
          }, ['澶辫触鍘熷洜', 'TikTok鍟嗗搧ID', '宸插彂甯冨晢鍝侀摼鎺?, '缁存姢鐘舵€?, '缁存姢澶囨敞']),
        );
        verifiedCount += 1;
        if (isPublished) {
          publishedCount += 1;
        } else if (isPending) {
          pendingCount += 1;
        } else {
          notFoundCount += 1;
        }
      } catch (error) {
        failedCount += 1;
        await this.updateRecordFields(
          listingEditBitable,
          record.record_id,
          buildFieldsByNames(editFields, {
            鍙戝竷澶嶆牳鐘舵€? '澶嶆牳澶辫触',
            鍙戝竷澶嶆牳鏃堕棿: Date.now(),
            澶辫触鍘熷洜: error instanceof Error ? error.message : '鍙戝竷缁撴灉澶嶆牳澶辫触',
            鏈€鍚庢洿鏂版椂闂? Date.now(),
          }),
        );
      }
    }

    return {
      listingEditBitable,
      scannedCount: editRecords.length,
      verifiedCount,
      publishedCount,
      pendingCount,
      notFoundCount,
      failedCount,
    };
  }

  async preparePublishedListingMaintenance(input: PreparePublishedListingMaintenanceInput): Promise<CommercePublishedMaintenanceResult> {
    const listingEditBitable = await this.ensureListingEditTable(input.appToken);
    const editFields = await this.listFields(listingEditBitable);
    const editRecords = await this.searchRecords(listingEditBitable);
    const rows = editRecords
      .map((record) => ({ record, row: readListingEditRecord(editFields, record) }))
      .filter(({ row }) => row.publishVerifyStatus === '宸插彂甯? || row.editStatus === '宸插彂甯?)
      .slice(0, getOptionalLimit(input.limit));

    let preparedCount = 0;
    let failedCount = 0;

    for (const { record, row } of rows) {
      const missing = [
        ...(!row.tiktokCollectBoxId ? ['TikTok閲囬泦绠盜D'] : []),
        ...(!row.targetShopId ? ['鐩爣搴楅摵ID'] : []),
        ...(!row.targetShopSite ? ['鐩爣搴楅摵绔欑偣'] : []),
      ];
      if (missing.length > 0) {
        failedCount += 1;
        await this.updateRecordFields(
          listingEditBitable,
          record.record_id,
          buildFieldsByNames(editFields, {
            缁存姢鐘舵€? '闇€浜哄伐澶勭悊',
            缁存姢澶囨敞: `宸插彂甯冪淮鎶ょ己灏戯細${missing.join('銆?)}`,
            鏈€鍚庢洿鏂版椂闂? Date.now(),
          }),
        );
        continue;
      }

      await this.updateRecordFields(
        listingEditBitable,
        record.record_id,
        buildFieldsByNamesAllowEmpty(editFields, {
          缁存姢鐘舵€? '寰呯淮鎶?,
          缁存姢澶囨敞: '宸插彂甯冪淮鎶ゅ叆鍙ｅ凡鍑嗗锛涘悗缁彧鍏佽瀹夊叏瀛楁鏀逛环銆佹敼閲嶉噺銆佹敼灏哄锛屼繚瀛樺墠閲嶆柊璇诲彇濡欐墜璇︽儏',
          鏈€鍚庢洿鏂版椂闂? Date.now(),
        }, ['缁存姢澶囨敞']),
      );
      preparedCount += 1;
    }

    return {
      listingEditBitable,
      scannedCount: editRecords.length,
      preparedCount,
      skippedCount: editRecords.length - rows.length,
      failedCount,
    };
  }

  async syncListingProducts(input: SyncListingProductsInput) {
    const tables = await this.ensureCommerceTables(input);
    const outputRows = await this.readSourcingOutputRows(input.outputBitable);
    const listingFields = await this.listFields(tables.listingBitable);
    const existingRows = await this.searchRecords(tables.listingBitable);
    const existingKeys = new Set(
      existingRows
        .map((record) => fieldValueToText(record.fields[getFieldNameByCandidates(listingFields, ['鍏宠仈閿?])]))
        .filter(Boolean),
    );

    const records = outputRows
      .filter((row) => row.status === '鎴愬姛' || row.status === '宸插畬鎴?)
      .filter((row) => row.offerUrl && row.offerId && row.skuName)
      .filter((row) => !existingKeys.has(row.key))
      .map((row) => ({
        fields: this.buildListingProductFields(listingFields, row),
      }))
      .filter((record) => Object.keys(record.fields).length > 0);

    for (let index = 0; index < records.length; index += 500) {
      await this.batchCreateRecords(tables.listingBitable, records.slice(index, index + 500));
    }

    return {
      ...tables,
      scannedCount: outputRows.length,
      createdCount: records.length,
      skippedCount: outputRows.length - records.length,
    };
  }

  async generateListingAudit(input: GenerateListingAuditInput) {
    const tables = await this.ensureCommerceTables(input);
    const sourcingRows = await this.readSourcingOutputRows(input.outputBitable);
    const auditRows = await buildListingAuditRows({
      sourcingRows,
      zhengheClient: input.zhengheClient,
      exchangeRates: input.exchangeRates ?? '',
      targetProfitRate: input.targetProfitRate ?? 0.05,
    });
    const fields = await this.listFields(tables.listingAuditBitable);
    const existingRecords = await this.searchRecords(tables.listingAuditBitable);
    const keyFieldName = getFieldNameByCandidates(fields, ['瀹℃牳閿?]);
    const existingByKey = new Map(
      existingRecords
        .map((record) => [fieldValueToText(record.fields[keyFieldName]), record.record_id] as const)
        .filter(([key]) => Boolean(key)),
    );
    let auditedCount = 0;
    for (const row of auditRows) {
      const fieldsToWrite = buildFieldsByNames(fields, listingAuditRowToChineseFields(row));
      const existingRecordId = existingByKey.get(row.auditKey);
      if (existingRecordId) {
        await this.updateRecordFields(tables.listingAuditBitable, existingRecordId, fieldsToWrite);
      } else {
        await this.batchCreateRecords(tables.listingAuditBitable, [{ fields: fieldsToWrite }]);
      }
      auditedCount += 1;
    }

    if (input.outputExcelPath) {
      await writeListingAuditExcel(input.outputExcelPath, auditRows);
    }

    return {
      ...tables,
      scannedCount: sourcingRows.length,
      auditedCount,
      skippedCount: Math.max(0, sourcingRows.length - auditRows.length),
      unavailableCount: auditRows.filter((row) => row.listingStatus === '涓嶅彲涓婃灦' || row.listingStatus === '璧勬枡缂哄け').length,
      outputExcelPath: input.outputExcelPath,
    };
  }

  async exportMiaoshouListingPackage(input: ExportMiaoshouListingInput) {
    const tables = await this.ensureCommerceTables(input);
    const listingRows = await this.readListingProducts(tables.listingBitable);
    const exportableRows = listingRows.filter((row) => row.reviewStatus === '宸查€氳繃' || row.reviewStatus === '寰呭鏍?);
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('濡欐墜涓婃灦璧勬枡');
    const headers = [
      '鍟嗗搧ID',
      '绔欑偣',
      '搴楅摵',
      '鍟嗗搧鏍囬',
      '鍘熷晢鍝侀摼鎺?,
      '涓诲浘URL',
      'SKU鍥剧墖URL',
      'SKU鍚嶇О',
      '1688閾炬帴',
      '閲囪喘鎴愭湰浠?,
      '鍟嗗搧浠?,
      '杩愯垂',
      '鍏嬮噸',
      '灏哄',
      '渚涘簲鍟?,
      '椋庨櫓澶囨敞',
      '濡欐墜瀹氫环妯℃澘鍚?,
      '浠撳簱',
      '鐗╂祦妯℃澘',
      '鍙戝竷鏂瑰紡',
    ];
    worksheet.columns = headers.map((header) => ({ header, key: header, width: Math.max(12, Math.min(28, header.length * 2 + 8)) }));

    for (const row of exportableRows) {
      worksheet.addRow({
        鍟嗗搧ID: row.productId,
        绔欑偣: input.site || 'TikTok Shop 璺ㄥ',
        搴楅摵: input.shopName || '',
        鍟嗗搧鏍囬: row.title,
        鍘熷晢鍝侀摼鎺? row.sourceUrl,
        涓诲浘URL: row.sourceImageUrl,
        SKU鍥剧墖URL: row.skuImageUrl,
        SKU鍚嶇О: row.skuName,
        '1688閾炬帴': row.offerUrl,
        閲囪喘鎴愭湰浠? row.purchaseCost,
        鍟嗗搧浠? row.itemPrice,
        杩愯垂: row.shippingFee,
        鍏嬮噸: row.weightGram,
        灏哄: row.dimensions,
        渚涘簲鍟? row.supplier,
        椋庨櫓澶囨敞: row.riskNote,
        濡欐墜瀹氫环妯℃澘鍚? input.pricingTemplateName ?? '',
        浠撳簱: input.warehouseName ?? '',
        鐗╂祦妯℃澘: input.logisticsTemplateName ?? '',
        鍙戝竷鏂瑰紡: '鐢熸垚濡欐墜鑽夌璧勬枡锛屼汉宸ユ鏌ュ悗鍙戝竷',
      });
    }

    await fs.mkdir(path.dirname(input.outputExcelPath), { recursive: true });
    await workbook.xlsx.writeFile(input.outputExcelPath);

    const publicationFields = await this.listFields(tables.publicationBitable);
    const batchId = `miaoshou-${Date.now()}`;
    const publicationRecords = exportableRows.map((row) => ({
      fields: this.buildPublicationFields(publicationFields, row, input, batchId),
    }));
    for (let index = 0; index < publicationRecords.length; index += 500) {
      await this.batchCreateRecords(tables.publicationBitable, publicationRecords.slice(index, index + 500));
    }

    return {
      ...tables,
      exportedCount: exportableRows.length,
      publicationTaskCount: publicationRecords.length,
      outputExcelPath: input.outputExcelPath,
    };
  }

  async importMiaoshouSourceLinks(input: ImportMiaoshouSourceLinksInput) {
    const tables = await this.ensureCommerceTables(input);
    const listingRows = await this.readListingProducts(tables.listingBitable);
    const collectSource = input.collectSource === 'offerUrl' ? 'offerUrl' : 'sourceUrl';
    const approvedRows = listingRows.filter((row) => row.reviewStatus === '宸查€氳繃' && getMiaoshouCollectUrl(row, collectSource));
    const publicationFields = await this.listFields(tables.publicationBitable);
    const batchId = `miaoshou-source-${Date.now()}`;
    let importedCount = 0;
    let failedCount = 0;

    for (const row of approvedRows) {
      const collectUrl = getMiaoshouCollectUrl(row, collectSource);
      try {
        if (!collectUrl) {
          throw new Error(collectSource === 'sourceUrl' ? '缂哄皯鍘熷晢鍝侀摼鎺ワ紝鏃犳硶瀵煎叆濡欐墜閲囬泦绠? : '缂哄皯1688閾炬帴锛屾棤娉曞鍏ュ鎵嬮噰闆嗙');
        }
        const mapping = await input.importLinks([collectUrl]);
        const detailId = Object.values(mapping)[0];
        await this.batchCreateRecords(tables.publicationBitable, [
          {
            fields: this.buildMiaoshouApiPublicationFields(publicationFields, row, {
              batchId,
              draftId: detailId ? String(detailId) : '',
              commonCollectBoxId: detailId ? String(detailId) : '',
              tiktokCollectBoxId: '',
              status: detailId ? '宸插鍏ュ叕鍏遍噰闆嗙' : '濡欐墜瀵煎叆澶辫触',
              failureReason: detailId ? '' : '濡欐墜鏈繑鍥炲叕鍏遍噰闆嗙ID',
              publishCheck: '',
            }),
          },
        ]);
        if (detailId) {
          importedCount += 1;
        } else {
          failedCount += 1;
        }
      } catch (error) {
        failedCount += 1;
        await this.batchCreateRecords(tables.publicationBitable, [
          {
            fields: this.buildMiaoshouApiPublicationFields(publicationFields, row, {
              batchId,
              draftId: '',
              commonCollectBoxId: '',
              tiktokCollectBoxId: '',
              status: '濡欐墜瀵煎叆澶辫触',
              failureReason: error instanceof Error ? error.message : '璐ф簮閲囬泦瀵煎叆澶辫触',
              publishCheck: '',
            }),
          },
        ]);
      }
    }

    return {
      ...tables,
      scannedCount: listingRows.length,
      importedCount,
      skippedCount: listingRows.length - approvedRows.length,
      failedCount,
    };
  }

  async claimMiaoshouProductsToTiktok(input: ClaimMiaoshouProductsInput) {
    const tables = await this.ensureCommerceTables(input);
    const publicationFields = await this.listFields(tables.publicationBitable);
    const publicationRecords = await this.searchRecords(tables.publicationBitable);
    const claimableRows = publicationRecords
      .map((record) => ({
        record,
        commonId: readTextByCandidates(publicationFields, record, ['鍏叡閲囬泦绠盜D', '濡欐墜鑽夌ID']),
        status: readTextByCandidates(publicationFields, record, ['鍒婄櫥鐘舵€?]),
      }))
      .filter((row) => row.commonId && !['宸茶棰嗗埌TikTok閲囬泦绠?, '宸插彂甯?].includes(row.status));

    let claimedCount = 0;
    let failedCount = 0;
    const platform = input.platform || 'tiktok';

    for (const row of claimableRows) {
      try {
        const mapping = await input.claimProducts([row.commonId], platform);
        const tiktokId = mapping[row.commonId] ?? Object.values(mapping)[0];
        await this.updateRecordFields(
          tables.publicationBitable,
          row.record.record_id,
          buildFieldsByNames(publicationFields, {
            TikTok閲囬泦绠盜D: tiktokId ? String(tiktokId) : '',
            鍒婄櫥鐘舵€? tiktokId ? '宸茶棰嗗埌TikTok閲囬泦绠? : '璁ら澶辫触',
            澶辫触鍘熷洜: tiktokId ? '' : '濡欐墜鏈繑鍥?TikTok 閲囬泦绠盜D',
            鏈€鍚庢洿鏂版椂闂? Date.now(),
          }),
        );
        if (tiktokId) {
          claimedCount += 1;
        } else {
          failedCount += 1;
        }
      } catch (error) {
        failedCount += 1;
        await this.updateRecordFields(
          tables.publicationBitable,
          row.record.record_id,
          buildFieldsByNames(publicationFields, {
            鍒婄櫥鐘舵€? '璁ら澶辫触',
            澶辫触鍘熷洜: error instanceof Error ? error.message : '璁ら鍒?TikTok 澶辫触',
            鏈€鍚庢洿鏂版椂闂? Date.now(),
          }),
        );
      }
    }

    return {
      ...tables,
      scannedCount: publicationRecords.length,
      claimedCount,
      skippedCount: publicationRecords.length - claimableRows.length,
      failedCount,
    };
  }

  async checkMiaoshouPublishReadiness(input: CheckMiaoshouPublishReadinessInput) {
    const site = input.site?.trim() ?? '';
    const shopId = input.shopId?.trim() ?? '';
    const hasExplicitShopFilter = Boolean(shopId);
    const configMissing = hasExplicitShopFilter
      ? [
          ...(!site ? ['鐩爣绔欑偣'] : []),
          ...(!shopId ? ['鐩爣搴楅摵ID'] : []),
        ]
      : [];
    const remote = hasExplicitShopFilter && configMissing.length === 0
      ? await input.checkRemote({ site, shopId })
      : { collectBoxCount: 0, warehouseCount: 0, categoryMetadataLoaded: false, missing: configMissing };

    const listingEditBitable = await this.ensureListingEditTable(input.appToken);
    const editFields = await this.listFields(listingEditBitable);
    const editRecords = await this.searchRecords(listingEditBitable);
    const rows = editRecords
      .map((record) => ({ record, row: readListingEditRecord(editFields, record) }))
      .filter(({ row }) => {
        const rowShopId = row.targetShopId || shopId;
        return !hasExplicitShopFilter || String(rowShopId) === String(shopId);
      });
    const rowFailures = rows.flatMap(({ row }) => getListingPublishReadinessFailures(row, {
      targetShopId: hasExplicitShopFilter ? shopId : '',
      targetSite: hasExplicitShopFilter ? site : '',
      requireDraftSaved: input.requireDraftSaved !== false,
    }));
    const blockingRowFailures = rowFailures.filter((failure) => failure !== alreadySubmittedPublishFailure);
    const uniqueRowFailures = [...new Set(rowFailures)];
    const readyRows = rows.filter(({ row }) => getListingPublishReadinessFailures(row, {
      targetShopId: hasExplicitShopFilter ? shopId : '',
      targetSite: hasExplicitShopFilter ? site : '',
      requireDraftSaved: input.requireDraftSaved !== false,
    }).length === 0);
    const alreadySubmittedCount = rows.filter(({ row }) => row.editStatus === '宸叉彁浜ゅ彂甯? || row.publishReadyStatus.includes('宸叉彁浜ゅ彂甯?)).length;

    return {
      ...remote,
      missing: [...new Set([...configMissing, ...remote.missing, ...uniqueRowFailures])],
      scannedCount: rows.length,
      readyCount: readyRows.length,
      alreadySubmittedCount,
      failedCount: blockingRowFailures.length,
    };
  }

  async generatePurchaseTasks(input: GeneratePurchaseTasksInput) {
    const tables = await this.ensureCommerceTables(input);
    const listingRows = await this.readListingProducts(tables.listingBitable);
    const publishedRows = listingRows.filter((row) => row.publicationStatus === '宸插彂甯? || row.publicationStatus === '鍑哄崟寰呴噰璐?);
    const purchaseFields = await this.listFields(tables.purchaseBitable);
    const existingRows = await this.searchRecords(tables.purchaseBitable);
    const existingKeys = new Set(
      existingRows
        .map((record) => fieldValueToText(record.fields[getFieldNameByCandidates(purchaseFields, ['鍏宠仈閿?])]))
        .filter(Boolean),
    );

    const records = publishedRows
      .filter((row) => !existingKeys.has(row.key))
      .map((row) => ({
        fields: this.buildPurchaseFields(purchaseFields, row, input.freightForwarderAddress ?? ''),
      }))
      .filter((record) => Object.keys(record.fields).length > 0);

    for (let index = 0; index < records.length; index += 500) {
      await this.batchCreateRecords(tables.purchaseBitable, records.slice(index, index + 500));
    }

    return {
      ...tables,
      scannedCount: publishedRows.length,
      updatedCount: records.length,
      manualCount: records.length,
    };
  }

  async createMiaoshouCollectBoxDrafts(input: CreateMiaoshouCollectBoxDraftsInput) {
    const tables = await this.ensureCommerceTables(input);
    const listingRows = await this.readListingProducts(tables.listingBitable);
    const approvedRows = listingRows.filter((row) => row.reviewStatus === '宸查€氳繃');
    const publicationFields = await this.listFields(tables.publicationBitable);
    const batchId = `miaoshou-api-${Date.now()}`;
    const stock = Math.max(1, Math.floor(Number(input.stock) || 100));
    let createdCount = 0;
    let failedCount = 0;

    for (const row of approvedRows) {
      try {
        const result = await input.createDraft(row, stock);
        await this.batchCreateRecords(tables.publicationBitable, [
          {
            fields: this.buildMiaoshouApiPublicationFields(publicationFields, row, {
              batchId,
              draftId: result.draftId ?? '',
              commonCollectBoxId: result.draftId ?? '',
              tiktokCollectBoxId: '',
              status: '濡欐墜鑽夌宸插垱寤?,
              failureReason: '',
              publishCheck: '',
            }),
          },
        ]);
        createdCount += 1;
      } catch (error) {
        failedCount += 1;
        await this.batchCreateRecords(tables.publicationBitable, [
          {
            fields: this.buildMiaoshouApiPublicationFields(publicationFields, row, {
              batchId,
              draftId: '',
              commonCollectBoxId: '',
              tiktokCollectBoxId: '',
              status: '濡欐墜瀵煎叆澶辫触',
              failureReason: error instanceof Error ? error.message : '濡欐墜 API 鍒涘缓鑽夌澶辫触',
              publishCheck: '',
            }),
          },
        ]);
      }
    }

    return {
      ...tables,
      scannedCount: listingRows.length,
      createdCount,
      skippedCount: listingRows.length - approvedRows.length,
      failedCount,
    };
  }

  async exportSelectionTableToExcel(input: ExportBitableToExcelInput) {
    const fields = await this.listFields(input.bitable);
    const records = await this.searchRecords(input.bitable);
    await this.writeSelectionRecordsToExcel(input.bitable, input.outputExcelPath, fields, records);

    return {
      recordCount: records.length,
      fieldCount: fields.length,
      outputExcelPath: input.outputExcelPath,
    };
  }

  async claimNextPendingSelectionRecord(
    bitable: FeishuBitableConfig,
    statusFilter: RowStatusFilter = 'pendingOnly',
    duplicateScope: PriceComparisonDuplicateScope = {},
  ): Promise<ClaimedSelectionRecord | null> {
    const fields = await this.listFields(bitable);
    const statusField = pickField(fields, statusFieldCandidates);
    if (!statusField) {
      throw new Error('杈撳叆琛ㄧ己灏戙€岀姸鎬併€嶅瓧娈?);
    }

    const statusFieldName = getFeishuFieldName(statusField);
    const records = await this.searchRecords(bitable);

    for (const record of records) {
      const status = fieldValueToText(record.fields[statusFieldName]);
      if (!matchesClaimStatus(status, statusFilter)) {
        continue;
      }

      const row = await this.buildSelectionRowFromRecord(bitable, fields, record);
      const preflight = await this.preflightPriceInputRecord({
        bitable,
        fields,
        record,
        row,
        duplicateScope,
        statusFilter,
      });
      if (!preflight.ok) {
        continue;
      }

      const enrichedRow = await this.buildSelectionRowFromRecord(bitable, fields, record);
      await this.updateInputRecordStatus(bitable, record.record_id, getRunningInputStatus(fields), fields);
      return {
        recordId: record.record_id,
        sourceUrl: enrichedRow.sourceUrl ?? '',
        item: enrichedRow,
      };
    }

    return null;
  }

  async exportSelectionRecordToExcel(input: ExportSelectionRecordToExcelInput) {
    const fields = await this.listFields(input.bitable);
    const records = await this.searchRecords(input.bitable);
    const record = records.find((item) => item.record_id === input.recordId);
    if (!record) {
      throw new Error(`寰呮牳瀹炶褰曚笉瀛樺湪锛?{input.recordId}`);
    }

    await this.writeSelectionRecordsToExcel(input.bitable, input.outputExcelPath, fields, [record]);

    return {
      recordCount: 1,
      fieldCount: fields.length,
      outputExcelPath: input.outputExcelPath,
    };
  }

  async updateInputRecordStatus(bitable: FeishuBitableConfig, recordId: string, status: string, knownFields?: FeishuField[]) {
    const fields = knownFields ?? await this.listFields(bitable);
    const statusField = pickField(fields, statusFieldCandidates);
    const statusFieldName = statusField ? getFeishuFieldName(statusField) : '';
    if (!statusFieldName) {
      throw new Error('杈撳叆琛ㄧ己灏戙€岀姸鎬併€嶅瓧娈?);
    }

    await this.updateRecordFields(bitable, recordId, { [statusFieldName]: status });
  }

  async markInputRecordEnteredComparison(
    bitable: FeishuBitableConfig,
    recordId: string,
    batchId: string,
    status = '宸茶繘鍏ユ瘮浠?,
  ) {
    const fields = await this.listFields(bitable);
    const patch = buildFieldsByNames(fields, {
      鐘舵€? findFieldByName(fields, '褰撳墠姣斾环鎵规鍙?) ? status : '宸插畬鎴?,
      褰撳墠姣斾环鎵规鍙? batchId,
      鏈€鍚庢洿鏂版椂闂? Date.now(),
    });
    if (Object.keys(patch).length === 0) {
      await this.updateInputRecordStatus(bitable, recordId, status, fields);
      return;
    }

    await this.updateRecordFields(bitable, recordId, patch);
  }

  async markInputRecordFailed(bitable: FeishuBitableConfig, recordId: string, message: string) {
    const fields = await this.listFields(bitable);
    const patch = buildFieldsByNames(fields, {
      鐘舵€? '澶辫触',
      澶辫触褰掑洜: normalizeInputFailureReason(message),
      澶囨敞: message,
      鏈€鍚庢洿鏂版椂闂? Date.now(),
    });
    if (Object.keys(patch).length === 0) {
      await this.updateInputRecordStatus(bitable, recordId, '澶辫触', fields);
      return;
    }

    await this.updateRecordFields(bitable, recordId, patch);
  }

  async syncInputStatusesByItems(bitable: FeishuBitableConfig, items: ProductItem[]) {
    const fields = await this.listFields(bitable);
    const statusField = pickField(fields, statusFieldCandidates);
    const sourceUrlField = pickField(fields, sourceUrlFieldCandidates);
    const productIdField = pickField(fields, ['鍟嗗搧ID', '鍘熷晢鍝両D', '浜у搧ID', 'Product ID']);
    const statusFieldName = statusField ? getFeishuFieldName(statusField) : '';
    const sourceUrlFieldName = sourceUrlField ? getFeishuFieldName(sourceUrlField) : '';
    const productIdFieldName = productIdField ? getFeishuFieldName(productIdField) : '';
    if (!statusFieldName) {
      throw new Error('杈撳叆琛ㄧ己灏戙€岀姸鎬併€嶅瓧娈?);
    }

    const records = await this.searchRecords(bitable);
    let updatedCount = 0;
    for (const item of items) {
      const targetRecord = records.find((record) => {
        const recordSourceUrl = sourceUrlFieldName ? fieldValueToText(record.fields[sourceUrlFieldName], true) : '';
        const recordProductId = productIdFieldName ? fieldValueToText(record.fields[productIdFieldName]) : '';
        return Boolean(
          (item.sourceUrl && recordSourceUrl && item.sourceUrl === recordSourceUrl) ||
            (item.productId && recordProductId && item.productId === recordProductId),
        );
      });
      if (!targetRecord) {
        continue;
      }

      await this.updateRecordFields(bitable, targetRecord.record_id, {
        [statusFieldName]: getRealtimeRowStatus(item),
      });
      updatedCount += 1;
    }

    return { updatedCount };
  }

  private async writeSelectionRecordsToExcel(
    bitable: FeishuBitableConfig,
    outputExcelPath: string,
    fields: FeishuField[],
    records: FeishuRecord[],
  ) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(selectionSheetName);
    const headers = inputColumns.map((column) => column.targetHeader);

    worksheet.columns = headers.map((header) => ({ header, key: header, width: Math.max(12, Math.min(36, header.length * 2 + 8)) }));

    for (const record of records) {
      const item = await this.buildSelectionRowFromRecord(bitable, fields, record);
      const row: Record<string, string | number> = {
        鍘熷晢鍝両D: item.productId,
        鍘熷晢鍝侀摼鎺? item.sourceUrl ?? '',
        閮戝拰鏁版嵁閾炬帴: item.zhengheDataUrl ?? '',
        鍘熷晢鍝佷富鍥綰RL: item.imageUrl ?? '',
        鍟嗗搧鏍囬: item.title ?? '',
        鍥藉: item.country ?? '',
        绫荤洰: item.category ?? '',
        鐩爣绔欑偣绫荤洰: item.targetSiteCategory ?? item.category ?? '',
      };
      worksheet.addRow(row);
    }

    await fs.mkdir(path.dirname(outputExcelPath), { recursive: true });
    await workbook.xlsx.writeFile(outputExcelPath);
  }

  private async fillDerivedInputValues(
    bitable: FeishuBitableConfig,
    fields: FeishuField[],
    record: FeishuRecord,
    row: Record<string, string | number>,
  ) {
    let sourceUrl = String(row['鍘熷晢鍝侀摼鎺?] ?? '').trim();
    const zhengheDataUrl = String(row['閮戝拰鏁版嵁閾炬帴'] ?? '').trim();
    const parsedSource = parseTikTokProductUrl(sourceUrl);
    const existingCountry = normalizeInputCountry(String(row['鍥藉'] ?? '').trim());
    const fallbackCountry = normalizeInputCountry(this.options.defaultSite ?? '');
    const parsedZhenghe = parseZhengheProductReference(zhengheDataUrl);
    const existingProductId = String(row['鍘熷晢鍝両D'] ?? '').trim();
    const zhengheProductId = parsedZhenghe.productId;
    const zhengheIdentityConflict = Boolean(
      zhengheProductId &&
        ((existingProductId && existingProductId !== zhengheProductId) ||
          (parsedSource.productId && parsedSource.productId !== zhengheProductId)),
    );
    let productId = zhengheProductId || existingProductId || parsedSource.productId;
    let country = zhengheIdentityConflict
      ? parsedZhenghe.region || parsedSource.country || existingCountry || fallbackCountry
      : parsedZhenghe.region || parsedSource.country || existingCountry || fallbackCountry;
    let imageUrl = String(row['鍘熷晢鍝佷富鍥綰RL'] ?? '').trim();
    let title = String(row['鍟嗗搧鏍囬'] ?? '').trim();
    let category = String(row['绫荤洰'] ?? '').trim();
    let targetSiteCategory = String(row['鐩爣绔欑偣绫荤洰'] ?? '').trim();
    if (zhengheIdentityConflict) {
      imageUrl = '';
    }

    const shouldEnrichFromZhenghe = Boolean(zhengheDataUrl && (!imageUrl || !country || !sourceUrl || isZhengheDetailUrl(zhengheDataUrl)));
    let shouldOverwriteZhengheFields = zhengheIdentityConflict;
    if (shouldEnrichFromZhenghe) {
      try {
        const zhengheData = await new ZhengheDataClient().fetchProductData({
          url: zhengheDataUrl,
          fallbackRegion: parsedZhenghe.region,
        });
        const zhengheRegion = normalizeInputCountry(zhengheData.region || zhengheData.metrics.region);
        if (zhengheData.metrics.baseInfoTrusted) {
          country = zhengheRegion || country;
          sourceUrl = zhengheData.productUrl || (productId && country ? buildTikTokProductUrl(productId, country) : sourceUrl);
          imageUrl = zhengheData.metrics.mainImageUrl || imageUrl;
          title = zhengheData.metrics.productName || title;
          category = zhengheData.metrics.categoryFullName || category;
        }
        if (
          !zhengheData.metrics.baseInfoTrusted &&
          imageUrl &&
          zhengheData.metrics.mainImageUrl &&
          imageUrl.trim() === zhengheData.metrics.mainImageUrl.trim()
        ) {
          imageUrl = '';
          row['鍘熷晢鍝佷富鍥綰RL'] = '';
        }
        if (!country && zhengheRegion) {
          country = zhengheRegion;
        }
        productId ||= zhengheData.sourceProductId;
        shouldOverwriteZhengheFields = zhengheData.metrics.baseInfoTrusted || zhengheIdentityConflict || Boolean(zhengheRegion);
      } catch {
        // Zhenghe enrichment is best-effort; the row can still be processed if required fields exist.
      }
    }

    const sourceRegionConflicts = parsedSource.country && country && parsedSource.country.toLowerCase() !== country.toLowerCase();
    if ((!sourceUrl || sourceRegionConflicts || zhengheIdentityConflict) && productId && country) {
      sourceUrl = buildTikTokProductUrl(productId, country);
    }

    const patch: Record<string, unknown> = {};
    setDerivedRowValue(fields, row, patch, productIdFieldCandidates, '鍘熷晢鍝両D', productId, shouldOverwriteZhengheFields);
    setDerivedRowValue(fields, row, patch, sourceUrlFieldCandidates, '鍘熷晢鍝侀摼鎺?, sourceUrl, shouldOverwriteZhengheFields);
    setDerivedRowValue(fields, row, patch, imageUrlFieldCandidates, '鍘熷晢鍝佷富鍥綰RL', imageUrl, shouldOverwriteZhengheFields);
    setDerivedRowValue(fields, row, patch, titleFieldCandidates, '鍟嗗搧鏍囬', title, shouldOverwriteZhengheFields);
    setDerivedRowValue(fields, row, patch, countryFieldCandidates, '鍥藉', country, shouldOverwriteZhengheFields);
    setDerivedRowValue(fields, row, patch, categoryFieldCandidates, '绫荤洰', category, shouldOverwriteZhengheFields);
    targetSiteCategory ||= category;
    setDerivedRowValue(fields, row, patch, targetSiteCategoryFieldCandidates, '鐩爣绔欑偣绫荤洰', targetSiteCategory, shouldOverwriteZhengheFields);
    row['鍘熷晢鍝両D'] = productId;
    row['鍘熷晢鍝侀摼鎺?] = sourceUrl;
    row['鍘熷晢鍝佷富鍥綰RL'] = imageUrl;
    row['鍟嗗搧鏍囬'] = title;
    row['鍥藉'] = country;
    row['绫荤洰'] = category;
    row['鐩爣绔欑偣绫荤洰'] = targetSiteCategory;

    if (Object.keys(patch).length > 0) {
      await this.updateRecordFields(bitable, record.record_id, patch);
    }
  }

  private async preflightPriceInputRecord(input: {
    bitable: FeishuBitableConfig;
    fields: FeishuField[];
    record: FeishuRecord;
    row: ProductItem;
    duplicateScope: PriceComparisonDuplicateScope;
    statusFilter: RowStatusFilter;
  }) {
    const failureReasons = getInputPreflightFailures(input.row);
    if (failureReasons.length > 0) {
      await this.markInputPreflightFailure(input.bitable, input.fields, input.record.record_id, failureReasons);
      return { ok: false };
    }

    if (input.statusFilter === 'failedOnly') {
      return { ok: true };
    }

    const duplicate = await this.findDuplicatePriceInput(input);
    if (duplicate) {
      await this.markInputDuplicate(input.bitable, input.fields, input.record.record_id, duplicate);
      return { ok: false };
    }

    return { ok: true };
  }

  private async findDuplicatePriceInput(input: {
    bitable: FeishuBitableConfig;
    fields: FeishuField[];
    record: FeishuRecord;
    row: ProductItem;
    duplicateScope: PriceComparisonDuplicateScope;
  }) {
    const productId = input.row.productId.trim();
    const site = input.row.country?.trim() ?? '';
    if (!productId || !site) {
      return null;
    }

    const inputDuplicate = await this.findDuplicateInTable({
      label: '琛ㄤ竴',
      bitable: input.duplicateScope.inputBitable ?? input.bitable,
      productId,
      site,
      excludedRecordId: input.record.record_id,
      validStatuses: ['寰呭鐞?, '澶勭悊涓?, '宸茶繘鍏ユ瘮浠?, '宸查噸澶?, '澶辫触', '寰呮牳瀹?, '鏍稿疄涓?, '宸插畬鎴?],
    });
    if (inputDuplicate) {
      return inputDuplicate;
    }

    const outputDuplicate = await this.findDuplicateInTable({
      label: '琛ㄤ簩',
      bitable: input.duplicateScope.outputBitable,
      productId,
      site,
      excludedInputRecordId: input.record.record_id,
      validStatuses: ['姣斾环涓?, '寰呮牳瀹?, '宸叉牳瀹?, '寰呮洿鏂拌〃涓?, '澶辫触', '鎴愬姛', '宸插畬鎴?],
    });
    if (outputDuplicate) {
      return outputDuplicate;
    }

    return this.findDuplicateInTable({
      label: '琛ㄤ笁',
      bitable: input.duplicateScope.reviewBitable,
      productId,
      site,
      excludedInputRecordId: input.record.record_id,
      validStatuses: ['鏍稿疄涓?, '寰呮牳瀹?, '宸插鏍?, '閲囬泦涓?, '閲囬泦瀹屾垚', '澶辫触'],
    });
  }

  private async findDuplicateInTable(input: {
    label: '琛ㄤ竴' | '琛ㄤ簩' | '琛ㄤ笁';
    bitable?: FeishuBitableConfig;
    productId: string;
    site: string;
    excludedRecordId?: string;
    excludedInputRecordId?: string;
    validStatuses: string[];
  }) {
    if (!input.bitable?.appToken?.trim() || !input.bitable.tableId?.trim()) {
      return null;
    }

    const fields = await this.listFields(input.bitable);
    const records = await this.searchRecordsWithoutView(input.bitable);
    for (const record of records) {
      if (record.record_id === input.excludedRecordId) {
        continue;
      }

      if (input.excludedInputRecordId) {
        const rowInputRecordId = readTextByCandidates(fields, record, ['杈撳叆琛ㄨ褰旾D']);
        if (rowInputRecordId === input.excludedInputRecordId) {
          continue;
        }
      }

      const productId = readTextByCandidates(fields, record, ['鍟嗗搧ID', '鍘熷晢鍝両D', '浜у搧ID', 'Product ID']);
      const site = readTextByCandidates(fields, record, ['鍥藉/绔欑偣', '鍥藉', '绔欑偣', '甯傚満']);
      if (buildProductSiteKey(productId, site) !== buildProductSiteKey(input.productId, input.site)) {
        continue;
      }

      const status = readTextByCandidates(fields, record, ['鐘舵€?, '鍟嗗搧缁勭姸鎬?, '鍊欓€夌姸鎬?, '鎼滃浘鐘舵€?, '澶勭悊鐘舵€?]);
      if (status && !input.validStatuses.includes(status)) {
        continue;
      }
      if (input.label === '琛ㄤ簩') {
        const offerId = readTextByCandidates(fields, record, ['offerId', 'Offer ID', '璐ф簮ID']);
        const offerUrl = readTextByCandidates(fields, record, ['1688閾炬帴', '鎺ㄨ崘1688閾炬帴', '璐ф簮閾炬帴'], true);
        const candidateStatus = readTextByCandidates(fields, record, ['鐘舵€?, '鍊欓€夌姸鎬?, '鍟嗗搧缁勭姸鎬?]);
        if (candidateStatus === '澶辫触' && !offerId && !offerUrl) {
          continue;
        }
      }

      return {
        location: input.label,
        recordId: record.record_id,
      };
    }

    return null;
  }

  private async markInputDuplicate(
    bitable: FeishuBitableConfig,
    fields: FeishuField[],
    recordId: string,
    duplicate: { location: string; recordId: string },
  ) {
    const patch = buildFieldsByNames(fields, {
      鐘舵€? '宸查噸澶?,
      澶辫触褰掑洜: '鍟嗗搧宸查噸澶?,
      閲嶅浣嶇疆: duplicate.location,
      閲嶅璁板綍ID: duplicate.recordId,
      澶囨敞: `鎸?鍟嗗搧ID + 鍥藉/绔欑偣 鍛戒腑閲嶅锛?{duplicate.location} / ${duplicate.recordId}`,
      鏈€鍚庢洿鏂版椂闂? Date.now(),
    });
    await this.updateRecordFields(bitable, recordId, patch);
  }

  private async markInputPreflightFailure(
    bitable: FeishuBitableConfig,
    fields: FeishuField[],
    recordId: string,
    failureReasons: string[],
  ) {
    const patch = buildFieldsByNames(fields, {
      鐘舵€? '澶辫触',
      澶辫触褰掑洜: failureReasons,
      澶囨敞: failureReasons.join('锛?),
      鏈€鍚庢洿鏂版椂闂? Date.now(),
    });
    await this.updateRecordFields(bitable, recordId, patch);
  }

  private async buildSelectionRowFromRecord(
    bitable: FeishuBitableConfig,
    fields: FeishuField[],
    record: FeishuRecord,
  ): Promise<ProductItem> {
    const row: Record<string, string | number> = {};
    for (const column of inputColumns) {
      const field = pickField(fields, column.candidates);
      const fieldName = field ? getFeishuFieldName(field) : '';
      row[column.targetHeader] = fieldName
        ? normalizeFieldValueForExcel(
            record.fields[fieldName],
            column.targetHeader === '鍘熷晢鍝侀摼鎺? || column.targetHeader === '閮戝拰鏁版嵁閾炬帴' || column.targetHeader === '鍘熷晢鍝佷富鍥綰RL',
          )
        : '';
    }
    await this.fillDerivedInputValues(bitable, fields, record, row);
    const zhengheReference = parseZhengheProductReference(String(row['閮戝拰鏁版嵁閾炬帴'] ?? '').trim());
    const tiktokReference = parseTikTokProductUrl(String(row['鍘熷晢鍝侀摼鎺?] ?? '').trim());
    const productId =
      String(row['鍘熷晢鍝両D'] ?? '').trim() ||
      zhengheReference.productId ||
      tiktokReference.productId ||
      (String(row['鍘熷晢鍝佷富鍥綰RL'] ?? '').trim() ? `img_${record.record_id}` : '');
    const rawCountry = normalizeInputCountry(String(row['鍥藉'] ?? '').trim());
    const country =
      rawCountry ||
      zhengheReference.region ||
      tiktokReference.country ||
      normalizeInputCountry(this.options.defaultSite ?? '') ||
      '';

    return {
      rowIndex: 2,
      productId,
      sourceUrl: String(row['鍘熷晢鍝侀摼鎺?] ?? '').trim(),
      zhengheDataUrl: String(row['閮戝拰鏁版嵁閾炬帴'] ?? '').trim(),
      imageUrl: String(row['鍘熷晢鍝佷富鍥綰RL'] ?? '').trim(),
      sourceImageUrl: String(row['鍘熷晢鍝佷富鍥綰RL'] ?? '').trim(),
      title: String(row['鍟嗗搧鏍囬'] ?? '').trim(),
      country,
      category: String(row['绫荤洰'] ?? '').trim(),
      targetSiteCategory: String(row['鐩爣绔欑偣绫荤洰'] ?? '').trim(),
      status: 'pending',
    };
  }

  async writeOutputRows(input: WriteOutputRowsInput) {
    await this.ensureMissingFields(input.bitable, compatibleOutputTableFields);
    const fields = await this.listFields(input.bitable);
    const mode = shouldWriteCandidateRows(fields) ? 'candidate' : 'summary';
    const batchId = input.batchId || createComparisonBatchId();
    const candidateOutputLimit = Math.max(1, Number(input.candidateOutputLimit) || 3);
    if (input.inputRecordId) {
      await this.deletePreviousOutputRowsForInput(input.bitable, fields, input.inputRecordId, batchId);
    }
    const outputRows = mode === 'candidate'
      ? input.items.flatMap((item) => createCandidateOutputRows(item, candidateOutputLimit))
      : input.items.map((item) => {
        const candidateStatus = getSummaryOutputCandidateStatus(item);
        return {
          item,
          candidateStatus,
          groupStatus: candidateStatus === '鎴愬姛' ? '宸叉牳瀹? : '澶辫触',
        };
      });
    const writableRecords = outputRows.map((row) => ({
      fields: this.buildOutputFields(fields, row, mode, {
        batchId,
        inputRecordId: input.inputRecordId ?? '',
        candidateOutputLimit,
      }),
    }));
    const records = writableRecords.filter((record) => Object.keys(record.fields).length > 0);

    for (let index = 0; index < records.length; index += 500) {
      await this.batchCreateRecords(input.bitable, records.slice(index, index + 500));
    }

    return {
      recordCount: records.length,
      skippedCount: writableRecords.length - records.length,
    };
  }

  private buildOutputFields(
    fields: FeishuField[],
    row: OutputRow,
    mode: 'candidate' | 'summary',
    options: { batchId: string; inputRecordId: string; candidateOutputLimit: number },
  ) {
    const values: Record<string, unknown> = {};
    const candidateStatus = row.candidateStatus ?? getOutputCandidateStatus(row);
    const groupStatus = row.groupStatus ?? (candidateStatus === '鎴愬姛' ? '宸叉牳瀹? : row.item.status === 'success' ? '寰呮牳瀹? : '澶辫触');
    Object.assign(values, buildFieldsByNames(fields, {
      鍟嗗搧缁勭姸鎬? groupStatus,
      鍊欓€夌姸鎬? candidateStatus,
      姣斾环鎵规鍙? options.batchId,
      杈撳叆琛ㄨ褰旾D: options.inputRecordId,
      鍊欓€夊簭鍙? row.match?.rank ?? row.rank ?? 0,
      澶辫触褰掑洜: getOutputFailureReason(row.item),
      椋庨櫓澶囨敞: getRiskNoteForOutputRow(row),
      鏈€鍚庢洿鏂版椂闂? Date.now(),
    }));
    const columns = mode === 'candidate'
      ? [...baseOutputColumns, ...candidateOutputColumns]
      : [...baseOutputColumns, ...summaryOutputColumns];
    for (const column of columns) {
      const field = pickField(fields, column.names);
      if (!field) {
        continue;
      }

      const value = column.getter(row);
      if (value === '' || value == null) {
        continue;
      }

      const fieldName = getFeishuFieldName(field);
      if (!fieldName) {
        continue;
      }

      const normalizedValue = normalizeValueForField(value, field);
      if (normalizedValue === '' || normalizedValue == null) {
        continue;
      }

      values[fieldName] = normalizedValue;
    }

    return values;
  }

  private async readSourcingOutputRows(bitable: FeishuBitableConfig): Promise<SourcingOutputRecord[]> {
    await this.ensureMissingFields(bitable, compatibleOutputTableFields);
    const fields = await this.listFields(bitable);
    const records = await this.searchRecords(bitable);

    return records.map((record, index) => {
      const row = readOutputRecord(fields, record, index + 1);
      return {
        ...row,
        key: buildCommerceKey(row.productId, row.offerId, row.skuName),
      };
    });
  }

  private async readListingProducts(bitable: FeishuBitableConfig): Promise<ListingProductRecord[]> {
    await this.ensureMissingFields(bitable, listingTableFields);
    const fields = await this.listFields(bitable);
    const records = await this.searchRecords(bitable);

    return records.map((record, index) => {
      const row = readListingRecord(fields, record, index + 1);
      return {
        ...row,
        key: row.key || buildCommerceKey(row.productId, row.offerId, row.skuName),
      };
    });
  }

  private async ensureListingEditTable(appToken: string) {
    return this.ensureTable({
      bitable: normalizeBitableForApp(undefined, appToken),
      tableName: listingEditTableName,
      fields: listingEditTableFields,
    });
  }

  private async resolvePriceReviewBitable(input: GenerateMiaoshouListingEditTableInput) {
    const configured = normalizeBitableForApp(input.priceReviewBitable, input.appToken);
    if (configured.tableId) {
      await this.ensureMissingFields(configured, priceReviewTableFields, true);
      return configured;
    }

    return this.ensureTable({
      bitable: configured,
      tableName: priceReviewTableName,
      fields: priceReviewTableFields,
      strictTypes: true,
    });
  }

  private async upsertListingEditFailure(input: {
    listingEditBitable: FeishuBitableConfig;
    editFields: FeishuField[];
    existingRecord?: FeishuRecord;
    reviewRow: PriceReviewRecord;
    key: string;
    targetShopId: string;
    targetShopName: string;
    targetShopSite: string;
    targetCategoryId: string;
    reason: string;
  }) {
    await this.writeListingEditStatus(input.listingEditBitable, input.editFields, input.existingRecord, {
      ...buildListingEditBaseValues(input.reviewRow, {
        key: input.key,
        targetShopId: input.targetShopId,
        targetShopName: input.targetShopName,
        targetShopSite: input.targetShopSite,
        targetCategoryId: input.targetCategoryId,
      }),
      缂栬緫鐘舵€? '澶辫触',
      澶辫触鍘熷洜: input.reason,
    });
  }

  private async writeListingBrowserResultRecord(input: {
    listingResultBitable: FeishuBitableConfig;
    resultFields: FeishuField[];
    row: ListingEditRecord;
    editRecordId: string;
    browserResult: {
      status: 'success' | 'failed';
      currentStep: string;
      publishResult: string;
      failureReason: string;
      screenshotPath: string;
      template?: MiaoshouPricingTemplate;
    };
  }) {
    await this.batchCreateRecords(input.listingResultBitable, [{
      fields: buildFieldsByNames(input.resultFields, {
        鍏宠仈閿? input.row.key,
        鍟嗗搧ID: input.row.productId,
        '鍥藉/绔欑偣': input.row.site,
        琛ㄤ笁璁板綍ID: input.row.reviewRecordId,
        AI涓婃灦缂栬緫琛ㄨ褰旾D: input.editRecordId,
        offerId: input.row.offerId || extractOfferIdFromUrl(input.row.offerUrl),
        璐ф簮ID: input.row.collectSourceItemId || input.row.productId,
        閲囬泦婧愯揣婧怚D: input.row.collectSourceItemId || input.row.productId,
        閲囪喘鎬绘垚鏈? input.row.purchaseCost,
        鍏嬮噸: input.row.weightGram,
        鐩爣搴楅摵ID: input.row.targetShopId,
        鐩爣搴楅摵鍚嶇О: input.row.targetShopName,
        鐩爣绔欑偣绫荤洰: input.row.targetSiteCategory,
        鐩爣绫荤洰ID: input.row.targetCategoryId,
        绫荤洰鍖归厤鐘舵€? input.row.categoryMatchStatus,
        灏虹爜琛ㄧ姸鎬? input.row.sizeChartStatus,
        鍏叡閲囬泦绠盜D: input.row.commonCollectBoxId,
        TikTok閲囬泦绠盜D: input.row.tiktokCollectBoxId,
        濡欐墜瀹氫环妯℃澘ID: input.browserResult.template?.priceTemplateId ?? '',
        濡欐墜瀹氫环妯℃澘鍚? input.browserResult.template?.name ?? '',
        娴忚鍣ㄦā鎷熺姸鎬? input.browserResult.status === 'success' ? '宸叉彁浜ゅ彂甯? : '澶辫触',
        褰撳墠姝ラ: input.browserResult.currentStep,
        鍙戝竷缁撴灉: input.browserResult.publishResult,
        澶辫触鍘熷洜: input.browserResult.failureReason,
        澶辫触鎴浘璺緞: input.browserResult.screenshotPath,
        鏈€鍚庢洿鏂版椂闂? Date.now(),
      }),
    }]);
  }

  private async createListingEditRecord(
    listingEditBitable: FeishuBitableConfig,
    editFields: FeishuField[],
    values: Record<string, unknown>,
  ) {
    const recordKey = String(values.鍏宠仈閿??? '');
    await this.batchCreateRecords(listingEditBitable, [{ fields: buildFieldsByNames(editFields, values) }]);
    const records = await this.searchRecordsWithoutView(listingEditBitable);
    const created = records.find((record) => readTextByCandidates(editFields, record, ['鍏宠仈閿?]) === recordKey);
    if (!created) {
      throw new Error('AI涓婃灦缂栬緫琛ㄨ褰曞凡鍒涘缓锛屼絾鏈兘鎸夊叧鑱旈敭鍥炴煡');
    }
    return created;
  }

  private async writeListingEditStatus(
    listingEditBitable: FeishuBitableConfig,
    editFields: FeishuField[],
    existingRecord: FeishuRecord | undefined,
    values: Record<string, unknown>,
  ) {
    const fieldsToWrite = buildFieldsByNamesAllowEmpty(editFields, {
      ...values,
      鏈€鍚庢洿鏂版椂闂? Date.now(),
    }, ['澶辫触鍘熷洜', '鍏叡閲囬泦绠盜D', 'TikTok閲囬泦绠盜D']);
    if (existingRecord) {
      await this.updateRecordFields(listingEditBitable, existingRecord.record_id, fieldsToWrite);
      return existingRecord;
    }

    await this.batchCreateRecords(listingEditBitable, [{ fields: fieldsToWrite }]);
    const recordKey = String(values.鍏宠仈閿??? '');
    const records = await this.searchRecordsWithoutView(listingEditBitable);
    return records.find((record) => readTextByCandidates(editFields, record, ['鍏宠仈閿?]) === recordKey);
  }

  private async progressListingEditRecord(input: {
    listingEditBitable: FeishuBitableConfig;
    editFields: FeishuField[];
    record: FeishuRecord;
    reviewRow: PriceReviewRecord;
    key: string;
    targetShopId: string;
    targetShopName: string;
    targetShopSite: string;
    targetCategoryId: string;
    importLinks: (links: string[]) => Promise<Record<string, string | number>>;
    getCommonCollectBoxDetail: (detailId: string | number) => Promise<unknown>;
    claimToPlatform: (detailIds: Array<string | number>, platform: string) => Promise<Record<string, string | number>>;
    searchTiktokCollectBox: (input: { sourceItemIdKeyword?: string; pageSize?: number; status?: string }) => Promise<unknown[]>;
    claimToShop: (input: { detailIds: Array<string | number>; shopIds: Array<string | number> }) => Promise<unknown>;
    getShopCollectItemInfo: (input: { detailId: string | number; shopId: string | number }) => Promise<unknown>;
    getSiteCollectItemInfo: (input: { detailId: string | number; site: string }) => Promise<unknown>;
    getCategoryTreeBySite?: (site: string) => Promise<MiaoshouCategoryNode[]>;
    getCategoryMetadata?: (input: { site: string; cid: string; shopIds: Array<string | number> }) => Promise<unknown>;
    saveShopCollectItemInfo?: (input: {
      detailId: string | number;
      shopId: string | number;
      ossMd5: string;
      shopCollectItemInfo: unknown;
    }) => Promise<unknown>;
    categoryTreeCacheJson?: string;
    sizeChartImageUrl?: string;
    requiredAttributeDefaults?: string;
  }) {
    const existingRow = readListingEditRecord(input.editFields, input.record);
    const shouldRecollect = isStaleListingEditRecord(existingRow);
    const baseValues = buildListingEditBaseValues(input.reviewRow, {
      key: input.key,
      targetShopId: input.targetShopId,
      targetShopName: input.targetShopName,
      targetShopSite: input.targetShopSite,
      targetCategoryId: input.targetCategoryId,
      existingRow,
    });
    const targetShopSite = normalizeSite(input.targetShopSite || input.reviewRow.site);
    let commonCollectBoxId = shouldRecollect ? '' : existingRow.commonCollectBoxId;
    let tiktokCollectBoxId = shouldRecollect ? '' : existingRow.tiktokCollectBoxId;

    const collectSourceLink = async () => {
      await this.writeListingEditStatus(input.listingEditBitable, input.editFields, input.record, {
        ...baseValues,
        鍏叡閲囬泦绠盜D: '',
        TikTok閲囬泦绠盜D: '',
        璁ら鐘舵€? '寰呴噰闆?,
        搴楅摵璁ら鐘舵€? '寰呴噰闆?,
        閲囬泦鐘舵€? '閲囬泦涓?,
        缂栬緫鐘舵€? '閲囬泦涓?,
        澶辫触鍘熷洜: '',
      });
      const collectUrl = getReviewCollectUrl(input.reviewRow);
      if (!collectUrl) {
        throw new Error('缂哄皯閲囬泦閾炬帴锛氬師鍟嗗搧閾炬帴鍜?688閾炬帴鍧囦负绌?);
      }
      const mapping = await input.importLinks([collectUrl]);
      const nextCommonCollectBoxId = String(mapping[collectUrl] ?? Object.values(mapping)[0] ?? '');
      if (!nextCommonCollectBoxId) {
        throw new Error('濡欐墜鏈繑鍥炲叕鍏遍噰闆嗙ID');
      }
      await this.writeListingEditStatus(input.listingEditBitable, input.editFields, input.record, {
        ...baseValues,
        鍏叡閲囬泦绠盜D: nextCommonCollectBoxId,
        TikTok閲囬泦绠盜D: '',
        閲囬泦鐘舵€? '閲囬泦涓?,
        缂栬緫鐘舵€? '閲囬泦涓?,
        澶辫触鍘熷洜: '',
      });
      return nextCommonCollectBoxId;
    };

    const claimToTiktokCollectBox = async (currentCommonCollectBoxId: string) => {
      await this.writeListingEditStatus(input.listingEditBitable, input.editFields, input.record, {
        ...baseValues,
        鍏叡閲囬泦绠盜D: currentCommonCollectBoxId,
        閲囬泦鐘舵€? '宸查噰闆嗗叕鍏遍噰闆嗙',
        璁ら鐘舵€? '璁ら涓?,
        缂栬緫鐘舵€? '璁ら涓?,
        澶辫触鍘熷洜: '',
      });
      const mapping = await input.claimToPlatform([currentCommonCollectBoxId], 'tiktok');
      const mappedTiktokCollectBoxId = String(mapping[currentCommonCollectBoxId] ?? Object.values(mapping)[0] ?? '');
      const nextTiktokCollectBoxId = await resolveFreshTiktokCollectBoxId({
        candidateIds: [mappedTiktokCollectBoxId],
        commonCollectBoxId: currentCommonCollectBoxId,
        productId: input.reviewRow.productId,
        site: targetShopSite,
        searchTiktokCollectBox: input.searchTiktokCollectBox,
        getSiteCollectItemInfo: input.getSiteCollectItemInfo,
      });
      if (!nextTiktokCollectBoxId) {
        throw new Error('濡欐墜鏈繑鍥濼ikTok閲囬泦绠盜D');
      }
      await this.writeListingEditStatus(input.listingEditBitable, input.editFields, input.record, {
        ...baseValues,
        鍏叡閲囬泦绠盜D: currentCommonCollectBoxId,
        TikTok閲囬泦绠盜D: nextTiktokCollectBoxId,
        璁ら鐘舵€? '宸茶棰員ikTok閲囬泦绠?,
        缂栬緫鐘舵€? '宸茶棰員ikTok閲囬泦绠?,
        澶辫触鍘熷洜: '',
      });
      return nextTiktokCollectBoxId;
    };

    if (!commonCollectBoxId) {
      commonCollectBoxId = await collectSourceLink();
    }

    let commonDetail: unknown;
    try {
      commonDetail = await pollCommonCollectBoxDetail(commonCollectBoxId, input.getCommonCollectBoxDetail);
    } catch (error) {
      if (tiktokCollectBoxId && isCommonCollectBoxTimeoutError(error)) {
        commonDetail = null;
      } else
      if (!isStaleMiaoshouCollectBoxError(error)) {
        throw error;
      } else {
        commonCollectBoxId = await collectSourceLink();
        tiktokCollectBoxId = '';
        commonDetail = await pollCommonCollectBoxDetail(commonCollectBoxId, input.getCommonCollectBoxDetail);
      }
    }
    void commonDetail;
    await this.writeListingEditStatus(input.listingEditBitable, input.editFields, input.record, {
      ...baseValues,
      鍏叡閲囬泦绠盜D: commonCollectBoxId,
      閲囬泦鐘舵€? '宸查噰闆嗗叕鍏遍噰闆嗙',
      缂栬緫鐘舵€? tiktokCollectBoxId ? '宸茶棰員ikTok閲囬泦绠? : '璁ら涓?,
      澶辫触鍘熷洜: '',
    });

    if (!tiktokCollectBoxId) {
      tiktokCollectBoxId = await claimToTiktokCollectBox(commonCollectBoxId);
    }

    if (existingRow.shopClaimStatus !== '宸茶棰嗙洰鏍囧簵閾?) {
      await this.writeListingEditStatus(input.listingEditBitable, input.editFields, input.record, {
        ...baseValues,
        鍏叡閲囬泦绠盜D: commonCollectBoxId,
        TikTok閲囬泦绠盜D: tiktokCollectBoxId,
        搴楅摵璁ら鐘舵€? '搴楅摵璁ら涓?,
        缂栬緫鐘舵€? '搴楅摵璁ら涓?,
        澶辫触鍘熷洜: '',
      });
      await input.claimToShop({ detailIds: [tiktokCollectBoxId], shopIds: [input.targetShopId] });
    }

    let shopClaimVerified = await verifyMiaoshouShopClaim({
      detailId: tiktokCollectBoxId,
      productId: input.reviewRow.productId,
      commonCollectBoxId,
      targetShopId: input.targetShopId,
      searchTiktokCollectBox: input.searchTiktokCollectBox,
      getSiteCollectItemInfo: input.getSiteCollectItemInfo,
      getShopCollectItemInfo: input.getShopCollectItemInfo,
      site: targetShopSite,
    });
    if (!shopClaimVerified) {
      await this.writeListingEditStatus(input.listingEditBitable, input.editFields, input.record, {
        ...baseValues,
        鍏叡閲囬泦绠盜D: commonCollectBoxId,
        TikTok閲囬泦绠盜D: tiktokCollectBoxId,
        閲囬泦鐘舵€? '宸查噰闆嗗叕鍏遍噰闆嗙',
        璁ら鐘舵€? '宸茶棰員ikTok閲囬泦绠?,
        搴楅摵璁ら鐘舵€? '搴楅摵璁ら涓?,
        缂栬緫鐘舵€? '搴楅摵璁ら涓?,
        澶辫触鍘熷洜: '',
      });
      await input.claimToShop({ detailIds: [tiktokCollectBoxId], shopIds: [input.targetShopId] });
      shopClaimVerified = await verifyMiaoshouShopClaim({
        detailId: tiktokCollectBoxId,
        productId: input.reviewRow.productId,
        commonCollectBoxId,
        targetShopId: input.targetShopId,
        searchTiktokCollectBox: input.searchTiktokCollectBox,
        getSiteCollectItemInfo: input.getSiteCollectItemInfo,
        getShopCollectItemInfo: input.getShopCollectItemInfo,
        site: targetShopSite,
      });
    }
    if (!shopClaimVerified) {
      const reason = '濡欐墜鏈Е鍙戦鍙戝竷搴楅摵閫夋嫨锛岃鍏堝湪濡欐墜閲囬泦绠辩偣鍑烩€滈€夋嫨搴楅摵鈥濆苟閫夋嫨鐩爣搴楅摵';
      await this.writeListingEditStatus(input.listingEditBitable, input.editFields, input.record, {
        ...baseValues,
        鍏叡閲囬泦绠盜D: commonCollectBoxId,
        TikTok閲囬泦绠盜D: tiktokCollectBoxId,
        閲囬泦鐘舵€? '宸查噰闆嗗叕鍏遍噰闆嗙',
        璁ら鐘舵€? '宸茶棰員ikTok閲囬泦绠?,
        搴楅摵璁ら鐘舵€? '闇€浜哄伐閫夋嫨搴楅摵',
        缂栬緫鐘舵€? '闇€浜哄伐澶勭悊',
        澶辫触鍘熷洜: reason,
      });
      return false;
    }

    const detailPayload = await pollMiaoshouEditablePayloadWithCategory({
      detailId: tiktokCollectBoxId,
      shopId: input.targetShopId,
      site: targetShopSite,
      preferredMode: existingRow.editModel,
      getShopCollectItemInfo: input.getShopCollectItemInfo,
      getSiteCollectItemInfo: input.getSiteCollectItemInfo,
    });
    const shopCollectItemInfo = detailPayload.itemInfo;
    if (!shopCollectItemInfo || typeof shopCollectItemInfo !== 'object') {
      throw new Error('濡欐墜璇︽儏璇诲彇澶辫触');
    }
    const skuCount = countActiveSkus(shopCollectItemInfo);
    if (skuCount <= 0) {
      throw new Error('濡欐墜搴楅摵妯″紡璇︽儏鏈繑鍥炴湁鏁圫KU');
    }
    const title = extractShopTitle(shopCollectItemInfo);
    const categoryResolution = await resolveAndPersistMiaoshouCategory({
      detailId: tiktokCollectBoxId,
      shopId: input.targetShopId,
      site: targetShopSite,
      detailPayload,
      shopCollectItemInfo,
      targetSiteCategory: existingRow.targetSiteCategory || input.reviewRow.targetSiteCategory,
      weightGram: existingRow.weightGram || input.reviewRow.weightGram,
      dimensions: input.reviewRow.dimensions,
      categoryTreeCacheJson: input.categoryTreeCacheJson,
      sizeChartImageUrl: input.sizeChartImageUrl,
      requiredAttributeDefaults: input.requiredAttributeDefaults,
      getCategoryTreeBySite: input.getCategoryTreeBySite,
      getCategoryMetadata: input.getCategoryMetadata,
      saveShopCollectItemInfo: input.saveShopCollectItemInfo,
    });
    if (!categoryResolution.ok) {
      const reason = categoryResolution.failureReason || '濡欐墜鏈嚜鍔ㄥ尮閰嶇被鐩紝鍙兘鏄洰鏍囧簵閾烘湭寮€閫氳绫荤洰鎴朤ikTok绫荤洰闄愬埗锛涜浜哄伐澶勭悊璇ュ晢鍝?;
      await this.writeListingEditStatus(input.listingEditBitable, input.editFields, input.record, {
        ...baseValues,
        缂栬緫鏍囬: existingRow.editTitle || title,
        鍏叡閲囬泦绠盜D: commonCollectBoxId,
        TikTok閲囬泦绠盜D: tiktokCollectBoxId,
        鐩爣绫荤洰ID: categoryResolution.categoryId,
        濡欐墜绫荤洰璺緞: categoryResolution.categoryPath,
        绫荤洰鍖归厤鐘舵€? categoryResolution.matchStatus,
        绫荤洰澶辫触鍘熷洜: reason,
        灏虹爜琛ㄧ姸鎬? categoryResolution.sizeChartStatus,
        缂栬緫妯″紡: detailPayload.mode,
        SKU鏁伴噺: skuCount,
        閲囬泦鐘舵€? '宸查噰闆嗗叕鍏遍噰闆嗙',
        璁ら鐘舵€? '宸茶棰員ikTok閲囬泦绠?,
        搴楅摵璁ら鐘舵€? '宸茶棰嗙洰鏍囧簵閾?,
        缂栬緫鐘舵€? '闇€浜哄伐澶勭悊',
        鍙戝竷鍑嗗鐘舵€? categoryResolution.matchStatus || '绫荤洰鏈嚜鍔ㄥ尮閰?,
        澶辫触鍘熷洜: reason,
      });
      return false;
    }

    await this.writeListingEditStatus(input.listingEditBitable, input.editFields, input.record, {
      ...baseValues,
      缂栬緫鏍囬: existingRow.editTitle || title,
      鍏叡閲囬泦绠盜D: commonCollectBoxId,
      TikTok閲囬泦绠盜D: tiktokCollectBoxId,
      鐩爣绫荤洰ID: categoryResolution.categoryId,
      濡欐墜绫荤洰璺緞: categoryResolution.categoryPath,
      绫荤洰鍖归厤鐘舵€? categoryResolution.matchStatus,
      绫荤洰澶辫触鍘熷洜: '',
      灏虹爜琛ㄧ姸鎬? categoryResolution.sizeChartStatus,
      缂栬緫妯″紡: detailPayload.mode,
      SKU鏁伴噺: skuCount,
      閲囬泦鐘舵€? '宸查噰闆嗗叕鍏遍噰闆嗙',
      璁ら鐘舵€? '宸茶棰員ikTok閲囬泦绠?,
      搴楅摵璁ら鐘舵€? '宸茶棰嗙洰鏍囧簵閾?,
      缂栬緫鐘舵€? '寰呬汉宸ョ紪杈?,
      鍙戝竷鍑嗗鐘舵€? '寰呬汉宸ョ紪杈戝悗淇濆瓨',
      澶辫触鍘熷洜: '',
    });

    return true;
  }

  private buildListingProductFields(fields: FeishuField[], row: SourcingOutputRecord) {
    return buildFieldsByNames(fields, {
      鍏宠仈閿? row.key,
      鍟嗗搧ID: row.productId,
      鍘熷晢鍝侀摼鎺? row.sourceUrl,
      閮戝拰鏁版嵁閾炬帴: row.zhengheDataUrl,
      鍘熷晢鍝佷富鍥綰RL: row.sourceImageUrl,
      '1688閾炬帴': row.offerUrl,
      offerId: row.offerId,
      SKU鍚嶇О: row.skuName,
      SKU鍥剧墖URL: row.skuImageUrl,
      閲囪喘鎴愭湰浠? row.purchaseCost,
      鍟嗗搧浠? row.itemPrice,
      杩愯垂: row.shippingFee,
      灏哄: row.dimensions,
      鍏嬮噸: row.weightGram,
      渚涘簲鍟? row.supplier,
      鐩镐技搴? row.similarity,
      椋庨櫓澶囨敞: row.riskNote,
      瀹℃牳鐘舵€? '寰呭鏍?,
      鍒婄櫥鐘舵€? '寰呯敓鎴愬鎵嬭祫鏂?,
      閲囪喘缁戝畾鐘舵€? '鏈粦瀹氳鍗?,
      鍟嗗搧鏍囬: row.title,
      鍥藉: row.country,
      绫荤洰: row.category,
      鐩爣绔欑偣绫荤洰: row.targetSiteCategory || row.category,
      鏈€鍚庢洿鏂版椂闂? Date.now(),
    });
  }

  private buildPublicationFields(
    fields: FeishuField[],
    row: ListingProductRecord,
    input: ExportMiaoshouListingInput,
    batchId: string,
  ) {
    return buildFieldsByNames(fields, {
      鍏宠仈閿? row.key,
      鍟嗗搧ID: row.productId,
      绔欑偣: input.site || 'TikTok Shop 璺ㄥ',
      搴楅摵: input.shopName || '',
      濡欐墜妯℃澘鍚? input.pricingTemplateName ?? '',
      濡欐墜鑽夌ID: '',
      瀵煎叆鎵规鍙? batchId,
      鍒婄櫥鐘舵€? '宸茬敓鎴愬鎵嬭祫鏂?,
      澶辫触鍘熷洜: '',
      璧勬枡鍖呰矾寰? input.outputExcelPath,
      鏈€鍚庢洿鏂版椂闂? Date.now(),
    });
  }

  private buildMiaoshouApiPublicationFields(
    fields: FeishuField[],
    row: ListingProductRecord,
    result: {
      batchId: string;
      draftId: string;
      commonCollectBoxId: string;
      tiktokCollectBoxId: string;
      status: string;
      failureReason: string;
      publishCheck: string;
    },
  ) {
    return buildFieldsByNames(fields, {
      鍏宠仈閿? row.key,
      鍟嗗搧ID: row.productId,
      绔欑偣: 'TikTok Shop 璺ㄥ',
      搴楅摵: '',
      濡欐墜妯℃澘鍚? '濡欐墜寮€鏀惧钩鍙?API',
      濡欐墜鑽夌ID: result.draftId,
      鍏叡閲囬泦绠盜D: result.commonCollectBoxId,
      TikTok閲囬泦绠盜D: result.tiktokCollectBoxId,
      瀵煎叆鎵规鍙? result.batchId,
      鍒婄櫥鐘舵€? result.status,
      澶辫触鍘熷洜: result.failureReason,
      鍙戝竷鍓嶆鏌? result.publishCheck,
      璧勬枡鍖呰矾寰? '',
      鏈€鍚庢洿鏂版椂闂? Date.now(),
    });
  }

  private buildPurchaseFields(fields: FeishuField[], row: ListingProductRecord, freightForwarderAddress: string) {
    return buildFieldsByNames(fields, {
      鍏宠仈閿? row.key,
      璁㈠崟鍙? '',
      鍟嗗搧ID: row.productId,
      offerId: row.offerId,
      '1688閾炬帴': row.offerUrl,
      SKU鍚嶇О: row.skuName,
      閲囪喘鏁伴噺: 1,
      閲囪喘鍗曚环: row.itemPrice,
      閲囪喘杩愯垂: row.shippingFee,
      璐т唬鍦板潃: freightForwarderAddress,
      纭鐘舵€? '寰呬簩娆＄‘璁?,
      '1688璁㈠崟鍙?: '',
      閲囪喘鐘舵€? '閲囪喘纭涓?,
      鐗╂祦鍗曞彿: '',
      寮傚父澶囨敞: freightForwarderAddress ? '鑷姩鐢熸垚閲囪喘浠诲姟锛屾彁浜や粯娆惧墠蹇呴』浜哄伐浜屾纭銆? : '缂哄皯璐т唬鍦板潃锛岄渶浜哄伐澶勭悊銆?,
      鏈€鍚庢洿鏂版椂闂? Date.now(),
    });
  }

  private async ensureTable(input: {
    bitable: FeishuBitableConfig;
    tableName: string;
    fields: FeishuCreateField[];
    strictTypes?: boolean;
  }) {
    const bitable = input.bitable;
    if (!bitable.appToken.trim()) {
      throw new Error(`${input.tableName} app_token 蹇呭～`);
    }

    if (bitable.tableId.trim()) {
      await this.ensureMissingFields(bitable, input.fields, input.strictTypes);
      return bitable;
    }

    const existingTable = await this.findTableByName(bitable.appToken, input.tableName);
    if (existingTable) {
      const existingBitable = {
        ...bitable,
        tableId: existingTable.table_id,
      };
      await this.ensureMissingFields(existingBitable, input.fields, input.strictTypes);
      return existingBitable;
    }

    const response = await this.request<FeishuSingleResponse<{ table_id?: string; default_view_id?: string }>>(
      `/bitable/v1/apps/${encodeURIComponent(bitable.appToken)}/tables`,
      {
        method: 'POST',
        body: JSON.stringify({
          table: {
            name: input.tableName,
            default_view_name: defaultViewName,
            fields: input.fields,
          },
        }),
      },
    );

    const tableId = response.data?.table_id;
    if (!tableId) {
      throw new Error(`椋炰功鏁版嵁琛ㄥ垱寤烘垚鍔熶絾鏈繑鍥?table_id锛?{input.tableName}`);
    }

    return {
      ...bitable,
      tableId,
      viewId: bitable.viewId || response.data?.default_view_id || '',
    };
  }

  private async findTableByName(appToken: string, tableName: string) {
    const tables = await this.listTables(appToken);
    const target = normalizeHeaderName(tableName);
    return tables.find((table) => normalizeHeaderName(table.name) === target);
  }

  private async listTables(appToken: string) {
    const tables: FeishuTable[] = [];
    let pageToken = '';
    do {
      const query = new URLSearchParams({ page_size: '100' });
      if (pageToken) {
        query.set('page_token', pageToken);
      }
      const response = await this.request<FeishuListResponse<FeishuTable>>(
        `/bitable/v1/apps/${encodeURIComponent(appToken)}/tables?${query}`,
      );
      tables.push(...(response.data?.items ?? []));
      pageToken = response.data?.page_token ?? '';
      if (!response.data?.has_more) {
        break;
      }
    } while (pageToken);

    return tables;
  }

  private async ensureMissingFields(bitable: FeishuBitableConfig, requiredFields: FeishuCreateField[], strictTypes = false) {
    const existingFields = await this.listFields(bitable);
    for (const field of requiredFields) {
      const existingField = findFieldByName(existingFields, field.field_name);
      if (existingField) {
        if (strictTypes && existingField.type !== field.type && existingField.type !== 20) {
          throw new Error(`瀛楁绫诲瀷涓嶅尮閰嶏細${field.field_name}锛屽綋鍓嶇被鍨?${existingField.type}锛屾湡鏈涚被鍨?${field.type}`);
        }
        continue;
      }
      const createdField = await this.createField(bitable, field);
      existingFields.push(createdField);
    }
  }

  private async createField(bitable: FeishuBitableConfig, field: FeishuCreateField) {
    const response = await this.request<FeishuSingleResponse<FeishuField>>(
      `/bitable/v1/apps/${encodeURIComponent(bitable.appToken)}/tables/${encodeURIComponent(bitable.tableId)}/fields`,
      {
        method: 'POST',
        body: JSON.stringify(field),
      },
    );
    if (!response.data) {
      return {
        field_id: '',
        field_name: field.field_name,
        type: field.type,
      };
    }

    return response.data;
  }

  private async listFields(bitable: FeishuBitableConfig) {
    const fields: FeishuField[] = [];
    let pageToken = '';
    do {
      const query = new URLSearchParams({ page_size: '100' });
      if (pageToken) {
        query.set('page_token', pageToken);
      }
      const response = await this.request<FeishuListResponse<FeishuField>>(
        `/bitable/v1/apps/${encodeURIComponent(bitable.appToken)}/tables/${encodeURIComponent(bitable.tableId)}/fields?${query}`,
      );
      fields.push(...(response.data?.items ?? []));
      pageToken = response.data?.page_token ?? '';
      if (!response.data?.has_more) {
        break;
      }
    } while (pageToken);

    return fields;
  }

  private async searchRecords(bitable: FeishuBitableConfig) {
    const records: FeishuRecord[] = [];
    let pageToken = '';
    do {
      const query = new URLSearchParams({ page_size: '500' });
      if (pageToken) {
        query.set('page_token', pageToken);
      }
      const body = bitable.viewId ? { view_id: bitable.viewId } : {};
      const response = await this.request<FeishuListResponse<FeishuRecord>>(
        `/bitable/v1/apps/${encodeURIComponent(bitable.appToken)}/tables/${encodeURIComponent(bitable.tableId)}/records/search?${query}`,
        {
          method: 'POST',
          body: JSON.stringify(body),
        },
      );
      records.push(...(response.data?.items ?? []));
      pageToken = response.data?.page_token ?? '';
      if (!response.data?.has_more) {
        break;
      }
    } while (pageToken);

    return records;
  }

  private async searchRecordsWithoutView(bitable: FeishuBitableConfig) {
    return this.searchRecords({ ...bitable, viewId: '' });
  }

  private async syncOutputGroupStatus(bitable: FeishuBitableConfig, fields: FeishuField[], group: PriceOutputGroup) {
    const statusFieldName = getFieldNameByCandidates(fields, ['鍟嗗搧缁勭姸鎬?]);
    if (!statusFieldName || group.rows.length === 0) {
      return;
    }

    const targetStatus = group.rows.find((row) => row.groupStatus === '寰呮洿鏂拌〃涓?)?.groupStatus
      ?? group.rows.find((row) => row.groupStatus === '宸叉牳瀹?)?.groupStatus
      ?? '';
    if (!targetStatus) {
      return;
    }

    for (const row of group.rows) {
      if (row.groupStatus === targetStatus) {
        continue;
      }
      await this.updateRecordFields(bitable, row.recordId, { [statusFieldName]: normalizeValueForField(targetStatus, { field_id: '', field_name: statusFieldName, type: fields.find((field) => getFeishuFieldName(field) === statusFieldName)?.type ?? 1 }) });
    }
  }

  private async batchCreateRecords(bitable: FeishuBitableConfig, records: Array<{ fields: Record<string, unknown> }>) {
    if (records.length === 0) {
      return;
    }

    await this.request<FeishuSingleResponse<unknown>>(
      `/bitable/v1/apps/${encodeURIComponent(bitable.appToken)}/tables/${encodeURIComponent(bitable.tableId)}/records/batch_create`,
      {
        method: 'POST',
        body: JSON.stringify({ records }),
      },
    );
  }

  private async updateRecordFields(bitable: FeishuBitableConfig, recordId: string, fields: Record<string, unknown>) {
    if (!recordId || Object.keys(fields).length === 0) {
      return;
    }

    await this.request<FeishuSingleResponse<unknown>>(
      `/bitable/v1/apps/${encodeURIComponent(bitable.appToken)}/tables/${encodeURIComponent(bitable.tableId)}/records/${encodeURIComponent(recordId)}`,
      {
        method: 'PUT',
        body: JSON.stringify({ fields }),
      },
    );
  }

  private async deleteRecord(bitable: FeishuBitableConfig, recordId: string) {
    if (!recordId) {
      return;
    }

    await this.request<FeishuSingleResponse<unknown>>(
      `/bitable/v1/apps/${encodeURIComponent(bitable.appToken)}/tables/${encodeURIComponent(bitable.tableId)}/records/${encodeURIComponent(recordId)}`,
      {
        method: 'DELETE',
      },
    );
  }

  private async deletePreviousOutputRowsForInput(
    bitable: FeishuBitableConfig,
    fields: FeishuField[],
    inputRecordId: string,
    currentBatchId: string,
  ) {
    const records = await this.searchRecordsWithoutView(bitable);
    for (const record of records) {
      const row = readPriceOutputRow(fields, record);
      if (row.inputRecordId !== inputRecordId || row.batchId === currentBatchId) {
        continue;
      }
      await this.deleteRecord(bitable, record.record_id);
    }
  }

  private async getTenantAccessToken() {
    if (this.accessToken && Date.now() < this.accessTokenExpiresAt - 60_000) {
      return this.accessToken;
    }

    const response = await fetch(`${this.baseUrl}/auth/v3/tenant_access_token/internal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        app_id: this.options.appId,
        app_secret: this.options.appSecret,
      }),
    });

    if (!response.ok) {
      throw new Error(`椋炰功 tenant_access_token 鑾峰彇澶辫触锛?{response.status} ${response.statusText}`);
    }

    const payload = (await response.json()) as { code: number; msg: string; tenant_access_token?: string; expire?: number };
    if (payload.code !== 0 || !payload.tenant_access_token) {
      throw new Error(`椋炰功 tenant_access_token 鑾峰彇澶辫触锛?{payload.msg || payload.code}锛坈ode: ${payload.code}锛塦);
    }

    this.accessToken = payload.tenant_access_token;
    this.accessTokenExpiresAt = Date.now() + Math.max(60, payload.expire ?? 7200) * 1000;
    return this.accessToken;
  }

  private async request<T extends { code: number; msg: string }>(apiPath: string, init: RequestInit = {}) {
    const token = await this.getTenantAccessToken();
    const response = await fetch(`${this.baseUrl}${apiPath}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${token}`,
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      throw new Error(`椋炰功鎺ュ彛璇锋眰澶辫触锛?{response.status} ${response.statusText}`);
    }

    const payload = (await response.json()) as T;
    if (payload.code !== 0) {
      throw new Error(`椋炰功鎺ュ彛杩斿洖閿欒锛?{payload.msg || payload.code}锛坈ode: ${payload.code}锛塦);
    }

    return payload;
  }
}

export function assertFeishuBitableConfig(label: string, bitable?: FeishuBitableConfig): asserts bitable is FeishuBitableConfig {
  if (!bitable?.appToken?.trim() || !bitable.tableId?.trim()) {
    throw new Error(`${label}澶氱淮琛ㄦ牸 app_token 鍜?table_id 蹇呭～`);
  }
}

export function assertFeishuCredentials(appId: string, appSecret: string) {
  if (!appId.trim() || !appSecret.trim()) {
    throw new Error('璇峰厛鍦?AI姣斾环閰嶇疆濉啓椋炰功 app_id 鍜?app_secret');
  }
}

function pickField(fields: FeishuField[], names: string[]) {
  return names.map((name) => findFieldByName(fields, name)).find((field): field is FeishuField => Boolean(field));
}

function isZhengheDetailUrl(value: string) {
  return /zhenghedata\.com\/product\/search\/detail(?:-old)?/.test(value);
}

function getMiaoshouCollectUrl(row: ListingProductRecord, collectSource: 'sourceUrl' | 'offerUrl') {
  return collectSource === 'offerUrl' ? row.offerUrl : row.sourceUrl;
}

function setDerivedRowValue(
  fields: FeishuField[],
  row: Record<string, string | number>,
  patch: Record<string, unknown>,
  candidates: string[],
  targetHeader: string,
  value: string,
  overwrite = false,
) {
  const trimmedValue = value.trim();
  if (!trimmedValue || (!overwrite && String(row[targetHeader] ?? '').trim())) {
    return;
  }

  row[targetHeader] = trimmedValue;
  const field = pickField(fields, candidates);
  if (!field) {
    return;
  }

  const fieldName = getFeishuFieldName(field);
  if (fieldName) {
    patch[fieldName] = normalizeValueForField(trimmedValue, field);
  }
}

function shouldWriteCandidateRows(fields: FeishuField[]) {
  return Boolean(
    pickField(fields, ['1688閾炬帴', '璐ф簮閾炬帴', '1688璐ф簮閾炬帴', '鎺ㄨ崘1688閾炬帴']) ||
      pickField(fields, ['鎺ㄨ崘鎺掑悕', '璐ф簮鎺掑悕', '鎺掑悕']) ||
      pickField(fields, ['offerId', 'Offer ID', '璐ф簮ID']),
  );
}

function createCandidateOutputRows(item: ProductItem, limit: number): OutputRow[] {
  const matches = getTopPriceMatches(item, limit);
  const buildRowsWithStatus = (rows: OutputRow[]) => {
    const rowsWithCandidateStatus = rows.map((row) => ({
      ...row,
      candidateStatus: getOutputCandidateStatus(row),
    }));
    const groupStatus = getOutputGroupStatus(item, rowsWithCandidateStatus);
    return rowsWithCandidateStatus.map((row) => ({ ...row, groupStatus }));
  };

  if (matches.length > 0) {
    return buildRowsWithStatus(matches.map((match) => ({
      item,
      match,
      candidate: findCandidateByOfferId(item, match.offerId),
    })));
  }

  const candidates = item.candidates ?? [];
  if (candidates.length === 0) {
    return buildRowsWithStatus([{ item }]);
  }

  return buildRowsWithStatus(candidates.slice(0, limit).map((candidate, index) => ({
    item,
    candidate,
    match: undefined,
    rank: index + 1,
  })));
}

function getSummaryOutputCandidateStatus(item: ProductItem) {
  return item.status === 'success' ? '鎴愬姛' : '澶辫触';
}

function getOutputCandidateStatus(row: OutputRow) {
  return row.item.status === 'success' && Boolean(row.match?.offerUrl || row.candidate?.offerUrl) ? '鎴愬姛' : '澶辫触';
}

function getOutputGroupStatus(item: ProductItem, rows: Array<Pick<OutputRow, 'candidateStatus'>>) {
  if (item.status !== 'success') {
    return '澶辫触';
  }
  if (rows.length > 0 && rows.every((row) => row.candidateStatus === '鎴愬姛')) {
    return '宸叉牳瀹?;
  }
  return '寰呮牳瀹?;
}

function findFieldByName(fields: FeishuField[], name: string) {
  const target = normalizeHeaderName(name);
  return fields.find((field) => normalizeHeaderName(getFeishuFieldName(field)) === target);
}

function getFeishuFieldName(field: FeishuField) {
  return field.field_name ?? field.name ?? '';
}

function normalizeHeaderName(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function normalizeFieldValueForExcel(value: unknown, preferUrl = false): string | number {
  if (value == null) {
    return '';
  }

  if (typeof value === 'string' || typeof value === 'number') {
    return value;
  }

  if (typeof value === 'boolean') {
    return value ? '鏄? : '鍚?;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeFieldValueForExcel(item, preferUrl)).filter(Boolean).join('銆?);
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (preferUrl && typeof record.link === 'string') {
      return record.link;
    }
    if (preferUrl && typeof record.url === 'string') {
      return record.url;
    }
    if (typeof record.text === 'string' || typeof record.text === 'number') {
      return record.text;
    }
    if (typeof record.link === 'string') {
      return record.link;
    }
    if (typeof record.url === 'string') {
      return record.url;
    }
    if (typeof record.name === 'string') {
      return record.name;
    }
    if (typeof record.value === 'string' || typeof record.value === 'number') {
      return record.value;
    }
    if (typeof record.result === 'string' || typeof record.result === 'number') {
      return record.result;
    }
    if (typeof record.formula_result === 'string' || typeof record.formula_result === 'number') {
      return record.formula_result;
    }
    if (Array.isArray(record.text_arr)) {
      return record.text_arr.map((item) => normalizeFieldValueForExcel(item)).filter(Boolean).join('');
    }
    if (Array.isArray(record.value)) {
      return record.value.map((item) => normalizeFieldValueForExcel(item)).filter(Boolean).join('');
    }
    if (Array.isArray(record.result)) {
      return record.result.map((item) => normalizeFieldValueForExcel(item)).filter(Boolean).join('');
    }
  }

  return String(value);
}

function normalizeValueForField(value: unknown, field: FeishuField) {
  if (value == null) {
    return '';
  }

  if (field.type === 2) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : value;
  }

  if (field.type === 3) {
    return String(Array.isArray(value) ? value[0] ?? '' : value).trim();
  }

  if (field.type === 4) {
    if (Array.isArray(value)) {
      return value.map((item) => String(item).trim()).filter(Boolean);
    }
    return String(value)
      .split(/[锛?銆?锛宂/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (field.type === 7) {
    if (typeof value === 'boolean') {
      return value;
    }
    return ['true', '1', '鏄?, '宸查€?, '閫変腑', 'yes'].includes(String(value).trim().toLowerCase());
  }

  if (field.type === 15) {
    const url = String(value).trim();
    return isHttpUrl(url) ? { link: url, text: url } : '';
  }

  return value;
}

function fieldValueToText(value: unknown, preferUrl = false) {
  return String(normalizeFieldValueForExcel(value, preferUrl)).trim();
}

function extractNumberFromFieldValue(value: unknown): number | '' {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const numberValue = Number(value.replace(/,/g, '').trim());
    return Number.isFinite(numberValue) ? numberValue : '';
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const numberValue = extractNumberFromFieldValue(item);
      if (typeof numberValue === 'number') {
        return numberValue;
      }
    }
    return '';
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['value', 'result', 'formula_result', 'text', 'name']) {
      const numberValue = extractNumberFromFieldValue(record[key]);
      if (typeof numberValue === 'number') {
        return numberValue;
      }
    }
  }
  return '';
}

function fieldValueToBoolean(value: unknown) {
  if (typeof value === 'boolean') {
    return value;
  }

  return ['true', '1', '鏄?, '宸查€?, '閫変腑', 'yes'].includes(fieldValueToText(value).toLowerCase());
}

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function getQualifiedMatches(item: ProductItem) {
  return (item.skuMatches ?? [])
    .filter((match) => Number.isFinite(match.purchaseCost))
    .sort((left, right) => Number(left.purchaseCost) - Number(right.purchaseCost));
}

function getTopPriceMatches(item: ProductItem, limit: number): RankedSkuMatch[] {
  return getQualifiedMatches(item)
    .slice(0, limit)
    .map((match, index) => ({ ...match, rank: index + 1 }));
}

function getBestPriceMatch(item: ProductItem) {
  return getQualifiedMatches(item)[0];
}

function findCandidateByOfferId(item: ProductItem, offerId: string) {
  return item.candidates?.find((candidate) => candidate.offerId === offerId);
}

function getRiskNote(item: ProductItem) {
  if (item.status === 'success') {
    return [
      ...(item.candidates ?? []).flatMap((candidate) => candidate.riskFlags),
      ...(item.skuMatches ?? []).flatMap((match) => match.riskFlags),
    ].join('锛?);
  }

  return item.errorMessage ?? '澶勭悊澶辫触';
}

function getRiskNoteForOutputRow(row: OutputRow) {
  if (row.item.status !== 'success') {
    return row.item.errorMessage ?? '澶勭悊澶辫触';
  }

  const riskFlags = [
    ...(row.candidate?.riskFlags ?? []),
    ...(row.match?.riskFlags ?? []),
  ];
  if (riskFlags.length > 0) {
    return riskFlags.join('锛?);
  }

  return getRiskNote(row.item);
}

function getOutputFailureReason(item: ProductItem) {
  if (item.status === 'success' && (item.skuMatches ?? []).length > 0) {
    return '';
  }

  if (item.status === 'missing_image') {
    return '涓诲浘涓嬭浇澶辫触';
  }

  if (item.status === 'not_found') {
    return '1688鏃犳悳绱㈢粨鏋?;
  }

  const message = item.errorMessage ?? '';
  if (/鍊欓€夎В鏋恷鏈В鏋愬嚭鍊欓€墊鍊欓€夎鎯呴摼鎺鎼滃浘缁撴灉椤祙鎼滃浘/.test(message)) return '1688鎼滃浘澶辫触';
  if (/SKU/.test(message)) return 'SKU鍖归厤澶辫触';
  if (/杩愯垂/.test(message)) return '杩愯垂缂哄け';
  if (/浠锋牸|閲囪喘/.test(message)) return '閲囪喘浠风己澶?;
  if (/璇︽儏椤?.test(message)) return '璇︽儏椤佃В鏋愬け璐?;
  if (/鐧诲綍/.test(message)) return '1688鐧诲綍澶辨晥';
  if (/楠岃瘉|楠岃瘉鐮亅鎷︽埅/.test(message)) return '1688楠岃瘉鎷︽埅';
  if (/鎼滃浘/.test(message)) return '1688鎼滃浘澶辫触';
  return item.status === 'success' ? '' : '鏈煡寮傚父';
}

function getInputPreflightFailures(item: ProductItem) {
  const failures: string[] = [];
  const zhengheDataUrl = item.zhengheDataUrl?.trim() ?? '';
  const sourceUrl = item.sourceUrl?.trim() ?? '';
  const imageUrl = item.sourceImageUrl?.trim() || item.imageUrl?.trim() || '';
  const hasAnySearchEntry = Boolean(zhengheDataUrl || sourceUrl || imageUrl);

  if (zhengheDataUrl && isZhengheDetailUrl(zhengheDataUrl) && !parseZhengheProductReference(zhengheDataUrl).productId) {
    failures.push('閮戝拰鍟嗗搧ID瑙ｆ瀽澶辫触');
  }
  if (zhengheDataUrl && !isHttpUrl(zhengheDataUrl)) {
    failures.push('閮戝拰閾炬帴鏍煎紡閿欒');
  }
  if (!hasAnySearchEntry) {
    failures.push('閮戝拰閾炬帴涓虹┖');
    failures.push('鍘熷晢鍝侀摼鎺ョ己澶?);
    failures.push('鍘熷晢鍝佷富鍥剧己澶?);
  }
  if (zhengheDataUrl && !item.productId?.trim()) {
    failures.push(zhengheDataUrl ? '閮戝拰鍟嗗搧ID瑙ｆ瀽澶辫触' : '閮戝拰閾炬帴涓虹┖');
  }
  if (zhengheDataUrl && !item.country?.trim()) {
    failures.push('鍥藉/绔欑偣瑙ｆ瀽澶辫触');
  }

  return [...new Set(failures)];
}

function normalizeInputFailureReason(message: string) {
  if (/閮戝拰.*鏍煎紡|閾炬帴.*鏍煎紡/.test(message)) return '閮戝拰閾炬帴鏍煎紡閿欒';
  if (/閮戝拰.*鍟嗗搧ID|鍟嗗搧ID/.test(message)) return '閮戝拰鍟嗗搧ID瑙ｆ瀽澶辫触';
  if (/鍥藉|绔欑偣|region/i.test(message)) return '鍥藉/绔欑偣瑙ｆ瀽澶辫触';
  if (/涓诲浘|鍥剧墖/.test(message)) return '鍘熷晢鍝佷富鍥剧己澶?;
  if (/鍘熷晢鍝侀摼鎺鍟嗗搧閾炬帴/.test(message)) return '鍘熷晢鍝侀摼鎺ョ己澶?;
  if (/閮戝拰.*鎺ュ彛|閮戝拰.*璇锋眰/.test(message)) return '閮戝拰鎺ュ彛璇锋眰澶辫触';
  if (/閮戝拰.*杩斿洖.*绌?.test(message)) return '閮戝拰杩斿洖鏁版嵁涓虹┖';
  if (/閮戝拰.*瀛楁/.test(message)) return '閮戝拰杩斿洖瀛楁缂哄け';
  return '鏈煡寮傚父';
}

function getRunningInputStatus(fields: FeishuField[]) {
  return findFieldByName(fields, '褰撳墠姣斾环鎵规鍙?) ? '澶勭悊涓? : '鏍稿疄涓?;
}

function createComparisonBatchId() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  const datePart = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    '_',
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('');
  const randomPart = Math.random().toString(36).slice(2, 6);
  return `cmp_${datePart}_${randomPart}`;
}

function getSelectionRowStatus(item: ProductItem) {
  if (item.status === 'success') {
    return (item.candidates ?? []).length > 0 ? '鎴愬姛' : '鏈壘鍒?;
  }

  if (item.status === 'missing_image') {
    return '缂哄皯涓诲浘';
  }

  if (item.status === 'not_found') {
    return '鏈壘鍒?;
  }

  return '澶辫触';
}

function getRealtimeRowStatus(item: ProductItem) {
  if (item.status === 'success') {
    return (item.candidates ?? []).length > 0 ? '宸插畬鎴? : '澶辫触';
  }

  return '澶辫触';
}

function matchesClaimStatus(status: string, statusFilter: RowStatusFilter) {
  if (statusFilter === 'failedOnly') {
    return status === '澶辫触';
  }

  if (statusFilter === 'pendingOnly') {
    return !status || status === '寰呭鐞?;
  }

  return !['宸插畬鎴?, '宸茶繘鍏ユ瘮浠?, '澶勭悊涓?, '鏍稿疄涓?, '宸查噸澶?].includes(status);
}

function normalizeBitableForApp(config: Partial<FeishuBitableConfig> | undefined, appToken: string): FeishuBitableConfig {
  return {
    appToken,
    tableId: config?.tableId?.trim() ?? '',
    viewId: config?.viewId?.trim() ?? '',
  };
}

function buildCommerceKey(productId: string, offerId: string, skuName: string) {
  return [productId, offerId, skuName].map((part) => part.trim()).filter(Boolean).join('__');
}

function getFieldNameByCandidates(fields: FeishuField[], names: string[]) {
  const field = pickField(fields, names);
  return field ? getFeishuFieldName(field) : '';
}

function readTextByCandidates(fields: FeishuField[], record: FeishuRecord, names: string[], preferUrl = false) {
  const fieldName = getFieldNameByCandidates(fields, names);
  return fieldName ? fieldValueToText(record.fields[fieldName], preferUrl) : '';
}

function readNumberByCandidates(fields: FeishuField[], record: FeishuRecord, names: string[]): number | '' {
  const fieldName = getFieldNameByCandidates(fields, names);
  if (!fieldName) {
    return '';
  }
  const directNumber = extractNumberFromFieldValue(record.fields[fieldName]);
  if (typeof directNumber === 'number') {
    return directNumber;
  }
  const text = fieldValueToText(record.fields[fieldName]).replace(/,/g, '');
  if (!text.trim()) {
    return '';
  }
  const value = Number(text);
  return Number.isFinite(value) ? value : '';
}

function readPositiveNumberByCandidates(fields: FeishuField[], record: FeishuRecord, names: string[]): number | '' {
  let fallback: number | '' = '';
  for (const name of names) {
    const value = readNumberByCandidates(fields, record, [name]);
    if (typeof value !== 'number') {
      continue;
    }
    if (fallback === '') {
      fallback = value;
    }
    if (value > 0) {
      return value;
    }
  }
  return fallback;
}

function readOutputRecord(fields: FeishuField[], record: FeishuRecord, rank: number): SourcingOutputRecord {
  const productId = readTextByCandidates(fields, record, ['鍟嗗搧ID', '鍘熷晢鍝両D', '浜у搧ID', 'Product ID']);
  const offerId = readTextByCandidates(fields, record, ['offerId', 'Offer ID', '璐ф簮ID']);
  const skuName = readTextByCandidates(fields, record, ['SKU鍚嶇О', '鍖归厤SKU', 'SKU']);

  return {
    key: buildCommerceKey(productId, offerId, skuName),
    productId,
    sourceUrl: readTextByCandidates(fields, record, ['鍘熷晢鍝侀摼鎺?, '鍟嗗搧閾炬帴', '鍟嗗搧URL', '鍘熼摼鎺?], true),
    zhengheDataUrl: readTextByCandidates(fields, record, ['閮戝拰鏁版嵁閾炬帴', '閮戝拰閾炬帴', '閮戝拰鍟嗗搧閾炬帴'], true),
    sourceImageUrl: readTextByCandidates(fields, record, ['鍘熷晢鍝佷富鍥綰RL', '涓诲浘URL', '鍟嗗搧涓诲浘', '鍥剧墖URL'], true),
    offerUrl: readTextByCandidates(fields, record, ['1688閾炬帴', '璐ф簮閾炬帴', '1688璐ф簮閾炬帴', '鎺ㄨ崘1688閾炬帴'], true),
    offerId,
    skuName,
    skuImageUrl: readTextByCandidates(fields, record, ['SKU鍥剧墖URL'], true),
    purchaseCost: readNumberByCandidates(fields, record, ['閲囪喘鎴愭湰浠?, '閲囪喘鎴愭湰', '鎴愭湰浠?]),
    itemPrice: readNumberByCandidates(fields, record, ['鍟嗗搧浠?, '鍟嗗搧浠锋牸', '璐ф簮浠锋牸']),
    shippingFee: readNumberByCandidates(fields, record, ['杩愯垂', '棰勪及杩愯垂']),
    dimensions: readTextByCandidates(fields, record, ['灏哄', '瑙勬牸灏哄']),
    weightGram: readNumberByCandidates(fields, record, ['鍏嬮噸', '鍏嬮噸g', '閲嶉噺g', '閲嶉噺']),
    supplier: readTextByCandidates(fields, record, ['1688渚涘簲鍟?, '渚涘簲鍟?, '璐ф簮渚涘簲鍟?]),
    similarity: readNumberByCandidates(fields, record, ['SKU鍥剧墖鐩镐技搴?, 'SKU鐩镐技搴?, '鐩镐技搴?, '鍒楄〃鍥剧墖鐩镐技搴?, '鍒楄〃鐩镐技搴?]),
    riskNote: readTextByCandidates(fields, record, ['椋庨櫓澶囨敞', '椋庨櫓鏍囪', '澶囨敞', '澶辫触鍘熷洜']),
    title: readTextByCandidates(fields, record, ['鍘熷晢鍝佹爣棰?, '鍟嗗搧鏍囬', '鏍囬', '鍝佸悕']),
    country: readTextByCandidates(fields, record, ['鍥藉', '绔欑偣', '甯傚満']),
    category: readTextByCandidates(fields, record, ['绫荤洰', '鍒嗙被']),
    targetSiteCategory: readTextByCandidates(fields, record, targetSiteCategoryFieldCandidates),
    status: readTextByCandidates(fields, record, ['鐘舵€?, '鎼滃浘鐘舵€?, '澶勭悊鐘舵€?, '鍘熼摼鎺ョ姸鎬?]),
    rank,
  };
}

function readPriceOutputRow(fields: FeishuField[], record: FeishuRecord): PriceOutputRow {
  const itemPrice = readNumberByCandidates(fields, record, ['閲囪喘浠?, '鍟嗗搧浠?, '鍟嗗搧浠锋牸', '璐ф簮浠锋牸']);
  const shippingFee = readNumberByCandidates(fields, record, ['杩愯垂', '棰勪及杩愯垂']);
  const purchaseCost =
    readNumberByCandidates(fields, record, ['閲囪喘鎬绘垚鏈?, '閲囪喘鎴愭湰浠?, '閲囪喘鎴愭湰', '鎴愭湰浠?]) ||
    (typeof itemPrice === 'number' && typeof shippingFee === 'number' ? itemPrice + shippingFee : '');

  return {
    recordId: record.record_id,
    productId: readTextByCandidates(fields, record, ['鍟嗗搧ID', '鍘熷晢鍝両D', '浜у搧ID', 'Product ID']),
    site: readTextByCandidates(fields, record, ['鍥藉/绔欑偣', '鍥藉', '绔欑偣', '甯傚満']),
    groupStatus: readTextByCandidates(fields, record, ['鍟嗗搧缁勭姸鎬?, '鐘舵€?]),
    candidateStatus: readTextByCandidates(fields, record, ['鍊欓€夌姸鎬?, '鎼滃浘鐘舵€?, '澶勭悊鐘舵€?]),
    purchaseCost,
    weightGram: readNumberByCandidates(fields, record, ['鍏嬮噸', '鍏嬮噸g', '閲嶉噺g', '閲嶉噺']),
    dimensions: readTextByCandidates(fields, record, ['灏哄', '瑙勬牸灏哄']),
    manuallySelected: fieldValueToBoolean(record.fields[getFieldNameByCandidates(fields, ['浜哄伐鎸囧畾涓婃灦璐ф簮'])]),
    batchId: readTextByCandidates(fields, record, ['姣斾环鎵规鍙?, '褰撳墠姣斾环鎵规鍙?]),
    inputRecordId: readTextByCandidates(fields, record, ['杈撳叆琛ㄨ褰旾D']),
    candidateRank: readNumberByCandidates(fields, record, ['鍊欓€夊簭鍙?, '鎺ㄨ崘鎺掑悕', '璐ф簮鎺掑悕', '鎺掑悕']),
    offerUrl: readTextByCandidates(fields, record, ['1688閾炬帴', '璐ф簮閾炬帴', '1688璐ф簮閾炬帴', '鎺ㄨ崘1688閾炬帴'], true),
    offerId: readTextByCandidates(fields, record, ['offerId', 'Offer ID', '璐ф簮ID']),
    skuName: readTextByCandidates(fields, record, ['SKU鍚嶇О', '鍖归厤SKU', 'SKU']),
    skuImageUrl: readTextByCandidates(fields, record, ['SKU鍥剧墖URL'], true),
    itemPrice,
    shippingFee,
    supplier: readTextByCandidates(fields, record, ['渚涘簲鍟?, '1688渚涘簲鍟?, '璐ф簮渚涘簲鍟?]),
    similarity: readNumberByCandidates(fields, record, ['鐩镐技搴?, 'SKU鍥剧墖鐩镐技搴?, 'SKU鐩镐技搴?, '鍒楄〃鍥剧墖鐩镐技搴?]),
    minimumOrderQuantity: readNumberByCandidates(fields, record, ['璧锋壒閲?, '鏈€灏忚捣璁㈤噺']),
    annualSalesVolume: readNumberByCandidates(fields, record, ['骞撮攢閲?]),
    monthlyDistributionVolume: readNumberByCandidates(fields, record, ['鏈堜唬閿€']),
    salesVolume: readNumberByCandidates(fields, record, ['1688閿€閲?, '閿€閲?]),
    salesText: readTextByCandidates(fields, record, ['1688閿€閲忔枃鏈?, '閿€閲忔枃鏈?]),
    salesRiskNote: readTextByCandidates(fields, record, ['閿€閲忛闄╁娉?]),
    riskNote: readTextByCandidates(fields, record, ['椋庨櫓澶囨敞', '椋庨櫓鏍囪', '澶囨敞']),
    failureReason: readTextByCandidates(fields, record, ['澶辫触褰掑洜', '澶辫触鍘熷洜']),
    zhengheDataUrl: readTextByCandidates(fields, record, ['閮戝拰鏁版嵁閾炬帴', '閮戝拰閾炬帴', '閮戝拰鍟嗗搧閾炬帴'], true),
    sourceUrl: readTextByCandidates(fields, record, ['鍘熷晢鍝侀摼鎺?, '鍟嗗搧閾炬帴', '鍟嗗搧URL', '鍘熼摼鎺?], true),
    sourceImageUrl: readTextByCandidates(fields, record, ['鍘熷晢鍝佷富鍥綰RL', '涓诲浘URL', '鍟嗗搧涓诲浘', '鍥剧墖URL'], true),
    targetSiteCategory: readTextByCandidates(fields, record, targetSiteCategoryFieldCandidates),
  };
}

function groupPriceOutputRecords(
  fields: FeishuField[],
  records: FeishuRecord[],
  inputContextByRecordId: Map<string, { targetSiteCategory: string }> = new Map(),
) {
  const groups = new Map<string, PriceOutputGroup>();
  for (const record of records) {
    const row = readPriceOutputRow(fields, record);
    if (!row.targetSiteCategory && row.inputRecordId) {
      row.targetSiteCategory = inputContextByRecordId.get(row.inputRecordId)?.targetSiteCategory ?? '';
    }
    const key = buildProductSiteKey(row.productId, row.site);
    if (!key) {
      continue;
    }

    const group = groups.get(key) ?? { key, productId: row.productId, site: row.site, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }

  return groups;
}

function buildInputContextByRecordId(fields: FeishuField[], records: FeishuRecord[]) {
  const context = new Map<string, { targetSiteCategory: string }>();
  for (const record of records) {
    context.set(record.record_id, {
      targetSiteCategory: readTextByCandidates(fields, record, targetSiteCategoryFieldCandidates),
    });
  }
  return context;
}

function getLatestBatchRows(rows: PriceOutputRow[]) {
  const latestBatchId = rows
    .map((row) => row.batchId)
    .filter(Boolean)
    .sort((left, right) => right.localeCompare(left))[0];
  return latestBatchId ? rows.filter((row) => row.batchId === latestBatchId) : rows;
}

function getLatestSuccessfulOutputBatchId(rows: PriceOutputRow[]) {
  return rows
    .filter((row) => row.batchId && row.candidateStatus !== '澶辫触')
    .map((row) => row.batchId)
    .sort((left, right) => right.localeCompare(left))[0] ?? '';
}

function getLatestSuccessfulReviewBatchId(rows: PriceReviewRecord[]) {
  return rows
    .filter((row) => row.batchId && row.status !== '澶辫触')
    .map((row) => row.batchId)
    .sort((left, right) => right.localeCompare(left))[0] ?? '';
}

function buildReviewRecommendation(rows: PriceOutputRow[], weightToleranceGram: number): ReviewRecommendation {
  const firstRow = rows[0];
  const baseValues = {
    鍟嗗搧ID: firstRow?.productId ?? '',
    '鍥藉/绔欑偣': firstRow?.site ?? '',
    姣斾环鎵规鍙? firstRow?.batchId ?? '',
    杈撳叆琛ㄨ褰旾D: firstRow?.inputRecordId ?? '',
    鍊欓€夋暟閲? rows.length,
    鏈夋晥鍊欓€夋暟閲? getValidReviewCandidates(rows).length,
    閮戝拰鏁版嵁閾炬帴: firstRow?.zhengheDataUrl ?? '',
    鍘熷晢鍝侀摼鎺? firstRow?.sourceUrl ?? '',
    鍘熷晢鍝佷富鍥綰RL: firstRow?.sourceImageUrl ?? '',
  };

  if (rows.length === 0 || !firstRow) {
    return {
      success: false,
      values: {
        ...baseValues,
        澶辫触褰掑洜: '鏃犲彲鐢ㄥ€欓€夐摼鎺?,
      },
    };
  }

  const selectedRows = rows.filter((row) => row.manuallySelected);
  if (selectedRows.length > 1) {
    return {
      success: false,
      values: {
        ...baseValues,
        澶辫触褰掑洜: '浜哄伐鎸囧畾澶氭潯鍊欓€?,
      },
    };
  }

  const selectedRow = selectedRows[0] ?? selectByWeightMajority(rows, weightToleranceGram);
  if (!selectedRow) {
    return {
      success: false,
      values: {
        ...baseValues,
        澶辫触褰掑洜: getSelectionFailureReason(rows),
      },
    };
  }

  const validationFailure = getReviewValidationFailure(selectedRow);
  const selectedValues = buildReviewValuesFromOutputRow(selectedRow, {
    candidateCount: rows.length,
    validCandidateCount: getValidReviewCandidates(rows).length,
    selectionReason: selectedRows[0]
      ? '浜哄伐鎸囧畾鍊欓€?
      : buildWeightSelectionReason(rows, selectedRow, weightToleranceGram),
  });

  return {
    success: !validationFailure,
    values: {
      ...baseValues,
      ...selectedValues,
      澶辫触褰掑洜: validationFailure,
    },
  };
}

function getValidReviewCandidates(rows: PriceOutputRow[]) {
  return rows.filter((row) => !getReviewValidationFailure(row));
}

function getSelectionFailureReason(rows: PriceOutputRow[]) {
  if (!rows.some((row) => row.offerUrl)) {
    return '鏃犲彲鐢ㄥ€欓€夐摼鎺?;
  }

  if (rows.every((row) => row.candidateStatus === '澶辫触')) {
    return '鍊欓€夊潎澶辫触';
  }

  if (rows.every((row) => typeof row.weightGram !== 'number')) {
    return '鍊欓€夊潎缂哄厠閲?;
  }

  return '鍏嬮噸鏃犳硶褰㈡垚澶氭暟鍐崇瓥';
}

function selectByWeightMajority(rows: PriceOutputRow[], weightToleranceGram: number) {
  const candidates = rows.filter((row) => row.candidateStatus !== '澶辫触' && typeof row.weightGram === 'number' && row.offerUrl);
  if (candidates.length === 0) {
    return null;
  }

  const tolerance = Math.max(0, Number(weightToleranceGram) || 5);
  const sortedCandidates = [...candidates].sort((left, right) => Number(left.weightGram) - Number(right.weightGram));
  const groups: PriceOutputRow[][] = [];
  for (const row of sortedCandidates) {
    const group = groups.find((items) => Math.abs(Number(items[0]?.weightGram ?? 0) - Number(row.weightGram)) <= tolerance);
    if (group) {
      group.push(row);
    } else {
      groups.push([row]);
    }
  }

  const rankedGroups = groups
    .map((items) => ({
      items,
      count: items.length,
      minCost: Math.min(...items.map((row) => Number(row.purchaseCost)).filter(Number.isFinite)),
    }))
    .sort((left, right) => {
      const countDiff = right.count - left.count;
      if (countDiff !== 0) {
        return countDiff;
      }
      return left.minCost - right.minCost;
    });

  const winner = rankedGroups[0];
  if (!winner || !Number.isFinite(winner.minCost)) {
    return null;
  }

  const hasMajority = winner.count > Math.max(0, ...rankedGroups.slice(1).map((group) => group.count));
  if (!hasMajority) {
    return [...candidates]
      .filter((row) => Number.isFinite(Number(row.purchaseCost)))
      .sort((left, right) => Number(left.purchaseCost) - Number(right.purchaseCost))[0] ?? null;
  }

  return [...winner.items].sort((left, right) => Number(left.purchaseCost) - Number(right.purchaseCost))[0] ?? null;
}

function getReviewValidationFailure(row: PriceOutputRow) {
  if (!row.productId) return '鍟嗗搧ID鏃犳硶鍏宠仈';
  if (!row.site) return '鍥藉/绔欑偣鏃犳硶鍏宠仈';
  if (!row.offerUrl) return '鏃犲彲鐢ㄥ€欓€夐摼鎺?;
  if (!row.offerId && !extractOfferIdFromUrl(row.offerUrl)) return 'offerId瑙ｆ瀽澶辫触';
  if (typeof row.purchaseCost !== 'number') return '閲囪喘鎬绘垚鏈己澶?;
  if (typeof row.weightGram !== 'number') return '鍏嬮噸缂哄け';
  return '';
}

function buildReviewValuesFromOutputRow(
  row: PriceOutputRow,
  options: { candidateCount: number; validCandidateCount: number; selectionReason: string },
) {
  return {
    鍟嗗搧ID: row.productId,
    '鍥藉/绔欑偣': row.site,
    姣斾环鎵规鍙? row.batchId,
    杈撳叆琛ㄨ褰旾D: row.inputRecordId,
    杈撳嚭璐ф簮琛ㄨ褰旾D: row.recordId,
    鎺ㄨ崘1688閾炬帴: row.offerUrl,
    offerId: row.offerId || extractOfferIdFromUrl(row.offerUrl),
    閲囪喘鎬绘垚鏈? row.purchaseCost,
    '閲囪喘鎬绘垚鏈紙CNY锛?: row.purchaseCost,
    鍏嬮噸: row.weightGram,
    '鍏嬮噸锛坓锛?: row.weightGram,
    灏哄: row.dimensions,
    鍊欓€夋暟閲? options.candidateCount,
    鏈夋晥鍊欓€夋暟閲? options.validCandidateCount,
    閫夋嫨渚濇嵁: options.selectionReason,
    椋庨櫓澶囨敞: [row.riskNote, row.salesRiskNote].filter(Boolean).join('锛?),
    閮戝拰鏁版嵁閾炬帴: row.zhengheDataUrl,
    鍘熷晢鍝侀摼鎺? row.sourceUrl,
    鍘熷晢鍝佷富鍥綰RL: row.sourceImageUrl,
    鐩爣绔欑偣绫荤洰: row.targetSiteCategory,
  };
}

function buildWeightSelectionReason(rows: PriceOutputRow[], selectedRow: PriceOutputRow, weightToleranceGram: number) {
  const selectedWeight = Number(selectedRow.weightGram);
  const weightedRows = rows.filter((row) => typeof row.weightGram === 'number');
  const hitCount = weightedRows.filter(
    (row) => typeof row.weightGram === 'number' && Math.abs(Number(row.weightGram) - selectedWeight) <= weightToleranceGram,
  ).length;
  const maxOtherHitCount = Math.max(
    0,
    ...weightedRows
      .filter((row) => Math.abs(Number(row.weightGram) - selectedWeight) > weightToleranceGram)
      .map((row) =>
        weightedRows.filter((candidate) => Math.abs(Number(candidate.weightGram) - Number(row.weightGram)) <= weightToleranceGram).length,
      ),
  );
  if (hitCount <= maxOtherHitCount) {
    return `鍏嬮噸鏃犲鏁板喅绛栵細${selectedWeight}g缁勫懡涓?{hitCount}/${rows.length}锛屾寜閲囪喘鎬绘垚鏈渶浣庨摼鎺ヨ繘鍏ヨ〃涓夛紝寰呬汉宸ユ牳閲峘;
  }
  return hitCount > maxOtherHitCount
    ? `鍏嬮噸澶氭暟鍐崇瓥锛?{selectedWeight}g缁勫懡涓?{hitCount}/${rows.length}锛岀粍鍐呮渶浣庨噰璐€绘垚鏈摼鎺ヨ儨鍑篳
    : `鍏嬮噸缁勫苟鍒楋細${selectedWeight}g缁勫懡涓?{hitCount}/${rows.length}锛屾寜缁勫唴鏈€浣庨噰璐€绘垚鏈摼鎺ヨ儨鍑篳;
}

function buildProductSiteKey(productId: string, site: string) {
  return [productId.trim(), site.trim().toLowerCase()].filter(Boolean).join('__');
}

function readListingRecord(fields: FeishuField[], record: FeishuRecord, rank: number): ListingProductRecord {
  const output = readOutputRecord(fields, record, rank);
  const key = readTextByCandidates(fields, record, ['鍏宠仈閿?]) || output.key;

  return {
    ...output,
    key,
    productId: readTextByCandidates(fields, record, ['鍟嗗搧ID', '鍘熷晢鍝両D', '浜у搧ID', 'Product ID']) || output.productId,
    reviewStatus: readTextByCandidates(fields, record, ['瀹℃牳鐘舵€?]) || '寰呭鏍?,
    publicationStatus: readTextByCandidates(fields, record, ['鍒婄櫥鐘舵€?]) || '寰呯敓鎴愬鎵嬭祫鏂?,
    purchaseBindingStatus: readTextByCandidates(fields, record, ['閲囪喘缁戝畾鐘舵€?]) || '鏈粦瀹氳鍗?,
  };
}

function readPriceReviewRecord(fields: FeishuField[], record: FeishuRecord): PriceReviewRecord {
  const itemPrice = readNumberByCandidates(fields, record, ['閲囪喘浠?, '鍟嗗搧浠?]);
  const shippingFee = readNumberByCandidates(fields, record, ['杩愯垂']);
  const purchaseCost =
    readNumberByCandidates(fields, record, ['閲囪喘鎬绘垚鏈紙CNY锛?, '閲囪喘鎬绘垚鏈?CNY', '閲囪喘鎬绘垚鏈?, '閲囪喘鎬绘垚鏈环', '閲囪喘鎴愭湰浠?]) ||
    (typeof itemPrice === 'number' && typeof shippingFee === 'number' ? itemPrice + shippingFee : '');

  return {
    recordId: record.record_id,
    productId: readTextByCandidates(fields, record, ['鍟嗗搧ID']),
    site: normalizeSite(readTextByCandidates(fields, record, ['鍥藉/绔欑偣', '鍥藉', '绔欑偣', '甯傚満'])),
    status: readTextByCandidates(fields, record, ['鐘舵€?]),
    batchId: readTextByCandidates(fields, record, ['姣斾环鎵规鍙?, '褰撳墠姣斾环鎵规鍙?]),
    sourceUrl: readTextByCandidates(fields, record, ['鍘熷晢鍝侀摼鎺?, '鍟嗗搧閾炬帴', 'TikTok鍓嶇閾炬帴'], true),
    offerUrl: readTextByCandidates(fields, record, ['鎺ㄨ崘1688閾炬帴', '1688閾炬帴', '璐ф簮閾炬帴'], true),
    offerId: readTextByCandidates(fields, record, ['offerId', 'Offer ID', '璐ф簮ID']) ||
      extractOfferIdFromUrl(readTextByCandidates(fields, record, ['鎺ㄨ崘1688閾炬帴', '1688閾炬帴', '璐ф簮閾炬帴'], true)),
    collectSourceItemId: resolveCollectSourceItemId({
      configuredSourceItemId: readTextByCandidates(fields, record, ['閲囬泦婧愯揣婧怚D']),
      offerId: readTextByCandidates(fields, record, ['offerId', 'Offer ID', '璐ф簮ID']),
      offerUrl: readTextByCandidates(fields, record, ['鎺ㄨ崘1688閾炬帴', '1688閾炬帴', '璐ф簮閾炬帴'], true),
      sourceUrl: readTextByCandidates(fields, record, ['鍘熷晢鍝侀摼鎺?, '鍟嗗搧閾炬帴', 'TikTok鍓嶇閾炬帴'], true),
      productId: readTextByCandidates(fields, record, ['鍘熷晢鍝両D', '鍟嗗搧ID']),
    }),
    purchaseCost,
    displayPrice: readNumberByCandidates(fields, record, [
      '鏈湴灞曠ず浠?鎶樺悗)(MYR)',
      '鏈湴灞曠ず浠?MYR',
      '鏈湴灞曠ず浠?,
      '鏈湴灞曠ず浠锋牸',
      '鏈湴灞曠ず浠?鍘熶环)(MYR)',
      '灞曠ず浠?,
      '灞曠ず浠锋牸',
      '鏈€缁堟垚浜や环鏍?MYR',
    ]),
    weightGram: readNumberByCandidates(fields, record, ['鍏嬮噸锛坓锛?, '鍏嬮噸', '閲嶉噺g', '鍖呰９閲嶉噺g']),
    dimensions: readTextByCandidates(fields, record, ['灏哄', '瑙勬牸灏哄']),
    targetSiteCategory: readTextByCandidates(fields, record, targetSiteCategoryFieldCandidates),
  };
}

function readListingEditRecord(fields: FeishuField[], record: FeishuRecord): ListingEditRecord {
  return {
    recordId: record.record_id,
    key: readTextByCandidates(fields, record, ['鍏宠仈閿?]),
    productId: readTextByCandidates(fields, record, ['鍟嗗搧ID']),
    reviewRecordId: readTextByCandidates(fields, record, ['琛ㄤ笁璁板綍ID']),
    batchId: readTextByCandidates(fields, record, ['姣斾环鎵规鍙?, '褰撳墠姣斾环鎵规鍙?]),
    offerId: readTextByCandidates(fields, record, ['offerId', '璐ф簮ID']) || extractOfferIdFromUrl(readTextByCandidates(fields, record, ['鎺ㄨ崘1688閾炬帴', '1688閾炬帴'], true)),
    collectSourceItemId: resolveCollectSourceItemId({
      configuredSourceItemId: readTextByCandidates(fields, record, ['閲囬泦婧愯揣婧怚D']),
      offerId: readTextByCandidates(fields, record, ['offerId', '璐ф簮ID']),
      offerUrl: readTextByCandidates(fields, record, ['鎺ㄨ崘1688閾炬帴', '1688閾炬帴'], true),
      sourceUrl: readTextByCandidates(fields, record, ['鍘熷晢鍝侀摼鎺?], true),
      productId: readTextByCandidates(fields, record, ['鍘熷晢鍝両D', '鍟嗗搧ID']),
    }),
    site: normalizeSite(readTextByCandidates(fields, record, ['鍥藉/绔欑偣', '鍥藉', '绔欑偣'])),
    sourceUrl: readTextByCandidates(fields, record, ['鍘熷晢鍝侀摼鎺?], true),
    offerUrl: readTextByCandidates(fields, record, ['鎺ㄨ崘1688閾炬帴', '1688閾炬帴'], true),
    purchaseCost: readNumberByCandidates(fields, record, ['閲囪喘鎬绘垚鏈?]),
    unifiedSourcePrice: readNumberByCandidates(fields, record, ['缁熶竴璐ф簮浠锋牸']),
    displayPrice: readPositiveNumberByCandidates(fields, record, ['鏈湴灞曠ず浠?, '灞曠ず浠锋牸', '灞曠ず浠?]),
    editTitle: readTextByCandidates(fields, record, ['缂栬緫鏍囬']),
    weightGram: readNumberByCandidates(fields, record, ['鍖呰９閲嶉噺g', '鍏嬮噸']),
    lengthCm: readNumberByCandidates(fields, record, ['鍖呰９闀垮害cm']),
    widthCm: readNumberByCandidates(fields, record, ['鍖呰９瀹藉害cm']),
    heightCm: readNumberByCandidates(fields, record, ['鍖呰９楂樺害cm']),
    targetShopId: readTextByCandidates(fields, record, ['鐩爣搴楅摵ID']),
    targetShopName: readTextByCandidates(fields, record, ['鐩爣搴楅摵鍚嶇О']),
    targetShopSite: normalizeSite(readTextByCandidates(fields, record, ['鐩爣搴楅摵绔欑偣', '搴楅摵绔欑偣', '鐩爣绔欑偣'])),
    targetSiteCategory: readTextByCandidates(fields, record, targetSiteCategoryFieldCandidates),
    targetCategoryId: readTextByCandidates(fields, record, ['鐩爣绫荤洰ID', '鐩爣绫荤洰id', '绫荤洰ID', 'cid']),
    miaoshouCategoryPath: readTextByCandidates(fields, record, ['濡欐墜绫荤洰璺緞']),
    categoryMatchStatus: readTextByCandidates(fields, record, ['绫荤洰鍖归厤鐘舵€?]),
    categoryFailureReason: readTextByCandidates(fields, record, ['绫荤洰澶辫触鍘熷洜']),
    sizeChartStatus: readTextByCandidates(fields, record, ['灏虹爜琛ㄧ姸鎬?]),
    editModel: readTextByCandidates(fields, record, ['缂栬緫妯″紡', 'editModel']),
    commonCollectBoxId: readTextByCandidates(fields, record, ['鍏叡閲囬泦绠盜D', '濡欐墜鍏叡閲囬泦绠盜D']),
    tiktokCollectBoxId: readTextByCandidates(fields, record, ['TikTok閲囬泦绠盜D', '濡欐墜TikTok閲囬泦绠盜D']),
    skuCount: readNumberByCandidates(fields, record, ['SKU鏁伴噺']),
    collectStatus: readTextByCandidates(fields, record, ['閲囬泦鐘舵€?]),
    claimStatus: readTextByCandidates(fields, record, ['璁ら鐘舵€?]),
    shopClaimStatus: readTextByCandidates(fields, record, ['搴楅摵璁ら鐘舵€?]),
    editStatus: readTextByCandidates(fields, record, ['缂栬緫鐘舵€?]),
    publishReadyStatus: readTextByCandidates(fields, record, ['鍙戝竷鍑嗗鐘舵€?]),
    publishVerifyStatus: readTextByCandidates(fields, record, ['鍙戝竷澶嶆牳鐘舵€?]),
    miaoshouPublishStatus: readTextByCandidates(fields, record, ['濡欐墜鍙戝竷鐘舵€?]),
    miaoshouPublishTaskId: readTextByCandidates(fields, record, ['濡欐墜鍙戝竷浠诲姟ID']),
    tiktokProductId: readTextByCandidates(fields, record, ['TikTok鍟嗗搧ID', 'TikTok鍟嗗搧id']),
    publishedProductUrl: readTextByCandidates(fields, record, ['宸插彂甯冨晢鍝侀摼鎺?, 'TikTok鍟嗗搧閾炬帴'], true),
    maintenanceStatus: readTextByCandidates(fields, record, ['缁存姢鐘舵€?]),
    maintenanceNote: readTextByCandidates(fields, record, ['缁存姢澶囨敞']),
    failureReason: readTextByCandidates(fields, record, ['澶辫触鍘熷洜', '澶辫触褰掑洜']),
  };
}

function buildListingEditKey(productId: string, site: string, shopId: string) {
  return [productId.trim(), normalizeSite(site), shopId.trim()].filter(Boolean).join('__');
}

function resolveCollectSourceItemId(input: {
  configuredSourceItemId: string;
  offerId: string;
  offerUrl: string;
  sourceUrl: string;
  productId: string;
}) {
  const configured = input.configuredSourceItemId.trim();
  const offerId = input.offerId.trim() || extractOfferIdFromUrl(input.offerUrl);
  if (configured && !configured.startsWith('img_')) {
    return configured;
  }

  return offerId || parseTikTokProductUrl(input.sourceUrl).productId || input.productId.trim();
}

function resolveListingTargetShop(input: {
  site: string;
  defaultShopId: string;
  defaultShopName: string;
  defaultShopSite: string;
  mappings?: ListingShopMapping[];
}) {
  const site = normalizeSite(input.site);
  const matched = (input.mappings ?? []).find((mapping) => normalizeSite(mapping.site) === site && mapping.shopId.trim());
  if (matched) {
    return {
      shopId: matched.shopId.trim(),
      shopName: matched.shopName.trim(),
      site: normalizeSite(matched.site) || site,
    };
  }

  return {
    shopId: input.defaultShopId.trim(),
    shopName: input.defaultShopName.trim(),
    site: normalizeSite(input.defaultShopSite || site),
  };
}

function buildListingEditBaseValues(
  row: PriceReviewRecord,
  input: {
    key: string;
    targetShopId: string;
    targetShopName: string;
    targetShopSite?: string;
    targetCategoryId?: string;
    existingRow?: ListingEditRecord | null;
  },
) {
  const size = parseDimensionCm(input.existingRow
    ? [input.existingRow.lengthCm, input.existingRow.widthCm, input.existingRow.heightCm].join('*')
    : row.dimensions);
  const unifiedSourcePrice =
    typeof input.existingRow?.unifiedSourcePrice === 'number'
      ? input.existingRow.unifiedSourcePrice
      : row.purchaseCost;
  const displayPrice =
    input.existingRow?.editStatus === '宸叉彁浜ゅ彂甯? && typeof input.existingRow.displayPrice === 'number'
      ? input.existingRow.displayPrice
      : typeof row.displayPrice === 'number'
        ? row.displayPrice
        : input.existingRow?.displayPrice;
  const weightGram =
    typeof input.existingRow?.weightGram === 'number'
      ? input.existingRow.weightGram
      : row.weightGram;

  return {
    鍏宠仈閿? input.key,
    鍟嗗搧ID: row.productId,
    '鍥藉/绔欑偣': normalizeSite(row.site),
    姣斾环鎵规鍙? row.batchId,
    琛ㄤ笁璁板綍ID: row.recordId,
    鍘熷晢鍝侀摼鎺? row.sourceUrl,
    鎺ㄨ崘1688閾炬帴: row.offerUrl,
    offerId: row.offerId || extractOfferIdFromUrl(row.offerUrl),
    閲囬泦婧愯揣婧怚D: row.collectSourceItemId || row.offerId || extractOfferIdFromUrl(row.offerUrl) || parseTikTokProductUrl(row.sourceUrl).productId || row.productId,
    閲囪喘鎬绘垚鏈? row.purchaseCost,
    缁熶竴璐ф簮浠锋牸: unifiedSourcePrice,
    灞曠ず浠锋牸: displayPrice,
    鏈湴灞曠ず浠? displayPrice,
    鍖呰９閲嶉噺g: weightGram,
    鍖呰９闀垮害cm: size.length,
    鍖呰９瀹藉害cm: size.width,
    鍖呰９楂樺害cm: size.height,
    鐩爣搴楅摵ID: input.targetShopId,
    鐩爣搴楅摵鍚嶇О: input.targetShopName,
    鐩爣搴楅摵绔欑偣: input.existingRow?.targetShopSite || normalizeSite(input.targetShopSite),
    鐩爣绔欑偣绫荤洰: input.existingRow?.targetSiteCategory || row.targetSiteCategory,
    鐩爣绫荤洰ID: input.existingRow?.targetCategoryId || input.targetCategoryId || '',
    濡欐墜绫荤洰璺緞: input.existingRow?.miaoshouCategoryPath || '',
    绫荤洰鍖归厤鐘舵€? input.existingRow?.categoryMatchStatus || '',
    绫荤洰澶辫触鍘熷洜: input.existingRow?.categoryFailureReason || '',
    灏虹爜琛ㄧ姸鎬? input.existingRow?.sizeChartStatus || '',
    缂栬緫妯″紡: input.existingRow?.editModel || '',
    閲囬泦鐘舵€? input.existingRow?.collectStatus || '寰呴噰闆?,
    璁ら鐘舵€? input.existingRow?.claimStatus || '寰呴噰闆?,
    搴楅摵璁ら鐘舵€? input.existingRow?.shopClaimStatus || '寰呴噰闆?,
    缂栬緫鐘舵€? input.existingRow?.editStatus || '寰呴噰闆?,
    鍙戝竷鍑嗗鐘舵€? input.existingRow?.publishReadyStatus || '',
    鍙戝竷澶嶆牳鐘舵€? input.existingRow?.publishVerifyStatus || '',
    濡欐墜鍙戝竷鐘舵€? input.existingRow?.miaoshouPublishStatus || '',
    濡欐墜鍙戝竷浠诲姟ID: input.existingRow?.miaoshouPublishTaskId || '',
    TikTok鍟嗗搧ID: input.existingRow?.tiktokProductId || '',
    宸插彂甯冨晢鍝侀摼鎺? input.existingRow?.publishedProductUrl || '',
    缁存姢鐘舵€? input.existingRow?.maintenanceStatus || '',
    缁存姢澶囨敞: input.existingRow?.maintenanceNote || '',
  };
}

function getReviewCollectUrl(row: PriceReviewRecord) {
  return row.sourceUrl || row.offerUrl;
}

function buildFieldsByNamesAllowEmpty(fields: FeishuField[], values: Record<string, unknown>, emptyFieldNames: string[]) {
  const output = buildFieldsByNames(fields, values);
  for (const name of emptyFieldNames) {
    const field = findFieldByName(fields, name);
    if (!field || !(name in values)) {
      continue;
    }
    const fieldName = getFeishuFieldName(field);
    if (fieldName) {
      const value = values[name];
      if (field.type === 15 && String(value ?? '').trim() === '') {
        continue;
      }
      output[fieldName] = normalizeValueForField(value, field);
    }
  }
  return output;
}

function normalizeSite(value: string | undefined) {
  return (value ?? '').trim().toUpperCase();
}

function parseListingShippingFormulaConfig(value: string) {
  const formulas = new Map<string, ListingShippingFormula>();
  for (const rawLine of value.split(/\r?\n|;/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    const firstPipeIndex = line.indexOf('|');
    const firstEqualIndex = line.indexOf('=');
    const [rawSite = '', rawConfig = ''] = firstPipeIndex >= 0 && (firstEqualIndex < 0 || firstPipeIndex < firstEqualIndex)
      ? [line.slice(0, firstPipeIndex), line.slice(firstPipeIndex + 1)]
      : line.split(/=(.*)/s);
    const site = normalizeSite(rawSite);
    if (!site) {
      continue;
    }
    const parts = rawConfig
      .split('|')
      .map((part) => part.trim())
      .filter(Boolean);
    const currency = parts[0] && !parts[0].includes('=') && !['fixed', 'firstWeight'].includes(parts[0])
      ? normalizeSite(parts[0])
      : '';
    const configParts = currency ? parts.slice(1) : parts;
    const type = configParts[0] === 'fixed' ? 'fixed' : 'firstWeight';
    const values = new Map<string, string>();
    for (const part of configParts.slice(type === 'fixed' ? 1 : 0)) {
      const [key = '', partValue = ''] = part.split(/=(.*)/s);
      values.set(key.trim().toLowerCase(), partValue.trim());
    }
    formulas.set(site, {
      site,
      currency,
      type,
      firstWeightGram: parsePositiveNumber(values.get('first')) || 0,
      firstFee: parsePositiveNumber(values.get('firstfee')) || 0,
      stepGram: parsePositiveNumber(values.get('step')) || 1,
      stepFee: parsePositiveNumber(values.get('stepfee')) || 0,
      fixedFee: parsePositiveNumber(values.get('fee')) || 0,
      minFee: parseOptionalNumber(values.get('min')),
      maxFee: parseOptionalNumber(values.get('max')),
    });
  }
  return formulas;
}

function calculateListingShippingCost(weightGram: number, formula: ListingShippingFormula) {
  const weight = Math.max(0, weightGram);
  let cost = 0;
  if (formula.type === 'fixed') {
    cost = formula.fixedFee;
  } else {
    const extraWeight = Math.max(0, weight - formula.firstWeightGram);
    const extraSteps = formula.stepGram > 0 ? Math.ceil(extraWeight / formula.stepGram) : 0;
    cost = formula.firstFee + extraSteps * formula.stepFee;
  }
  if (typeof formula.minFee === 'number') {
    cost = Math.max(cost, formula.minFee);
  }
  if (typeof formula.maxFee === 'number') {
    cost = Math.min(cost, formula.maxFee);
  }
  return Math.round(cost * 100) / 100;
}

function parsePositiveNumber(value: string | undefined) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : 0;
}

function parseOptionalNumber(value: string | undefined): number | '' {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : '';
}

function normalizeInputCountry(value: string | undefined) {
  const normalized = (value ?? '').trim();
  return /^[a-z]{2}$/i.test(normalized) ? normalized : '';
}

function getOptionalLimit(value: unknown) {
  const limit = Number(value);
  return Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : Number.POSITIVE_INFINITY;
}

function parseDimensionCm(value: string) {
  const numbers = String(value || '').match(/\d+(?:\.\d+)?/g)?.map(Number).filter((item) => Number.isFinite(item) && item > 0) ?? [];
  return {
    length: numbers[0] || 10,
    width: numbers[1] || 10,
    height: numbers[2] || 10,
  };
}

function clonePlainObject(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value ?? {})) as Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function extractShopCollectPayload(value: unknown) {
  const record = asRecord(value) ?? {};
  const shopCollectItemInfo =
    asRecord(record.shopCollectItemInfo) ??
    asRecord(record.itemInfo) ??
    asRecord(record.detail) ??
    findNestedRecord(record, 'shopCollectItemInfo');
  const siteCollectItemInfo =
    asRecord(record.siteCollectItemInfo) ??
    findNestedRecord(record, 'siteCollectItemInfo');
  return {
    ossMd5: String(record.ossMd5 ?? findNestedValue(record, 'ossMd5') ?? ''),
    editModel: String(record.editModel ?? findNestedValue(record, 'editModel') ?? ''),
    shopCollectItemInfo,
    siteCollectItemInfo,
  };
}

async function readMiaoshouEditablePayload(input: {
  detailId: string | number;
  shopId: string | number;
  site: string;
  preferredMode?: string;
  getShopCollectItemInfo: (input: { detailId: string | number; shopId: string | number }) => Promise<unknown>;
  getSiteCollectItemInfo: (input: { detailId: string | number; site: string }) => Promise<unknown>;
}) {
  const preferredMode = String(input.preferredMode || '').toLowerCase();
  if (preferredMode === 'site') {
    const siteDetail = await input.getSiteCollectItemInfo({ detailId: input.detailId, site: input.site });
    const sitePayload = extractShopCollectPayload(siteDetail);
    return {
      mode: 'site',
      ossMd5: sitePayload.ossMd5,
      itemInfo: sitePayload.siteCollectItemInfo,
    } as const;
  }

  try {
    const shopDetail = await input.getShopCollectItemInfo({ detailId: input.detailId, shopId: input.shopId });
    const shopPayload = extractShopCollectPayload(shopDetail);
    if (shopPayload.shopCollectItemInfo) {
      return {
        mode: 'shop',
        ossMd5: shopPayload.ossMd5,
        itemInfo: shopPayload.shopCollectItemInfo,
      } as const;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/鏈€夋嫨棰勫彂甯冨簵閾簗宸茶鍒犻櫎|涓嶅瓨鍦▅澶辨晥|site/i.test(message)) {
      throw error;
    }
  }

  const siteDetail = await input.getSiteCollectItemInfo({ detailId: input.detailId, site: input.site });
  const sitePayload = extractShopCollectPayload(siteDetail);
  return {
    mode: 'site',
    ossMd5: sitePayload.ossMd5,
    itemInfo: sitePayload.siteCollectItemInfo,
  } as const;
}

async function pollMiaoshouEditablePayloadWithCategory(input: Parameters<typeof readMiaoshouEditablePayload>[0]) {
  let payload = await readMiaoshouEditablePayload(input);
  if (payload.itemInfo && hasMiaoshouCategory(payload.itemInfo)) {
    return payload;
  }

  await delay(10_000);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (attempt > 0) {
      await delay(5_000);
    }
    payload = await readMiaoshouEditablePayload(input);
    if (payload.itemInfo && hasMiaoshouCategory(payload.itemInfo)) {
      return payload;
    }
  }

  return payload;
}

async function resolveAndPersistMiaoshouCategory(input: {
  detailId: string | number;
  shopId: string | number;
  site: string;
  detailPayload: Awaited<ReturnType<typeof readMiaoshouEditablePayload>>;
  shopCollectItemInfo: unknown;
  targetSiteCategory: string;
  weightGram?: number | '';
  dimensions?: string;
  categoryTreeCacheJson?: string;
  sizeChartImageUrl?: string;
  requiredAttributeDefaults?: string;
  getCategoryTreeBySite?: (site: string) => Promise<MiaoshouCategoryNode[]>;
  getCategoryMetadata?: (input: { site: string; cid: string; shopIds: Array<string | number> }) => Promise<unknown>;
  saveShopCollectItemInfo?: (input: {
    detailId: string | number;
    shopId: string | number;
    ossMd5: string;
    shopCollectItemInfo: unknown;
  }) => Promise<unknown>;
}) {
  const shopInfo = asRecord(input.shopCollectItemInfo);
  if (!shopInfo) {
    return buildCategoryResolutionFailure('濡欐墜璇︽儏璇诲彇澶辫触', '', '', '绫荤洰鍖归厤澶辫触', '');
  }

  const existingCid = String(shopInfo.cid ?? '').trim();
  let categoryId = existingCid;
  let categoryPath = '';
  let matchStatus = existingCid ? '濡欐墜宸茶嚜鍔ㄥ尮閰嶇被鐩? : '';
  let shouldSave = false;

  if (!categoryId) {
    const targetCategory = input.targetSiteCategory.trim();
    if (!targetCategory) {
      return buildCategoryResolutionFailure('鐩爣绔欑偣绫荤洰涓虹┖', '', '', '鐩爣绔欑偣绫荤洰涓虹┖', '');
    }

    const categories = await loadMiaoshouCategories({
      site: input.site,
      cacheJson: input.categoryTreeCacheJson,
      getCategoryTreeBySite: input.getCategoryTreeBySite,
    });
    if (categories.length === 0) {
      return buildCategoryResolutionFailure('鏈懡涓洰鏍囩珯鐐圭被鐩?, '', '', '鏈懡涓洰鏍囩珯鐐圭被鐩?, '');
    }

    const match = matchMiaoshouCategory(targetCategory, categories);
    if (!match.ok) {
      return buildCategoryResolutionFailure(match.reason, '', match.categoryPath, match.status, '');
    }

    categoryId = match.category.cid;
    categoryPath = match.category.pathChinese || match.category.path || match.category.nameChinese || match.category.name;
    matchStatus = '宸叉寜鐩爣绔欑偣绫荤洰鍖归厤';
    shopInfo.cid = categoryId;
    shouldSave = true;
  }

  const metadataResult = await resolveMiaoshouCategoryMetadata({
    site: input.site,
    cid: categoryId,
    shopId: input.shopId,
    shopInfo,
    sizeChartImageUrl: input.sizeChartImageUrl,
    requiredAttributeDefaults: input.requiredAttributeDefaults,
    getCategoryMetadata: input.getCategoryMetadata,
  });
  if (!metadataResult.ok) {
    return buildCategoryResolutionFailure(
      metadataResult.failureReason,
      categoryId,
      categoryPath,
      matchStatus,
      metadataResult.sizeChartStatus,
    );
  }
  shouldSave ||= metadataResult.changed;

  if (shouldSave) {
    if (!input.saveShopCollectItemInfo || !input.detailPayload.ossMd5) {
      return buildCategoryResolutionFailure('绫荤洰宸插尮閰嶄絾缂哄皯淇濆瓨鎺ュ彛鎴杘ssMd5', categoryId, categoryPath, matchStatus, metadataResult.sizeChartStatus);
    }
    applyRequiredMiaoshouSaveDefaults(shopInfo, {
      weightGram: input.weightGram,
      dimensions: input.dimensions,
    });
    sanitizeMiaoshouShopInfoBeforeSave(shopInfo);
    try {
      await input.saveShopCollectItemInfo({
        detailId: input.detailId,
        shopId: input.shopId,
        ossMd5: input.detailPayload.ossMd5,
        shopCollectItemInfo: shopInfo,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isMiaoshouRequiredAttributeError(message)) {
        return buildCategoryResolutionFailure(
          normalizeMiaoshouRequiredAttributeReason(message),
          categoryId,
          categoryPath,
          matchStatus,
          metadataResult.sizeChartStatus,
        );
      }
      throw error;
    }
  }

  return {
    ok: true,
    categoryId,
    categoryPath,
    matchStatus,
    failureReason: '',
    sizeChartStatus: metadataResult.sizeChartStatus,
  };
}

function buildCategoryResolutionFailure(
  failureReason: string,
  categoryId: string,
  categoryPath: string,
  matchStatus: string,
  sizeChartStatus: string,
) {
  return {
    ok: false,
    categoryId,
    categoryPath,
    matchStatus,
    failureReason,
    sizeChartStatus,
  };
}

function isMiaoshouRequiredAttributeError(message: string) {
  return /浜у搧灞炴€с€怺^銆慮+銆戝繀濉珅灞炴€с€怺^銆慮+銆戝繀濉珅蹇呭～灞炴€璇峰～鍐欏悗閲嶈瘯/.test(message);
}

function normalizeMiaoshouRequiredAttributeReason(message: string) {
  const names = [...message.matchAll(/銆?[^銆慮+)銆?g)]
    .map((match) => match[1]?.trim())
    .filter(Boolean);
  const fieldText = names.length > 0 ? names.join('銆?) : '蹇呭～灞炴€?;
  return `濡欐墜绫荤洰蹇呭～灞炴€х己澶憋細${fieldText}锛岄渶浜哄伐鍦ㄥ鎵嬭ˉ鍏呭悗閲嶈瘯`;
}

async function loadMiaoshouCategories(input: {
  site: string;
  cacheJson?: string;
  getCategoryTreeBySite?: (site: string) => Promise<MiaoshouCategoryNode[]>;
}) {
  const site = normalizeSite(input.site);
  const cached = parseMiaoshouCategoryCache(input.cacheJson)[site];
  if (cached?.length) {
    return cached;
  }
  return input.getCategoryTreeBySite ? input.getCategoryTreeBySite(site) : [];
}

function parseMiaoshouCategoryCache(value?: string) {
  try {
    const parsed = JSON.parse(value || '{}') as Record<string, unknown>;
    const output: Record<string, MiaoshouCategoryNode[]> = {};
    for (const [site, categories] of Object.entries(parsed)) {
      if (Array.isArray(categories)) {
        output[normalizeSite(site)] = categories.filter(isMiaoshouCategoryNode);
      }
    }
    return output;
  } catch {
    return {};
  }
}

function isMiaoshouCategoryNode(value: unknown): value is MiaoshouCategoryNode {
  return Boolean(value && typeof value === 'object' && String((value as Record<string, unknown>).cid ?? '').trim());
}

function matchMiaoshouCategory(targetCategory: string, categories: MiaoshouCategoryNode[]) {
  const normalizedTarget = normalizeCategoryText(targetCategory);
  if (!normalizedTarget) {
    return { ok: false as const, reason: '鐩爣绔欑偣绫荤洰涓虹┖', status: '鐩爣绔欑偣绫荤洰涓虹┖', categoryPath: '' };
  }

  const scored = categories
    .map((category) => ({
      category,
      score: scoreCategoryMatch(normalizedTarget, category),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);
  if (scored.length === 0) {
    return { ok: false as const, reason: '鏈懡涓洰鏍囩珯鐐圭被鐩?, status: '鏈懡涓洰鏍囩珯鐐圭被鐩?, categoryPath: '' };
  }

  const bestScore = scored[0].score;
  const best = scored.filter((item) => item.score === bestScore);
  const usable = best.filter((item) => item.category.isLastLevel && !item.category.disabled);
  if (usable.length === 0) {
    const first = best[0].category;
    if (!first.isLastLevel) {
      return { ok: false as const, reason: '鍛戒腑绫荤洰涓嶆槸鏈骇', status: '鍛戒腑绫荤洰涓嶆槸鏈骇', categoryPath: first.pathChinese || first.path };
    }
    if (first.disabled) {
      return { ok: false as const, reason: '鍛戒腑绫荤洰宸茬鐢?, status: '鍛戒腑绫荤洰宸茬鐢?, categoryPath: first.pathChinese || first.path };
    }
  }
  if (usable.length > 1) {
    return { ok: false as const, reason: '鍛戒腑澶氫釜绫荤洰', status: '鍛戒腑澶氫釜绫荤洰', categoryPath: usable.map((item) => item.category.pathChinese || item.category.path).join('锛?) };
  }

  return { ok: true as const, category: usable[0].category };
}

function normalizeCategoryText(value: string) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[>锛?\\|锝淽+/g, '>')
    .replace(/\s+/g, '')
    .replace(/[锛?銆?锛?锛?]/g, '');
}

function scoreCategoryMatch(normalizedTarget: string, category: MiaoshouCategoryNode) {
  const candidates = [
    category.pathChinese,
    category.nameChinese,
    category.path,
    category.name,
  ].map(normalizeCategoryText).filter(Boolean);
  let score = 0;
  for (const candidate of candidates) {
    if (candidate === normalizedTarget) {
      score = Math.max(score, 1000 + candidate.length);
    } else if (candidate.endsWith(normalizedTarget) || normalizedTarget.endsWith(candidate)) {
      score = Math.max(score, 700 + Math.min(candidate.length, normalizedTarget.length));
    } else if (candidate.includes(normalizedTarget) || normalizedTarget.includes(candidate)) {
      score = Math.max(score, 500 + Math.min(candidate.length, normalizedTarget.length));
    }
  }
  return score;
}

async function resolveMiaoshouCategoryMetadata(input: {
  site: string;
  cid: string;
  shopId: string | number;
  shopInfo: Record<string, unknown>;
  sizeChartImageUrl?: string;
  requiredAttributeDefaults?: string;
  getCategoryMetadata?: (input: { site: string; cid: string; shopIds: Array<string | number> }) => Promise<unknown>;
}) {
  if (!input.getCategoryMetadata) {
    return { ok: true, changed: false, sizeChartStatus: '鏈鍙栫被鐩厓鏁版嵁', failureReason: '' };
  }
  let metadata: unknown;
  try {
    metadata = await input.getCategoryMetadata({ site: input.site, cid: input.cid, shopIds: [input.shopId] });
  } catch {
    return { ok: false, changed: false, sizeChartStatus: '', failureReason: '绫荤洰鍏冩暟鎹鍙栧け璐? };
  }
  if (isCategoryUnavailableForShop(metadata)) {
    return { ok: false, changed: false, sizeChartStatus: '', failureReason: '鐩爣搴楅摵鏈紑閫氳绫荤洰' };
  }

  const defaultAttributesResult = applyConfiguredRequiredAttributeDefaults({
    site: input.site,
    cid: input.cid,
    metadata,
    shopInfo: input.shopInfo,
    requiredAttributeDefaults: input.requiredAttributeDefaults,
  });
  if (!defaultAttributesResult.ok) {
    return {
      ok: false,
      changed: false,
      sizeChartStatus: '',
      failureReason: defaultAttributesResult.failureReason,
    };
  }

  const missingMandatoryAttrs = getMissingMandatoryProductAttributes(metadata, input.shopInfo);
  if (missingMandatoryAttrs.length > 0) {
    return {
      ok: false,
      changed: false,
      sizeChartStatus: '',
      failureReason: `濡欐墜绫荤洰蹇呭～灞炴€х己澶憋細${missingMandatoryAttrs.join('銆?)}锛岄渶浜哄伐鍦ㄥ鎵嬭ˉ鍏呭悗閲嶈瘯`,
    };
  }

  const sizeChartRequired = isSizeChartRequired(metadata);
  if (!sizeChartRequired) {
    return { ok: true, changed: defaultAttributesResult.changed, sizeChartStatus: '灏虹爜琛ㄩ潪蹇呭～', failureReason: '' };
  }
  const imageUrl = String(input.sizeChartImageUrl ?? '').trim();
  if (!imageUrl) {
    return { ok: false, changed: false, sizeChartStatus: '灏虹爜琛ㄥ繀濉絾鏈厤缃甎RL', failureReason: '灏虹爜琛ㄥ繀濉絾鏈厤缃甎RL' };
  }
  if (!/^https?:\/\//i.test(imageUrl) || !/\.(jpe?g|png)(?:$|[?#])/i.test(imageUrl)) {
    return { ok: false, changed: false, sizeChartStatus: '灏虹爜琛║RL鏍煎紡涓嶆敮鎸?, failureReason: '灏虹爜琛║RL鏍煎紡涓嶆敮鎸? };
  }
  input.shopInfo.sizeChartType = 'image';
  input.shopInfo.sizeChart = imageUrl;
  return { ok: true, changed: true, sizeChartStatus: '宸插啓鍏ュ昂鐮佽〃URL', failureReason: '' };
}

type RequiredAttributeDefaultMapping = {
  site: string;
  cid: string;
  attrName: string;
  valueName: string;
};

function applyConfiguredRequiredAttributeDefaults(input: {
  site: string;
  cid: string;
  metadata: unknown;
  shopInfo: Record<string, unknown>;
  requiredAttributeDefaults?: string;
}) {
  const productAttrs = findNestedValue(input.metadata, 'categoryProductAttrList');
  if (!Array.isArray(productAttrs)) {
    return { ok: true as const, changed: false, failureReason: '' };
  }
  const mappings = parseMiaoshouRequiredAttributeDefaults(input.requiredAttributeDefaults);
  if (mappings.length === 0) {
    return { ok: true as const, changed: false, failureReason: '' };
  }

  const currentAttrs = Array.isArray(input.shopInfo.productAttributes)
    ? input.shopInfo.productAttributes.map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item))
    : [];
  let changed = false;

  for (const attr of productAttrs.map(asRecord)) {
    if (!attr || !isTruthyMiaoshouFlag(attr.isMandatory) || hasFilledProductAttribute(currentAttrs, attr)) {
      continue;
    }

    const mapping = findConfiguredDefaultForAttribute({
      site: input.site,
      cid: input.cid,
      attr,
      mappings,
    });
    if (!mapping) {
      continue;
    }

    const options = extractMiaoshouAttributeOptions(attr);
    const option = options.find((item) => normalizeAttributeText(item.valueName) === normalizeAttributeText(mapping.valueName));
    const attrName = getProductAttributeDisplayName(attr) || mapping.attrName;
    if (!option) {
      return {
        ok: false as const,
        changed,
        failureReason: `${attrName}默认值未命中妙手选项`,
      };
    }

    currentAttrs.push(buildMiaoshouProductAttributeValue(attr, option));
    changed = true;
  }

  if (changed) {
    input.shopInfo.productAttributes = currentAttrs;
  }
  return { ok: true as const, changed, failureReason: '' };
}

function parseMiaoshouRequiredAttributeDefaults(value?: string): RequiredAttributeDefaultMapping[] {
  return String(value ?? '')
    .split(/\r?\n|;/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const normalizedLine = line.replace(/｜/g, '|').replace(/＝/g, '=');
      const match = normalizedLine.match(/^([^|]+)\|([^|]+)\|([^=]+)=(.+)$/);
      if (!match) {
        return null;
      }
      return {
        site: normalizeSite(match[1]),
        cid: match[2].trim(),
        attrName: match[3].trim(),
        valueName: match[4].trim(),
      };
    })
    .filter((item): item is RequiredAttributeDefaultMapping => Boolean(item?.site && item.cid && item.attrName && item.valueName));
}

function findConfiguredDefaultForAttribute(input: {
  site: string;
  cid: string;
  attr: Record<string, unknown>;
  mappings: RequiredAttributeDefaultMapping[];
}) {
  const attrIdentities = [
    input.attr.attrId,
    input.attr.attributeId,
    input.attr.id,
    input.attr.attributeNameAlias,
    input.attr.attributeName,
    input.attr.name,
    input.attr.attrName,
  ].map((value) => normalizeAttributeText(String(value ?? ''))).filter(Boolean);

  return input.mappings.find((mapping) => (
    normalizeSite(mapping.site) === normalizeSite(input.site) &&
    String(mapping.cid).trim() === String(input.cid).trim() &&
    attrIdentities.includes(normalizeAttributeText(mapping.attrName))
  ));
}

function extractMiaoshouAttributeOptions(attr: Record<string, unknown>) {
  const candidateLists = [
    attr.values,
    attr.valueList,
    attr.attrValueList,
    attr.optionList,
    attr.options,
    attr.attributeValueList,
  ];
  const output: Array<{ valueId: string; valueName: string }> = [];
  for (const list of candidateLists) {
    if (!Array.isArray(list)) {
      continue;
    }
    for (const value of list) {
      const record = asRecord(value);
      if (!record) {
        continue;
      }
      const valueId = String(record.valueId ?? record.id ?? record.attrValueId ?? record.optionId ?? '').trim();
      const valueName = String(record.valueName ?? record.name ?? record.valueNameAlias ?? record.attrValue ?? record.optionName ?? record.label ?? '').trim();
      if (valueName) {
        output.push({ valueId, valueName });
      }
    }
  }
  return output.filter((item, index, list) => (
    list.findIndex((candidate) => candidate.valueId === item.valueId && candidate.valueName === item.valueName) === index
  ));
}

function buildMiaoshouProductAttributeValue(attr: Record<string, unknown>, option: { valueId: string; valueName: string }) {
  const attributeId = String(attr.attrId ?? attr.attributeId ?? attr.id ?? '').trim();
  const attributeName = String(attr.name ?? attr.attrName ?? attr.attributeName ?? attr.attributeNameAlias ?? attributeId).trim();
  const attributeNameAlias = String(attr.attributeNameAlias ?? attributeName).trim();
  return {
    attributeId,
    attributeName,
    attributeNameAlias,
    attributeValues: [
      {
        valueName: option.valueName,
        valueId: option.valueId,
      },
    ],
  };
}

function normalizeAttributeText(value: string) {
  return value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

function getMissingMandatoryProductAttributes(metadata: unknown, shopInfo: Record<string, unknown>) {
  const productAttrs = findNestedValue(metadata, 'categoryProductAttrList');
  if (!Array.isArray(productAttrs)) {
    return [];
  }
  const currentAttrs = Array.isArray(shopInfo.productAttributes)
    ? shopInfo.productAttributes.map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item))
    : [];

  return productAttrs
    .map(asRecord)
    .filter((attr): attr is Record<string, unknown> => Boolean(attr && isTruthyMiaoshouFlag(attr.isMandatory)))
    .filter((attr) => !hasFilledProductAttribute(currentAttrs, attr))
    .map(getProductAttributeDisplayName)
    .filter(Boolean);
}

function hasFilledProductAttribute(currentAttrs: Record<string, unknown>[], requiredAttr: Record<string, unknown>) {
  const requiredId = String(requiredAttr.attrId ?? requiredAttr.attributeId ?? requiredAttr.id ?? '').trim();
  const requiredNames = [
    requiredAttr.attributeNameAlias,
    requiredAttr.attributeName,
    requiredAttr.name,
    requiredAttr.attrName,
  ].map((value) => normalizeCategoryText(String(value ?? ''))).filter(Boolean);

  return currentAttrs.some((attr) => {
    const attrId = String(attr.attrId ?? attr.attributeId ?? attr.attributeId ?? attr.id ?? '').trim();
    const attrNames = [
      attr.attributeNameAlias,
      attr.attributeName,
      attr.name,
      attr.attrName,
    ].map((value) => normalizeCategoryText(String(value ?? ''))).filter(Boolean);
    const identityMatched =
      (requiredId && attrId === requiredId) ||
      requiredNames.some((name) => attrNames.includes(name));
    return identityMatched && hasProductAttributeValue(attr);
  });
}

function hasProductAttributeValue(attr: Record<string, unknown>) {
  const values = [
    attr.valueId,
    attr.valueName,
    attr.value,
    attr.attrValueId,
    attr.attrValue,
    attr.customizedValue,
    attr.customValue,
  ];
  if (values.some((value) => String(value ?? '').trim())) {
    return true;
  }
  const valueList = attr.attributeValues ?? attr.values ?? attr.valueList ?? attr.attrValueList;
  return Array.isArray(valueList) && valueList.length > 0;
}

function getProductAttributeDisplayName(attr: Record<string, unknown>) {
  return String(attr.attributeNameAlias ?? attr.name ?? attr.attrName ?? attr.attrId ?? '').trim();
}

function isSizeChartRequired(value: unknown) {
  const sizeChartRequired = findNestedValue(value, 'sizeChartIsRequired');
  if (isTruthyMiaoshouFlag(sizeChartRequired)) {
    return true;
  }
  const required = String(findNestedValue(value, 'required') ?? '').toLowerCase();
  const name = String(findNestedValue(value, 'sizeChart') ?? '');
  return Boolean(required && name);
}

function isCategoryUnavailableForShop(value: unknown) {
  const disabled = findNestedValue(value, 'disabled');
  const available = findNestedValue(value, 'available');
  const support = findNestedValue(value, 'support');
  return isTruthyMiaoshouFlag(disabled) || available === false || support === false;
}

function isTruthyMiaoshouFlag(value: unknown) {
  if (typeof value === 'boolean') {
    return value;
  }
  return ['1', 'true', 'yes', 'y'].includes(String(value ?? '').trim().toLowerCase());
}

function findNestedRecord(value: unknown, key: string): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const direct = asRecord(record[key]);
  if (direct) {
    return direct;
  }
  for (const nested of Object.values(record)) {
    const found = findNestedRecord(nested, key);
    if (found) {
      return found;
    }
  }
  return null;
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

function extractStringFromNestedKeys(value: unknown, keys: string[]) {
  for (const key of keys) {
    const candidate = findNestedValue(value, key);
    if (typeof candidate === 'string' || typeof candidate === 'number') {
      const text = String(candidate).trim();
      if (text) {
        return text;
      }
    }
  }
  return '';
}

function extractRemotePublishStatus(value: unknown) {
  return extractStringFromNestedKeys(value, [
    'publishStatus',
    'productStatus',
    'statusName',
    'status',
    'moveStatus',
  ]);
}

function extractPublishedProductUrl(value: unknown) {
  const url = extractStringFromNestedKeys(value, [
    'productUrl',
    'publishedProductUrl',
    'tiktokProductUrl',
    'platformProductUrl',
    'onlineProductUrl',
    'url',
  ]);
  return /^https?:\/\//i.test(url) ? url : '';
}

function uniqueNonEmptyStrings(values: Array<string | undefined>) {
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))];
}

async function pollCommonCollectBoxDetail(
  detailId: string | number,
  getDetail: (detailId: string | number) => Promise<unknown>,
) {
  await delay(15_000);
  let lastDetail: unknown;
  for (let attempt = 0; attempt <= 10; attempt += 1) {
    if (attempt > 0) {
      await delay(5_000);
    }
    lastDetail = await getDetail(detailId);
    if (isCommonCollectBoxFailed(lastDetail)) {
      throw new Error(`鍏叡閲囬泦绠遍噰闆嗗け璐ワ細${extractFailureReason(lastDetail) || '濡欐墜杩斿洖澶辫触鐘舵€?}`);
    }
    if (isCommonCollectBoxComplete(lastDetail)) {
      return lastDetail;
    }
  }

  throw new Error('鍏叡閲囬泦绠遍噰闆嗚秴鏃?);
}

function isCommonCollectBoxComplete(detail: unknown) {
  const title = String(findNestedValue(detail, 'title') ?? '').trim();
  const imgUrls = findNestedValue(detail, 'imgUrls');
  const skuMap = findNestedValue(detail, 'skuMap');
  const hasImages = Array.isArray(imgUrls) ? imgUrls.length > 0 : Boolean(imgUrls);
  const hasSku = asRecord(skuMap) ? Object.keys(asRecord(skuMap) ?? {}).length > 0 : Boolean(skuMap);
  return Boolean(title && (hasImages || hasSku));
}

function isCommonCollectBoxFailed(detail: unknown) {
  const status = String(findNestedValue(detail, 'status') ?? '').toLowerCase();
  const reason = extractFailureReason(detail).toLowerCase();
  return ['fail', 'failed', 'error'].some((item) => status.includes(item)) || /澶辫触|閿欒|寮傚父/.test(reason);
}

function extractFailureReason(detail: unknown) {
  return String(findNestedValue(detail, 'reason') ?? findNestedValue(detail, 'failureReason') ?? findNestedValue(detail, 'message') ?? '');
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractTiktokCollectBoxId(items: unknown[], commonCollectBoxId: string, productId: string) {
  for (const item of items) {
    const record = asRecord(item);
    if (!record) {
      continue;
    }
    const commonId = String(record.commonCollectBoxDetailId ?? findNestedValue(record, 'commonCollectBoxDetailId') ?? '');
    const itemNum = String(record.itemNum ?? findNestedValue(record, 'itemNum') ?? '');
    if (
      (commonCollectBoxId && commonId === commonCollectBoxId) ||
      (productId && itemNum.includes(productId)) ||
      items.length === 1
    ) {
      const id = record.collectBoxDetailId ?? record.detailId ?? findNestedValue(record, 'collectBoxDetailId') ?? findNestedValue(record, 'detailId');
      if (typeof id === 'string' || typeof id === 'number') {
        return String(id);
      }
    }
  }
  return '';
}

async function resolveFreshTiktokCollectBoxId(input: {
  candidateIds: string[];
  commonCollectBoxId: string;
  productId: string;
  site: string;
  searchTiktokCollectBox: (input: { sourceItemIdKeyword?: string; pageSize?: number; status?: string }) => Promise<unknown[]>;
  getSiteCollectItemInfo: (input: { detailId: string | number; site: string }) => Promise<unknown>;
}) {
  for (const candidateId of uniqueNonEmptyStrings(input.candidateIds)) {
    const isValid = await input.getSiteCollectItemInfo({ detailId: candidateId, site: input.site })
      .then(() => true)
      .catch((error) => !isStaleMiaoshouCollectBoxError(error));
    if (isValid) {
      return candidateId;
    }
  }

  await delay(3_000);
  const searchKeywords = uniqueNonEmptyStrings([input.productId, input.commonCollectBoxId, ...input.candidateIds]);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (attempt > 0) {
      await delay(2_000);
    }
    for (const keyword of searchKeywords.length ? searchKeywords : ['']) {
      const items = await input.searchTiktokCollectBox({
        sourceItemIdKeyword: keyword,
        pageSize: 50,
      });
      const nextId = extractTiktokCollectBoxId(items, input.commonCollectBoxId, input.productId);
      if (!nextId) {
        continue;
      }
      const isValid = await input.getSiteCollectItemInfo({ detailId: nextId, site: input.site })
        .then(() => true)
        .catch((error) => !isStaleMiaoshouCollectBoxError(error));
      if (isValid) {
        return nextId;
      }
    }
  }

  return '';
}

async function resolveMiaoshouPublishStatus(input: {
  row: ListingEditRecord;
  searchTiktokCollectBox: (input: { sourceItemIdKeyword?: string; pageSize?: number; status?: string }) => Promise<unknown[]>;
}) {
  const searchKeywords = uniqueNonEmptyStrings([
    input.row.productId,
    input.row.collectSourceItemId,
    input.row.offerId,
    input.row.tiktokCollectBoxId,
    input.row.commonCollectBoxId,
  ]);
  const statuses = [
    { status: 'published', verifyStatus: '宸插彂甯? },
    { status: 'timingPublish', verifyStatus: '鍙戝竷涓? },
    {
      status: 'notPublished',
      verifyStatus: rowWasSubmitted(input.row) ? '鍙戝竷涓緟澶嶆牳' : '鏈彂甯?,
    },
  ];
  const searchedStatuses: string[] = [];

  for (const statusConfig of statuses) {
    for (const keyword of searchKeywords.length > 0 ? searchKeywords : ['']) {
      const items = await input.searchTiktokCollectBox({
        sourceItemIdKeyword: keyword,
        pageSize: 50,
        status: statusConfig.status,
      });
      searchedStatuses.push(statusConfig.status);
      const matched = findTiktokCollectBoxItem(
        items,
        input.row.tiktokCollectBoxId,
        input.row.commonCollectBoxId,
        input.row.productId,
        input.row.collectSourceItemId || input.row.offerId,
      );
      if (!matched) {
        continue;
      }

      return {
        publishVerifyStatus: statusConfig.verifyStatus,
        miaoshouPublishStatus: extractRemotePublishStatus(matched) || statusConfig.status,
        miaoshouPublishTaskId: extractStringFromNestedKeys(matched, ['publishTaskId', 'taskId', 'moveTaskId', 'publishId']),
        tiktokProductId: extractStringFromNestedKeys(matched, ['productId', 'tiktokProductId', 'platformProductId', 'onlineProductId']),
        publishedProductUrl: extractPublishedProductUrl(matched),
        failureReason: statusConfig.verifyStatus === '宸插彂甯? ? '' : `濡欐墜閲囬泦绠辩姸鎬佷粛涓?${statusConfig.status}`,
      };
    }
  }

  return {
    publishVerifyStatus: '鏈壘鍒?,
    miaoshouPublishStatus: `鏈湪 ${[...new Set(searchedStatuses)].join('/')} 涓壘鍒癭,
    miaoshouPublishTaskId: '',
    tiktokProductId: '',
    publishedProductUrl: '',
    failureReason: '濡欐墜閲囬泦绠辨湭杩斿洖璇ュ晢鍝佺殑鍙戝竷缁撴灉锛涘彲鑳戒粛鍦ㄥ彂甯冮槦鍒椼€佸凡琚Щ鍔ㄥ埌鍏朵粬鍒楄〃锛屾垨褰撳墠寮€鏀炬帴鍙ｄ笉杩斿洖鏈€缁堝晢鍝両D',
  };
}

async function verifyMiaoshouShopClaim(input: {
  detailId: string;
  productId: string;
  commonCollectBoxId: string;
  targetShopId: string;
  site: string;
  searchTiktokCollectBox: (input: { sourceItemIdKeyword?: string; pageSize?: number; status?: string }) => Promise<unknown[]>;
  getSiteCollectItemInfo: (input: { detailId: string | number; site: string }) => Promise<unknown>;
  getShopCollectItemInfo: (input: { detailId: string | number; shopId: string | number }) => Promise<unknown>;
}) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (attempt > 0) {
      await delay(2_000);
    }
    const list = await input.searchTiktokCollectBox({
      sourceItemIdKeyword: input.productId || input.commonCollectBoxId || input.detailId,
      pageSize: 50,
    });
    const matched = findTiktokCollectBoxItem(list, input.detailId, input.commonCollectBoxId, input.productId);
    if (isTargetShopClaimed(matched, input.targetShopId)) {
      return true;
    }

    const siteDetail = await input.getSiteCollectItemInfo({ detailId: input.detailId, site: input.site }).catch(() => null);
    if (isTargetShopClaimed(siteDetail, input.targetShopId)) {
      return true;
    }

    const shopDetail = await input.getShopCollectItemInfo({ detailId: input.detailId, shopId: input.targetShopId }).catch(() => null);
    const shopPayload = extractShopCollectPayload(shopDetail);
    if (shopPayload.shopCollectItemInfo || isTargetShopClaimed(shopDetail, input.targetShopId)) {
      return true;
    }
  }
  return false;
}

function findTiktokCollectBoxItem(
  items: unknown[],
  detailId: string,
  commonCollectBoxId: string,
  productId: string,
  sourceItemId = '',
) {
  return items.find((item) => {
    const record = asRecord(item);
    if (!record) {
      return false;
    }
    const itemDetailId = String(record.collectBoxDetailId ?? record.detailId ?? findNestedValue(record, 'collectBoxDetailId') ?? findNestedValue(record, 'detailId') ?? '');
    const commonId = String(record.commonCollectBoxDetailId ?? findNestedValue(record, 'commonCollectBoxDetailId') ?? '');
    const itemNum = String(record.itemNum ?? findNestedValue(record, 'itemNum') ?? '');
    return (
      (detailId && itemDetailId === detailId) ||
      (commonCollectBoxId && commonId === commonCollectBoxId) ||
      (sourceItemId && itemNum.includes(sourceItemId)) ||
      (productId && itemNum.includes(productId))
    );
  }) ?? null;
}

function rowWasSubmitted(row: ListingEditRecord) {
  return row.editStatus === '宸叉彁浜ゅ彂甯? || row.publishReadyStatus.includes('宸叉彁浜ゅ彂甯?);
}

function isTargetShopClaimed(value: unknown, targetShopId: string) {
  if (!targetShopId) {
    return false;
  }
  const target = String(targetShopId);
  const claimToShopIds = findNestedValue(value, 'claimToShopIds');
  if (Array.isArray(claimToShopIds) && claimToShopIds.some((shopId) => String(shopId) === target)) {
    return true;
  }
  return hasShopInNestedList(value, target);
}

function hasShopInNestedList(value: unknown, targetShopId: string): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some((item) => hasShopInNestedList(item, targetShopId));
  }
  const record = value as Record<string, unknown>;
  if ('shopId' in record && String(record.shopId) === targetShopId) {
    return true;
  }
  return Object.values(record).some((nested) => hasShopInNestedList(nested, targetShopId));
}

function countActiveSkus(shopCollectItemInfo: unknown) {
  const skuMap = asRecord(findNestedValue(shopCollectItemInfo, 'skuMap'));
  if (!skuMap) {
    return 0;
  }
  return Object.values(skuMap).filter((sku) => {
    const record = asRecord(sku);
    return record && String(record.isDelete ?? '') !== '1';
  }).length;
}

function extractShopTitle(shopCollectItemInfo: unknown) {
  return String(findNestedValue(shopCollectItemInfo, 'title') ?? '').trim();
}

function isStaleListingEditRecord(row: ListingEditRecord) {
  if (row.commonCollectBoxId || row.tiktokCollectBoxId) {
    return /宸茶鍒犻櫎|涓嶅瓨鍦▅澶辨晥|鏃犳晥|鏈壘鍒伴噰闆嗙浜у搧淇℃伅|閲囬泦绠变骇鍝佷俊鎭瘄鏈悳绱㈠埌璐ф簮ID|鏆傛棤鏁版嵁|not\s*found/i.test(row.failureReason);
  }
  return ['澶辫触', '闇€浜哄伐澶勭悊', '鍙戝竷澶辫触'].includes(row.editStatus) &&
    /宸茶鍒犻櫎|涓嶅瓨鍦▅澶辨晥|鏃犳晥|鏈壘鍒伴噰闆嗙浜у搧淇℃伅|閲囬泦绠变骇鍝佷俊鎭瘄鏈悳绱㈠埌璐ф簮ID|鏆傛棤鏁版嵁|not\s*found/i.test(row.failureReason);
}

function isCommonCollectBoxTimeoutError(error: unknown) {
  return error instanceof Error && error.message.includes('鍏叡閲囬泦绠遍噰闆嗚秴鏃?);
}

function isListingEditLockedStatus(status: string) {
  return ['淇濆瓨涓?, '鍙戝竷涓?, '宸叉彁浜ゅ彂甯?].includes(status);
}

function isListingEditRetryCandidate(row: ListingEditRecord | null) {
  if (!row) {
    return false;
  }
  return (
    ['澶辫触', '闇€浜哄伐澶勭悊', '鍙戝竷澶辫触', '闇€浜哄伐閫夋嫨搴楅摵'].includes(row.editStatus) ||
    ['澶辫触', '鍙戝竷澶辫触', '绫荤洰鏈嚜鍔ㄥ尮閰?].some((status) => row.publishReadyStatus.includes(status)) ||
    row.collectStatus === '澶辫触' ||
    row.claimStatus === '澶辫触' ||
    row.shopClaimStatus === '闇€浜哄伐閫夋嫨搴楅摵'
  );
}

function getBrowserPublishPreflightFailure(row: ListingEditRecord, options: { hasPricingTemplate?: boolean } = {}) {
  if (row.editStatus === '宸叉彁浜ゅ彂甯? || row.publishReadyStatus.includes('宸叉彁浜ゅ彂甯?)) {
    return '宸叉彁浜ゅ彂甯冿紝绂佹閲嶅鍙戝竷';
  }
  if (row.failureReason.includes('蹇呭～灞炴€?)) {
    return row.failureReason;
  }
  if (row.publishReadyStatus.includes('绫荤洰鏈嚜鍔ㄥ尮閰?) || row.failureReason.includes('绫荤洰')) {
    return row.failureReason || '绫荤洰鏈嚜鍔ㄥ尮閰嶏紝闇€浜哄伐澶勭悊';
  }
  if (!['寰呬汉宸ョ紪杈?, '寰呬繚瀛樿崏绋?, '鑽夌宸蹭繚瀛?, '闇€浜哄伐澶勭悊', '鍙戝竷涓?].includes(row.editStatus)) {
    return `褰撳墠缂栬緫鐘舵€佷笉鍙彂甯冿細${row.editStatus || '绌?}`;
  }
  if (row.collectStatus !== '宸查噰闆嗗叕鍏遍噰闆嗙') {
    return `閲囬泦鐘舵€佹湭瀹屾垚锛?{row.collectStatus || '绌?}`;
  }
  if (row.claimStatus !== '宸茶棰員ikTok閲囬泦绠?) {
    return `璁ら鐘舵€佹湭瀹屾垚锛?{row.claimStatus || '绌?}`;
  }
  if (row.shopClaimStatus !== '宸茶棰嗙洰鏍囧簵閾?) {
    return `搴楅摵璁ら鐘舵€佹湭瀹屾垚锛?{row.shopClaimStatus || '绌?}`;
  }
  if (!row.tiktokCollectBoxId || !row.targetShopId) {
    return 'TikTok閲囬泦绠盜D鎴栫洰鏍囧簵閾篒D缂哄け';
  }
  if (!row.collectSourceItemId && !row.productId) {
    return '閲囬泦婧愯揣婧怚D缂哄け锛屾棤娉曞湪濡欐墜閲囬泦绠辨悳绱?;
  }
  if (typeof row.unifiedSourcePrice !== 'number' || row.unifiedSourcePrice <= 0) {
    return '缁熶竴璐ф簮浠锋牸蹇呴』澶т簬0';
  }
  if (!options.hasPricingTemplate) {
    return '鏈厤缃鎵嬪畾浠锋ā鏉?;
  }
  if (typeof row.weightGram !== 'number' || row.weightGram <= 0) {
    return '鍖呰９閲嶉噺g蹇呴』澶т簬0';
  }
  return '';
}

function isBrowserPublishPreflightReportable(row: ListingEditRecord) {
  return ['寰呬汉宸ョ紪杈?, '寰呬繚瀛樿崏绋?, '鑽夌宸蹭繚瀛?, '闇€浜哄伐澶勭悊', '鍙戝竷澶辫触', '澶辫触', '鍙戝竷涓?].includes(row.editStatus);
}

function isBrowserPublishRetryCandidate(row: ListingEditRecord) {
  return (
    ['闇€浜哄伐澶勭悊', '鍙戝竷澶辫触', '澶辫触', '鍙戝竷涓?].includes(row.editStatus) ||
    ['鍙戝竷澶辫触', '娴忚鍣ㄦā鎷熷彂甯冧腑'].some((status) => row.publishReadyStatus.includes(status))
  );
}

function isStaleMiaoshouCollectBoxError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /宸茶鍒犻櫎|涓嶅瓨鍦▅澶辨晥|鏃犳晥|鏈壘鍒伴噰闆嗙浜у搧淇℃伅|閲囬泦绠变骇鍝佷俊鎭瘄鎵句笉鍒板搴斾骇鍝亅鏈悳绱㈠埌璐ф簮ID|鏆傛棤鏁版嵁|not\s*found/i.test(message);
}

function getListingPublishReadyStatus(row: ListingEditRecord) {
  if (typeof row.displayPrice !== 'number' || row.displayPrice <= 0) {
    return '浠锋牸寮傚父';
  }
  return '寰呬汉宸ュ彂甯?;
}

function getListingPublishReadyFailureReason() {
  return '';
}

const alreadySubmittedPublishFailure = '宸叉彁浜ゅ彂甯冿紝绂佹閲嶅鍙戝竷';

function getListingSiteMismatchReason(
  row: ListingEditRecord,
  input: {
    targetShopId: string;
    targetSite: string;
  },
) {
  const shopSite = normalizeSite(row.targetShopSite || input.targetSite);
  const rowShopId = row.targetShopId || input.targetShopId;
  if (input.targetShopId && rowShopId && String(rowShopId) !== String(input.targetShopId)) {
    return '鐩爣搴楅摵ID涓庡綋鍓嶉厤缃笉涓€鑷?;
  }
  if (shopSite && input.targetSite && shopSite !== normalizeSite(input.targetSite)) {
    return '鐩爣搴楅摵绔欑偣涓庡綋鍓嶉厤缃笉涓€鑷?;
  }

  return '';
}

function getListingPublishReadinessFailures(
  row: ListingEditRecord,
  input: {
    targetShopId: string;
    targetSite: string;
    requireDraftSaved?: boolean;
  },
) {
  const failures: string[] = [];
  const rowShopId = row.targetShopId || input.targetShopId;
  const rowSite = normalizeSite(row.targetShopSite || input.targetSite);
  const targetSite = normalizeSite(input.targetSite);
  const siteMismatch = getListingSiteMismatchReason(row, input);

  if (row.editStatus === '宸叉彁浜ゅ彂甯? || row.publishReadyStatus.includes('宸叉彁浜ゅ彂甯?)) {
    failures.push(alreadySubmittedPublishFailure);
  }
  if (siteMismatch) {
    failures.push(siteMismatch);
  }
  if (input.requireDraftSaved && row.editStatus !== '鑽夌宸蹭繚瀛?) {
    failures.push('鑽夌鏈繚瀛?);
  }
  if (row.failureReason.includes('蹇呭～灞炴€?)) {
    failures.push(row.failureReason);
  }
  if (!row.tiktokCollectBoxId) {
    failures.push('TikTok閲囬泦绠盜D涓虹┖');
  }
  if (!rowShopId) {
    failures.push('鐩爣搴楅摵ID涓虹┖');
  } else if (input.targetShopId && String(rowShopId) !== String(input.targetShopId)) {
    failures.push('鐩爣搴楅摵ID涓庡綋鍓嶉厤缃笉涓€鑷?);
  }
  if (!rowSite) {
    failures.push('鐩爣搴楅摵绔欑偣涓虹┖');
  } else if (targetSite && rowSite !== targetSite) {
    failures.push('鐩爣搴楅摵绔欑偣涓庡綋鍓嶉厤缃笉涓€鑷?);
  }
  if (row.shopClaimStatus !== '宸茶棰嗙洰鏍囧簵閾?) {
    failures.push('鏈棰嗙洰鏍囧簵閾?);
  }
  if (typeof row.unifiedSourcePrice !== 'number' || row.unifiedSourcePrice <= 0) {
    failures.push('缁熶竴璐ф簮浠锋牸缂哄け');
  }
  if (typeof row.weightGram !== 'number' || row.weightGram <= 0) {
    failures.push('鍖呰９閲嶉噺g缂哄け');
  }
  if (safeDimension(row.lengthCm) <= 0 || safeDimension(row.widthCm) <= 0 || safeDimension(row.heightCm) <= 0) {
    failures.push('鍖呰９灏哄缂哄け');
  }
  return failures;
}

function applyListingEditToShopInfo(shopInfo: Record<string, unknown>, row: ListingEditRecord) {
  const title = row.editTitle.trim() || extractShopTitle(shopInfo);
  if (!title) {
    throw new Error('缂栬緫鏍囬涓虹┖锛屼笖濡欐墜閲囬泦鏍囬涓虹┖');
  }
  const weightKg = Math.round((Number(row.weightGram) / 1000) * 1000) / 1000;
  const dimensions = {
    length: safeDimension(row.lengthCm),
    width: safeDimension(row.widthCm),
    height: safeDimension(row.heightCm),
  };

  shopInfo.title = title;
  shopInfo.weight = weightKg;
  shopInfo.packageLength = dimensions.length;
  shopInfo.packageWidth = dimensions.width;
  shopInfo.packageHeight = dimensions.height;
  sanitizeMiaoshouShopInfoBeforeSave(shopInfo);

  const skuMap = asRecord(shopInfo.skuMap);
  if (!skuMap) {
    throw new Error('濡欐墜璇︽儏SKU缁撴瀯涓虹┖');
  }
  for (const skuValue of Object.values(skuMap)) {
    const sku = asRecord(skuValue);
    if (!sku || String(sku.isDelete ?? '') === '1') {
      continue;
    }
    sku.originPrice = row.unifiedSourcePrice;
    sku.weight = weightKg;
    if (typeof row.displayPrice === 'number' && row.displayPrice > 0) {
      sku.priceIncludeVat = row.displayPrice;
    }
  }
}

function sanitizeMiaoshouShopInfoBeforeSave(shopInfo: Record<string, unknown>) {
  trimMiaoshouImageLists(shopInfo);
  ensureMiaoshouDeliveryDefaults(shopInfo);
  normalizeMiaoshouSizeChart(shopInfo);
}

function applyRequiredMiaoshouSaveDefaults(
  shopInfo: Record<string, unknown>,
  input: { weightGram?: number | ''; dimensions?: string },
) {
  const weightKg = typeof input.weightGram === 'number' && input.weightGram > 0
    ? Math.round((input.weightGram / 1000) * 1000) / 1000
    : 0.001;
  const parsedDimensions = parseDimensionCm(input.dimensions ?? '');
  const dimensions = {
    length: safeDimension(parsedDimensions.length),
    width: safeDimension(parsedDimensions.width),
    height: safeDimension(parsedDimensions.height),
  };
  shopInfo.weight = weightKg;
  shopInfo.packageLength = dimensions.length;
  shopInfo.packageWidth = dimensions.width;
  shopInfo.packageHeight = dimensions.height;
}

function trimMiaoshouImageLists(value: unknown) {
  if (!value || typeof value !== 'object') {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      trimMiaoshouImageLists(item);
    }
    return;
  }
  const record = value as Record<string, unknown>;
  const imgUrls = record.imgUrls;
  if (Array.isArray(imgUrls) && imgUrls.length > 15) {
    record.imgUrls = imgUrls.slice(0, 15);
  }
  for (const nested of Object.values(record)) {
    trimMiaoshouImageLists(nested);
  }
}

function normalizeMiaoshouSizeChart(shopInfo: Record<string, unknown>) {
  const sizeChart = String(shopInfo.sizeChart ?? '').trim();
  if (sizeChart && /\.(jpe?g|png)(?:$|[?#])/i.test(sizeChart)) {
    return;
  }
  delete shopInfo.sizeChart;
  delete shopInfo.sizeChartType;
}

function ensureMiaoshouDeliveryDefaults(shopInfo: Record<string, unknown>) {
  if (!String(shopInfo.deliveryOptionSetType ?? '').trim()) {
    shopInfo.deliveryOptionSetType = 'default';
  }
  if (!Array.isArray(shopInfo.deliveryOptionIds)) {
    shopInfo.deliveryOptionIds = [];
  }
}

function hasMiaoshouCategory(shopInfo: Record<string, unknown>) {
  return String(shopInfo.cid ?? '').trim().length > 0;
}

function safeDimension(value: number | '') {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? Math.max(numberValue, 1) : 10;
}

function extractOfferIdFromUrl(value: string) {
  return value.match(/offer\/(\d+)\.html/i)?.[1] ?? value.match(/[?&]offerId=(\d+)/i)?.[1] ?? '';
}

function verifySavedShopInfo(shopCollectItemInfo: unknown, row: ListingEditRecord) {
  const failures: string[] = [];
  const info = asRecord(shopCollectItemInfo);
  if (!info) {
    return ['搴楅摵妯″紡璇︽儏涓虹┖'];
  }
  const expectedTitle = row.editTitle.trim();
  if (expectedTitle && String(info.title ?? '').trim() !== expectedTitle) {
    failures.push('鏍囬');
  }
  const expectedWeightKg = Math.round((Number(row.weightGram) / 1000) * 1000) / 1000;
  if (!numbersClose(Number(info.weight), expectedWeightKg)) {
    failures.push('鍟嗗搧閲嶉噺');
  }
  if (!numbersClose(Number(info.packageLength), safeDimension(row.lengthCm))) {
    failures.push('鍖呰９闀垮害');
  }
  if (!numbersClose(Number(info.packageWidth), safeDimension(row.widthCm))) {
    failures.push('鍖呰９瀹藉害');
  }
  if (!numbersClose(Number(info.packageHeight), safeDimension(row.heightCm))) {
    failures.push('鍖呰９楂樺害');
  }
  const skuMap = asRecord(info.skuMap);
  if (!skuMap) {
    failures.push('SKU缁撴瀯');
    return failures;
  }
  const activeSkus = Object.values(skuMap)
    .map(asRecord)
    .filter((sku): sku is Record<string, unknown> => Boolean(sku && String(sku.isDelete ?? '') !== '1'));
  if (activeSkus.length === 0) {
    failures.push('鏈夋晥SKU');
    return failures;
  }
  if (activeSkus.some((sku) => !numbersClose(Number(sku.originPrice), Number(row.unifiedSourcePrice)))) {
    failures.push('SKU璐ф簮浠锋牸');
  }
  if (activeSkus.some((sku) => !numbersClose(Number(sku.weight), expectedWeightKg))) {
    failures.push('SKU閲嶉噺');
  }
  if (
    typeof row.displayPrice === 'number' &&
    row.displayPrice > 0 &&
    activeSkus.some((sku) => !numbersClose(Number(sku.priceIncludeVat), Number(row.displayPrice)))
  ) {
    failures.push('灞曠ず浠锋牸');
  }
  return failures;
}

function numbersClose(left: number, right: number) {
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) < 0.01;
}

function buildFieldsByNames(fields: FeishuField[], values: Record<string, unknown>) {
  const output: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(values)) {
    if (value === '' || value == null) {
      continue;
    }

    const field = findFieldByName(fields, name);
    if (!field) {
      continue;
    }

    const fieldName = getFeishuFieldName(field);
    if (!fieldName) {
      continue;
    }

    if (field.type === 20) {
      continue;
    }

    const normalizedValue = normalizeValueForField(value, field);
    if (
      normalizedValue === '' ||
      normalizedValue == null ||
      (Array.isArray(normalizedValue) && normalizedValue.length === 0)
    ) {
      continue;
    }

    output[fieldName] = normalizedValue;
  }

  return output;
}

function buildFirstWritableFieldByNames(fields: FeishuField[], names: string[], value: unknown) {
  for (const name of names) {
    const field = findFieldByName(fields, name);
    if (!field || field.type === 20) {
      continue;
    }
    const output = buildFieldsByNames(fields, { [name]: value });
    if (Object.keys(output).length > 0) {
      return output;
    }
  }
  return {};
}
