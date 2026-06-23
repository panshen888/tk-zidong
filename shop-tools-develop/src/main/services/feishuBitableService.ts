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
    shopMappings?: ListingShopMapping[];
    importLinks: (links: string[]) => Promise<Record<string, string | number>>;
    getCommonCollectBoxDetail: (detailId: string | number) => Promise<unknown>;
    claimToPlatform: (detailIds: Array<string | number>, platform: string) => Promise<Record<string, string | number>>;
    searchTiktokCollectBox: (input: { sourceItemIdKeyword?: string; pageSize?: number; status?: string }) => Promise<unknown[]>;
    claimToShop: (input: { detailIds: Array<string | number>; shopIds: Array<string | number> }) => Promise<unknown>;
    getShopCollectItemInfo: (input: { detailId: string | number; shopId: string | number }) => Promise<unknown>;
    getSiteCollectItemInfo: (input: { detailId: string | number; site: string }) => Promise<unknown>;
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

const selectionSheetName = '选品表';
const feishuApiBaseUrl = 'https://open.feishu.cn/open-apis';
const inputColumns = [
  { targetHeader: '原商品ID', candidates: ['商品ID', '原商品ID', '产品ID', 'Product ID', 'productId'] },
  { targetHeader: '原商品链接', candidates: ['原商品链接', '商品链接', '商品URL', '链接', 'sourceUrl'] },
  { targetHeader: '郑和数据链接', candidates: ['郑和数据链接', '郑和链接', '郑和商品链接', 'zhengheUrl', 'zhengheDataUrl'] },
  { targetHeader: '原商品主图URL', candidates: ['原商品主图URL', '主图URL', '商品主图', '图片URL', '图片', 'imageUrl'] },
  { targetHeader: '商品标题', candidates: ['商品标题', '标题', '品名', 'title'] },
  { targetHeader: '国家', candidates: ['国家/站点', '国家', '站点', '市场', 'country'] },
  { targetHeader: '类目', candidates: ['类目', '分类', 'category'] },
];
const statusFieldCandidates = ['状态', '核实状态', '处理状态'];
const sourceUrlFieldCandidates = ['原商品链接', '商品链接', '商品URL', '链接', 'sourceUrl'];
const imageUrlFieldCandidates = ['原商品主图URL', '主图URL', '商品主图', '图片URL', '图片', 'imageUrl'];
const productIdFieldCandidates = ['商品ID', '原商品ID', '产品ID', 'Product ID'];
const countryFieldCandidates = ['国家/站点', '国家', '站点', '市场', 'country'];
const titleFieldCandidates = ['商品标题', '标题', '品名', 'title'];
const categoryFieldCandidates = ['类目', '分类', 'category'];

const inputTableName = '输入表';
const outputTableName = '输出货源表';
const listingTableName = '待上架商品表';
const listingAuditTableName = 'AI上架审核表';
const publicationTableName = '刊登任务表';
const listingEditTableName = 'AI上架编辑表';
const listingResultTableName = 'AI上架结果表';
const purchaseTableName = '采购任务表';
const defaultViewName = '表格视图';

const inputTableFields: FeishuCreateField[] = [
  { field_name: '原商品ID', type: 1 },
  { field_name: '原商品链接', type: 15, ui_type: 'Url' },
  { field_name: '郑和数据链接', type: 15, ui_type: 'Url' },
  { field_name: '原商品主图URL', type: 15, ui_type: 'Url' },
  { field_name: '商品标题', type: 1 },
  { field_name: '国家', type: 1 },
  { field_name: '类目', type: 1 },
  { field_name: '状态', type: 1 },
];
const outputTableFields: FeishuCreateField[] = [
  { field_name: '原商品ID', type: 1 },
  { field_name: '原商品链接', type: 15, ui_type: 'Url' },
  { field_name: '郑和数据链接', type: 15, ui_type: 'Url' },
  { field_name: '状态', type: 1 },
  { field_name: '原商品标题', type: 1 },
  { field_name: '国家', type: 1 },
  { field_name: '类目', type: 1 },
  { field_name: '原商品主图URL', type: 15, ui_type: 'Url' },
  { field_name: '搜图状态', type: 1 },
  { field_name: '推荐排名', type: 2, ui_type: 'Number', property: { formatter: '0' } },
  { field_name: '1688链接', type: 15, ui_type: 'Url' },
  { field_name: 'offerId', type: 1 },
  { field_name: '1688主图URL', type: 15, ui_type: 'Url' },
  { field_name: '列表图片相似度', type: 2, ui_type: 'Number', property: { formatter: '0.00%' } },
  { field_name: '1688候选数', type: 2, ui_type: 'Number', property: { formatter: '0' } },
  { field_name: '供应商类型', type: 1 },
  { field_name: '会员供应商', type: 1 },
  { field_name: '供应商评分', type: 2, ui_type: 'Number', property: { formatter: '0' } },
  { field_name: '采纳建议', type: 1 },
  { field_name: 'SKU名称', type: 1 },
  { field_name: 'SKU图片URL', type: 15, ui_type: 'Url' },
  { field_name: 'SKU图片相似度', type: 2, ui_type: 'Number', property: { formatter: '0.00%' } },
  { field_name: '商品价', type: 2, ui_type: 'Number', property: { formatter: '0.00' } },
  { field_name: '运费', type: 2, ui_type: 'Number', property: { formatter: '0.00' } },
  { field_name: '采购成本价', type: 2, ui_type: 'Number', property: { formatter: '0.00' } },
  { field_name: '尺寸', type: 1 },
  { field_name: '克重', type: 2, ui_type: 'Number', property: { formatter: '0' } },
  { field_name: '克重来源', type: 1 },
  { field_name: '克重置信度', type: 1 },
  { field_name: '提取来源', type: 1 },
  { field_name: '1688供应商', type: 1 },
  { field_name: '1688商品标题', type: 1 },
  { field_name: '风险备注', type: 1 },
];
const listingTableFields: FeishuCreateField[] = [
  { field_name: '关联键', type: 1 },
  { field_name: '商品ID', type: 1 },
  { field_name: '原商品链接', type: 15, ui_type: 'Url' },
  { field_name: '郑和数据链接', type: 15, ui_type: 'Url' },
  { field_name: '原商品主图URL', type: 15, ui_type: 'Url' },
  { field_name: '1688链接', type: 15, ui_type: 'Url' },
  { field_name: 'offerId', type: 1 },
  { field_name: 'SKU名称', type: 1 },
  { field_name: 'SKU图片URL', type: 15, ui_type: 'Url' },
  { field_name: '采购成本价', type: 2, ui_type: 'Number', property: { formatter: '0.00' } },
  { field_name: '商品价', type: 2, ui_type: 'Number', property: { formatter: '0.00' } },
  { field_name: '运费', type: 2, ui_type: 'Number', property: { formatter: '0.00' } },
  { field_name: '尺寸', type: 1 },
  { field_name: '克重', type: 2, ui_type: 'Number', property: { formatter: '0' } },
  { field_name: '供应商', type: 1 },
  { field_name: '相似度', type: 2, ui_type: 'Number', property: { formatter: '0.00%' } },
  { field_name: '风险备注', type: 1 },
  { field_name: '审核状态', type: 1 },
  { field_name: '刊登状态', type: 1 },
  { field_name: '采购绑定状态', type: 1 },
  { field_name: '商品标题', type: 1 },
  { field_name: '国家', type: 1 },
  { field_name: '类目', type: 1 },
  { field_name: '最后更新时间', type: 5, ui_type: 'DateTime' },
];
const listingAuditTableFields: FeishuCreateField[] = getListingAuditHeaders().map((fieldName) => {
  const numericFields = new Set([
    '评价数',
    '佣金比例',
    '总销量',
    '近30天销量',
    '近30天GMV',
    '近30天均价',
    '前端SKU价格',
    '前端SKU库存',
    '汇率到人民币',
    '前端售价人民币',
    'SKU匹配置信度',
    '推荐采购价',
    '推荐运费',
    '采购成本人民币',
    '推荐采购克重',
    '相似度',
    '预估利润人民币',
    '预估利润率',
    '5%利润最低售价人民币',
  ]);
  const urlFields = new Set(['原商品链接', '郑和数据链接', 'TikTok前端链接', '推荐1688链接']);
  const isNumeric = numericFields.has(fieldName);
  const isUrl = urlFields.has(fieldName);
  return {
    field_name: fieldName,
    type: isNumeric ? 2 : isUrl ? 15 : 1,
    ui_type: isNumeric ? 'Number' : isUrl ? 'Url' : undefined,
    property: isNumeric
      ? { formatter: fieldName.includes('率') || fieldName.includes('置信度') || fieldName.includes('佣金') || fieldName.includes('相似度') ? '0.00%' : '0.00' }
      : undefined,
  } satisfies FeishuCreateField;
});
const publicationTableFields: FeishuCreateField[] = [
  { field_name: '关联键', type: 1 },
  { field_name: '商品ID', type: 1 },
  { field_name: '站点', type: 1 },
  { field_name: '店铺', type: 1 },
  { field_name: '店铺ID', type: 1 },
  { field_name: '妙手模板名', type: 1 },
  { field_name: '妙手草稿ID', type: 1 },
  { field_name: '公共采集箱ID', type: 1 },
  { field_name: 'TikTok采集箱ID', type: 1 },
  { field_name: '导入批次号', type: 1 },
  { field_name: '刊登状态', type: 1 },
  { field_name: '失败原因', type: 1 },
  { field_name: '发布前检查', type: 1 },
  { field_name: '资料包路径', type: 15, ui_type: 'Url' },
  { field_name: '最后更新时间', type: 5, ui_type: 'DateTime' },
];
const listingEditStatuses = [
  '待采集',
  '采集中',
  '已采集公共采集箱',
  '认领中',
  '已认领TikTok采集箱',
  '店铺认领中',
  '已认领目标店铺',
  '已读取妙手详情',
  '待人工编辑',
  '待保存草稿',
  '保存中',
  '草稿已保存',
  '发布中',
  '已提交发布',
  '发布失败',
  '已发布',
  '发布中待复核',
  '待维护',
  '维护中',
  '维护已准备',
  '需人工选择店铺',
  '需人工处理',
  '失败',
] as const;
const listingEditTableFields: FeishuCreateField[] = [
  { field_name: '关联键', type: 1 },
  { field_name: '商品ID', type: 1 },
  { field_name: '国家/站点', type: 1 },
  { field_name: '比价批次号', type: 1 },
  { field_name: '表三记录ID', type: 1 },
  { field_name: '原商品链接', type: 15, ui_type: 'Url' },
  { field_name: '推荐1688链接', type: 15, ui_type: 'Url' },
  { field_name: 'offerId', type: 1 },
  { field_name: '采集源货源ID', type: 1 },
  { field_name: '采购总成本', type: 2, ui_type: 'Number', property: { formatter: '0.00' } },
  { field_name: '统一货源价格', type: 2, ui_type: 'Number', property: { formatter: '0.00' } },
  { field_name: '展示价格', type: 2, ui_type: 'Number', property: { formatter: '0.00' } },
  { field_name: '本地展示价', type: 2, ui_type: 'Number', property: { formatter: '0.00' } },
  { field_name: '编辑标题', type: 1 },
  { field_name: '包裹重量g', type: 2, ui_type: 'Number', property: { formatter: '0' } },
  { field_name: '包裹长度cm', type: 2, ui_type: 'Number', property: { formatter: '0.00' } },
  { field_name: '包裹宽度cm', type: 2, ui_type: 'Number', property: { formatter: '0.00' } },
  { field_name: '包裹高度cm', type: 2, ui_type: 'Number', property: { formatter: '0.00' } },
  { field_name: '目标店铺ID', type: 1 },
  { field_name: '目标店铺名称', type: 1 },
  { field_name: '目标店铺站点', type: 1 },
  { field_name: '目标类目ID', type: 1 },
  { field_name: '编辑模式', type: 1 },
  { field_name: '公共采集箱ID', type: 1 },
  { field_name: 'TikTok采集箱ID', type: 1 },
  { field_name: 'SKU数量', type: 2, ui_type: 'Number', property: { formatter: '0' } },
  { field_name: '采集状态', type: 3, ui_type: 'SingleSelect', property: { options: listingEditStatuses.map((name) => ({ name })) } },
  { field_name: '认领状态', type: 3, ui_type: 'SingleSelect', property: { options: listingEditStatuses.map((name) => ({ name })) } },
  { field_name: '店铺认领状态', type: 3, ui_type: 'SingleSelect', property: { options: listingEditStatuses.map((name) => ({ name })) } },
  { field_name: '编辑状态', type: 3, ui_type: 'SingleSelect', property: { options: listingEditStatuses.map((name) => ({ name })) } },
  { field_name: '发布准备状态', type: 1 },
  { field_name: '发布复核状态', type: 1 },
  { field_name: '发布复核时间', type: 5, ui_type: 'DateTime' },
  { field_name: '妙手发布状态', type: 1 },
  { field_name: '妙手发布任务ID', type: 1 },
  { field_name: 'TikTok商品ID', type: 1 },
  { field_name: '已发布商品链接', type: 15, ui_type: 'Url' },
  { field_name: '维护状态', type: 1 },
  { field_name: '维护备注', type: 1 },
  { field_name: '失败原因', type: 1 },
  { field_name: '最后更新时间', type: 5, ui_type: 'DateTime' },
];
const listingResultStatuses = [
  '待执行',
  '搜索中',
  '编辑中',
  '发布中',
  '已提交发布',
  '已发布',
  '需人工处理',
  '失败',
] as const;
const listingResultTableFields: FeishuCreateField[] = [
  { field_name: '关联键', type: 1 },
  { field_name: '商品ID', type: 1 },
  { field_name: '国家/站点', type: 1 },
  { field_name: '表三记录ID', type: 1 },
  { field_name: 'AI上架编辑表记录ID', type: 1 },
  { field_name: 'offerId', type: 1 },
  { field_name: '货源ID', type: 1 },
  { field_name: '采集源货源ID', type: 1 },
  { field_name: '采购总成本', type: 2, ui_type: 'Number', property: { formatter: '0.00' } },
  { field_name: '克重', type: 2, ui_type: 'Number', property: { formatter: '0' } },
  { field_name: '目标店铺ID', type: 1 },
  { field_name: '目标店铺名称', type: 1 },
  { field_name: '公共采集箱ID', type: 1 },
  { field_name: 'TikTok采集箱ID', type: 1 },
  { field_name: '妙手定价模板ID', type: 1 },
  { field_name: '妙手定价模板名', type: 1 },
  { field_name: '浏览器模拟状态', type: 3, ui_type: 'SingleSelect', property: { options: listingResultStatuses.map((name) => ({ name })) } },
  { field_name: '当前步骤', type: 1 },
  { field_name: '发布结果', type: 1 },
  { field_name: '失败原因', type: 1 },
  { field_name: '失败截图路径', type: 1 },
  { field_name: '最后更新时间', type: 5, ui_type: 'DateTime' },
];
const purchaseTableFields: FeishuCreateField[] = [
  { field_name: '关联键', type: 1 },
  { field_name: '订单号', type: 1 },
  { field_name: '商品ID', type: 1 },
  { field_name: 'offerId', type: 1 },
  { field_name: '1688链接', type: 15, ui_type: 'Url' },
  { field_name: 'SKU名称', type: 1 },
  { field_name: '采购数量', type: 2, ui_type: 'Number', property: { formatter: '0' } },
  { field_name: '采购单价', type: 2, ui_type: 'Number', property: { formatter: '0.00' } },
  { field_name: '采购运费', type: 2, ui_type: 'Number', property: { formatter: '0.00' } },
  { field_name: '货代地址', type: 1 },
  { field_name: '确认状态', type: 1 },
  { field_name: '1688订单号', type: 1 },
  { field_name: '采购状态', type: 1 },
  { field_name: '物流单号', type: 1 },
  { field_name: '异常备注', type: 1 },
  { field_name: '最后更新时间', type: 5, ui_type: 'DateTime' },
];

const numberPriceFields = new Set([
  '采购总成本',
  '采购总成本/CNY',
  '采购总成本（CNY）',
  '采购价',
  '运费',
  '展示价格',
  '本地展示价',
  '本地展示价/MYR',
  '本地展示价(折后)(MYR)',
  '本地展示价(原价)(MYR)',
  '汇率(CNY/MYR)',
  '目标利润率',
  'TK费用合计总费率(MYR)',
  '平台处理费/CNY',
  '跨境物流成本(当地货币)',
  '货代费用(CNY)',
  '折扣率',
  '优惠券(MYR)',
  '利润(MYR)',
  '其他费用(CNY)',
]);
const integerNumberFields = new Set(['克重', '克重（g）', '候选序号', '起批量', '年销量', '月代销', '1688销量', '候选数量', '有效候选数量']);
const urlLikeFields = new Set([
  '郑和数据链接',
  '原商品链接',
  '原商品主图URL',
  '1688链接',
  'SKU图片URL',
  '推荐1688链接',
]);
const checkboxFields = new Set(['人工指定上架货源']);
const datetimeFields = new Set(['最后更新时间']);

const priceInputTableFields: FeishuCreateField[] = priceInputHeaders.map((fieldName) =>
  createPriceComparisonField(fieldName, {
    options:
      fieldName === '状态'
        ? [...priceInputStatuses]
        : fieldName === '失败归因'
          ? [...priceInputFailureReasons]
          : fieldName === '重复位置'
            ? [...duplicateLocations]
            : undefined,
  }),
);

const priceOutputTableFields: FeishuCreateField[] = priceOutputHeaders.map((fieldName) =>
  createPriceComparisonField(fieldName, {
    options:
      fieldName === '商品组状态'
        ? [...priceOutputGroupStatuses]
        : fieldName === '候选状态'
          ? [...priceOutputCandidateStatuses]
          : fieldName === '失败归因'
            ? [...priceOutputFailureReasons]
            : undefined,
  }),
);

const priceReviewTableFields: FeishuCreateField[] = priceReviewHeaders.map((fieldName) =>
  createPriceComparisonField(fieldName, {
    options:
      fieldName === '状态'
        ? [...priceReviewStatuses]
        : fieldName === '失败归因'
            ? [...priceReviewFailureReasons]
            : fieldName === '重复位置'
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

  if (fieldName === '相似度') {
    return { field_name: fieldName, type: 2, ui_type: 'Number', property: { formatter: '0.00' } };
  }

  if (urlLikeFields.has(fieldName)) {
    return { field_name: fieldName, type: 15, ui_type: 'Url' };
  }

  if (options.options?.length) {
    const isMultiSelect = fieldName === '失败归因';
    return {
      field_name: fieldName,
      type: isMultiSelect ? 4 : 3,
      ui_type: isMultiSelect ? 'MultiSelect' : 'SingleSelect',
      property: {
        options: options.options.map((name) => ({ name })),
      },
    };
  }

  if (fieldName === '备注' || fieldName === '风险备注') {
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
  { names: ['商品ID', '原商品ID', '产品ID', 'Product ID'], getter: ({ item }) => item.productId },
  { names: ['原商品链接', '商品链接', '商品URL', '原链接'], getter: ({ item }) => item.sourceUrl ?? '' },
  { names: ['郑和数据链接', '郑和链接', '郑和商品链接'], getter: ({ item }) => item.zhengheDataUrl ?? '' },
  { names: ['状态', '原链接状态'], getter: ({ item }) => getRealtimeRowStatus(item) },
  { names: ['原商品标题', '商品标题', '标题', '品名'], getter: ({ item }) => item.title ?? '' },
  { names: ['国家/站点', '国家', '站点', '市场'], getter: ({ item }) => item.country ?? '' },
  { names: ['类目', '分类'], getter: ({ item }) => item.category ?? '' },
  { names: ['原商品主图URL', '主图URL', '商品主图', '图片URL'], getter: ({ item }) => item.sourceImageUrl ?? item.imageUrl ?? '' },
  { names: ['原商品主图本地路径', '主图本地路径'], getter: ({ item }) => item.localImagePath ?? '' },
  { names: ['搜图状态', '处理状态'], getter: ({ item }) => getSelectionRowStatus(item) },
  { names: ['风险备注', '风险标记', '备注', '失败原因'], getter: (row) => getRiskNoteForOutputRow(row) },
];

const summaryOutputColumns: OutputColumn[] = [
  { names: ['1688候选数', '候选数', '货源数'], getter: ({ item }) => item.candidates?.length ?? 0 },
  { names: ['推荐1688链接1', '推荐货源链接1', '货源链接1'], getter: ({ item }) => getTopPriceMatches(item, 3)[0]?.offerUrl ?? item.candidates?.[0]?.offerUrl ?? '' },
  { names: ['推荐1688链接2', '推荐货源链接2', '货源链接2'], getter: ({ item }) => getTopPriceMatches(item, 3)[1]?.offerUrl ?? item.candidates?.[1]?.offerUrl ?? '' },
  { names: ['推荐1688链接3', '推荐货源链接3', '货源链接3'], getter: ({ item }) => getTopPriceMatches(item, 3)[2]?.offerUrl ?? item.candidates?.[2]?.offerUrl ?? '' },
  { names: ['匹配SKU', 'SKU名称', 'SKU'], getter: ({ item }) => getBestPriceMatch(item)?.skuName ?? '' },
  { names: ['采购成本价', '采购成本', '成本价'], getter: ({ item }) => getBestPriceMatch(item)?.purchaseCost ?? '' },
  { names: ['商品价', '商品价格', '货源价格'], getter: ({ item }) => getBestPriceMatch(item)?.itemPrice ?? '' },
  { names: ['运费', '预估运费'], getter: ({ item }) => getBestPriceMatch(item)?.shippingFee ?? '' },
  { names: ['尺寸', '规格尺寸'], getter: ({ item }) => getBestPriceMatch(item)?.dimensions ?? '' },
  { names: ['克重', '克重g', '重量g', '重量'], getter: ({ item }) => getBestPriceMatch(item)?.weightGram ?? '' },
  { names: ['克重置信度', '重量置信度'], getter: ({ item }) => getBestPriceMatch(item)?.weightConfidence ?? '' },
  { names: ['SKU图片相似度', 'SKU相似度', '相似度'], getter: ({ item }) => getBestPriceMatch(item)?.skuImageSimilarity ?? '' },
  { names: ['SKU图片URL'], getter: ({ item }) => getBestPriceMatch(item)?.skuImageUrl ?? '' },
  { names: ['供应商评分', '货源评分'], getter: ({ item }) => item.candidates?.[0]?.score ?? '' },
  { names: ['1688供应商', '供应商', '货源供应商'], getter: ({ item }) => findCandidateByOfferId(item, getBestPriceMatch(item)?.offerId ?? '')?.supplier ?? '' },
  { names: ['1688商品标题', '货源标题'], getter: ({ item }) => findCandidateByOfferId(item, getBestPriceMatch(item)?.offerId ?? '')?.title ?? '' },
];

const candidateOutputColumns: OutputColumn[] = [
  { names: ['候选序号', '推荐排名', '货源排名', '排名'], getter: ({ match, rank }) => match?.rank ?? rank ?? '' },
  { names: ['1688链接', '货源链接', '1688货源链接', '推荐1688链接'], getter: ({ match, candidate }) => match?.offerUrl ?? candidate?.offerUrl ?? '' },
  { names: ['offerId', 'Offer ID', '货源ID'], getter: ({ match, candidate }) => match?.offerId ?? candidate?.offerId ?? '' },
  { names: ['1688主图URL', '候选图片URL', '货源主图URL'], getter: ({ candidate }) => candidate?.coverImageUrl ?? '' },
  { names: ['列表图片相似度', '列表相似度'], getter: ({ candidate }) => candidate?.listImageSimilarity ?? '' },
  { names: ['1688候选数', '候选数', '货源数'], getter: ({ item }) => item.candidates?.length ?? 0 },
  { names: ['供应商类型', '货源类型'], getter: ({ candidate }) => candidate?.supplierType ?? '' },
  { names: ['会员供应商', '是否会员供应商', '会员'], getter: ({ candidate }) => (candidate ? (candidate.member ? '是' : '否') : '') },
  { names: ['供应商评分', '货源评分'], getter: ({ candidate }) => candidate?.score ?? '' },
  { names: ['采纳建议', '建议'], getter: ({ candidate }) => candidate?.suggestion ?? '' },
  { names: ['SKU名称', '匹配SKU', 'SKU'], getter: ({ match }) => match?.skuName ?? '' },
  { names: ['SKU图片URL'], getter: ({ match }) => match?.skuImageUrl ?? '' },
  { names: ['SKU图片相似度', 'SKU相似度', '相似度'], getter: ({ match }) => match?.skuImageSimilarity ?? '' },
  { names: ['采购价', '商品价', '商品价格', '货源价格'], getter: ({ match }) => match?.itemPrice ?? '' },
  { names: ['运费', '预估运费'], getter: ({ match }) => match?.shippingFee ?? '' },
  { names: ['采购总成本', '采购成本价', '采购成本', '成本价'], getter: ({ match }) => match?.purchaseCost ?? '' },
  { names: ['尺寸', '规格尺寸'], getter: ({ match }) => match?.dimensions ?? '' },
  { names: ['克重', '克重g', '重量g', '重量'], getter: ({ match }) => match?.weightGram ?? '' },
  { names: ['起批量', '最小起订量'], getter: ({ match }) => match?.quantity ?? '' },
  { names: ['年销量'], getter: ({ candidate }) => candidate?.annualSalesVolume ?? '' },
  { names: ['月代销'], getter: ({ candidate }) => candidate?.monthlyDistributionVolume ?? '' },
  { names: ['1688销量', '销量'], getter: ({ candidate }) => candidate?.salesVolume ?? '' },
  { names: ['1688销量文本', '销量文本'], getter: ({ candidate }) => candidate?.salesText ?? '' },
  { names: ['销量风险备注'], getter: ({ candidate }) => candidate?.salesRiskNote ?? '' },
  { names: ['克重来源', '重量来源'], getter: ({ match }) => match?.weightSource ?? '' },
  { names: ['克重置信度', '重量置信度'], getter: ({ match }) => match?.weightConfidence ?? '' },
  { names: ['提取来源'], getter: ({ match }) => match?.extractionSource ?? '' },
  { names: ['1688供应商', '供应商', '货源供应商'], getter: ({ candidate }) => candidate?.supplier ?? '' },
  { names: ['1688商品标题', '货源标题'], getter: ({ candidate }) => candidate?.title ?? '' },
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
      throw new Error('飞书多维表格 app_token 必填');
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
    const outputFields = await this.listFields(tables.outputBitable);
    const reviewFields = await this.listFields(tables.reviewBitable);
    const outputRecords = await this.searchRecordsWithoutView(tables.outputBitable);
    const reviewRecords = await this.searchRecordsWithoutView(tables.reviewBitable);
    const reviewRecordByKey = new Map(
      reviewRecords
        .map((record) => [buildProductSiteKey(
          readTextByCandidates(reviewFields, record, ['商品ID']),
          readTextByCandidates(reviewFields, record, ['国家/站点', '国家', '站点']),
        ), record] as const)
        .filter(([key]) => Boolean(key)),
    );
    const groups = groupPriceOutputRecords(outputFields, outputRecords);
    const targetBatchId = input.batchId?.trim();
    const targetGroups = [...groups.values()]
      .map((group) => ({ ...group, rows: getLatestBatchRows(group.rows) }))
      .filter((group) => !targetBatchId || group.rows.some((row) => row.batchId === targetBatchId))
      .filter((group) =>
        group.rows.some((row) => row.groupStatus === '已核实' || row.groupStatus === '待更新表三')
        && group.rows.some((row) => row.candidateStatus !== '失败'),
      );
    let generatedCount = 0;
    let failedCount = 0;

    for (const group of targetGroups) {
      await this.syncOutputGroupStatus(tables.outputBitable, outputFields, group);
      const reviewResult = buildReviewRecommendation(group.rows, input.weightToleranceGram ?? 5);
      const existingRecord = reviewRecordByKey.get(buildProductSiteKey(group.productId, group.site));
      const fieldsToWrite = buildFieldsByNames(reviewFields, {
        ...reviewResult.values,
        状态: reviewResult.success ? '待核实' : '失败',
        最后更新时间: Date.now(),
      });
      if (reviewResult.success) {
        const failureReasonField = pickField(reviewFields, ['失败归因', '失败原因']);
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
      throw new Error('输出货源表没有可确认的成功比价批次。请先完成一次比价并写入表二。');
    }

    const statusField = pickField(outputFields, ['商品组状态']);
    if (!statusField) {
      throw new Error('输出货源表缺少「商品组状态」字段，无法确认批次。');
    }

    const statusFieldName = getFeishuFieldName(statusField);
    let verifiedOutputCount = 0;
    for (const row of outputRows) {
      if (row.batchId !== batchId || row.candidateStatus === '失败') {
        continue;
      }
      if (row.groupStatus !== '已核实') {
        await this.updateRecordFields(tables.outputBitable, row.recordId, {
          [statusFieldName]: normalizeValueForField('已核实', statusField),
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
      throw new Error('待人工核实上架表没有可确认的最新批次，请先完成比价并生成表三。');
    }

    const statusField = pickField(reviewFields, ['状态']);
    if (!statusField) {
      throw new Error('待人工核实上架表缺少「状态」字段，无法确认进入上架。');
    }

    const statusFieldName = getFeishuFieldName(statusField);
    let approvedReviewCount = 0;
    for (const row of reviewRows) {
      if (row.batchId !== batchId || row.status === '失败') {
        continue;
      }
      if (row.status !== '已审核') {
        await this.updateRecordFields(tables.reviewBitable, row.recordId, {
          [statusFieldName]: normalizeValueForField('已审核', statusField),
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
      values.汇率 = input.exchangeRate;
      values['汇率(CNY/MYR)'] = input.exchangeRate;
    }
    if (typeof input.targetProfitRate === 'number' && Number.isFinite(input.targetProfitRate)) {
      values.目标利润率 = input.targetProfitRate;
    }
    if (typeof input.discountRate === 'number' && Number.isFinite(input.discountRate)) {
      values.折扣率 = input.discountRate;
    }
    if (typeof input.tkFeeRate === 'number' && Number.isFinite(input.tkFeeRate)) {
      values.TK费用合计总费率 = input.tkFeeRate;
      values['TK费用合计总费率(MYR)'] = input.tkFeeRate;
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
      const rowSite = normalizeSite(readTextByCandidates(fields, record, ['国家/站点', '国家', '站点', '市场']));
      if (targetSite && rowSite !== targetSite) {
        skippedCount += 1;
        continue;
      }
      const patch = { ...basePatch };
      const weightGram = readNumberByCandidates(fields, record, ['克重（g）', '克重', '重量g', '包裹重量g']);
      const shippingCost = typeof weightGram === 'number' && shippingFormula
        ? calculateListingShippingCost(weightGram, shippingFormula)
        : '';
      if (typeof shippingCost === 'number') {
        Object.assign(patch, buildFirstWritableFieldByNames(fields, [
          '跨境物流成本(当地货币)',
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
      throw new Error('旧上架/采购四表链路已停用；当前只允许使用 输入表、输出货源表、待人工核实上架表、AI上架编辑表。');
    }

    const appToken = input.appToken.trim();
    if (!appToken) {
      throw new Error('飞书多维表格 app_token 必填');
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
      throw new Error('AI上架结果表 app_token 必填');
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
      throw new Error('请先在AI上架配置里填写目标店铺ID');
    }

    const reviewBitable = await this.resolvePriceReviewBitable(input);
    const reviewFields = await this.listFields(reviewBitable);
    const reviewRecords = await this.searchRecords(reviewBitable);
    const reviewBatchId = input.batchId?.trim() ?? '';
    const approvedRows = reviewRecords
      .map((record) => readPriceReviewRecord(reviewFields, record))
      .filter((row) => row.status === '已审核')
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
          reason: '商品ID、国家/站点或目标店铺ID缺失',
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
          编辑状态: '需人工处理',
          采集状态: '失败',
          失败原因: '缺少采集链接：原商品链接和1688链接均为空',
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
          公共采集箱ID: existingRow.commonCollectBoxId,
          TikTok采集箱ID: existingRow.tiktokCollectBoxId,
          编辑模式: existingRow.editModel,
          SKU数量: existingRow.skuCount,
          采集状态: existingRow.collectStatus,
          认领状态: existingRow.claimStatus,
          店铺认领状态: existingRow.shopClaimStatus,
          编辑状态: existingRow.editStatus,
          发布准备状态: existingRow.publishReadyStatus,
          发布复核状态: existingRow.publishVerifyStatus,
          妙手发布状态: existingRow.miaoshouPublishStatus,
          妙手发布任务ID: existingRow.miaoshouPublishTaskId,
          TikTok商品ID: existingRow.tiktokProductId,
          已发布商品链接: existingRow.publishedProductUrl,
          维护状态: existingRow.maintenanceStatus,
          维护备注: existingRow.maintenanceNote,
          失败原因: existingRow.failureReason,
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
        });
        updatedCount += progressed ? 1 : 0;
      } catch (error) {
        failedCount += 1;
        await this.writeListingEditStatus(listingEditBitable, editFields, existingByKey.get(key), {
          ...baseValues,
          编辑状态: '失败',
          失败原因: error instanceof Error ? error.message : 'AI上架编辑表生成失败',
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
    const retryableStatuses = new Set(['待人工编辑', '需人工处理', '发布失败', '失败', '草稿已保存']);
    const rows = editRecords
      .map((record) => ({ record, row: readListingEditRecord(editFields, record) }))
      .filter(({ row }) => retryableStatuses.has(row.editStatus) || row.publishReadyStatus === '发布失败')
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
        missing.push('TikTok采集箱ID');
      }
      if (typeof row.unifiedSourcePrice !== 'number' || row.unifiedSourcePrice <= 0) {
        missing.push('统一货源价格');
      }
      if (typeof row.displayPrice !== 'number' || row.displayPrice <= 0) {
        missing.push('本地展示价');
      }
      if (typeof row.weightGram !== 'number' || row.weightGram <= 0) {
        missing.push('包裹重量g');
      }

      if (missing.length > 0) {
        failedCount += 1;
        await this.updateRecordFields(
          listingEditBitable,
          record.record_id,
          buildFieldsByNames(editFields, {
            编辑状态: '需人工处理',
            发布准备状态: missing.includes('本地展示价') ? '价格异常' : '资料缺失',
            失败原因: `请先修正：${missing.join('、')}`,
            最后更新时间: Date.now(),
          }),
        );
        continue;
      }

      await this.updateRecordFields(
        listingEditBitable,
        record.record_id,
        buildFieldsByNamesAllowEmpty(editFields, {
          编辑状态: '待保存草稿',
          发布准备状态: '待重新保存',
          失败原因: '',
          最后更新时间: Date.now(),
        }, ['失败原因']),
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
      .filter(({ row }) => row.editStatus === '待保存草稿')
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
            编辑状态: '保存中',
            失败原因: '',
            最后更新时间: Date.now(),
          }, ['失败原因']),
        );
        const shopId = row.targetShopId || targetShopId;
        if (!shopId) {
          throw new Error('目标店铺ID为空');
        }
        if (!row.tiktokCollectBoxId) {
          throw new Error('TikTok采集箱ID为空');
        }
        if (typeof row.weightGram !== 'number' || row.weightGram <= 0) {
          throw new Error('包裹重量g缺失');
        }
        if (typeof row.unifiedSourcePrice !== 'number' || row.unifiedSourcePrice <= 0) {
          throw new Error('统一货源价格缺失');
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
          throw new Error('妙手详情未返回ossMd5');
        }
        if (!shopCollectItemInfo || typeof shopCollectItemInfo !== 'object') {
          throw new Error('妙手详情未返回店铺模式商品信息');
        }

        const nextInfo = clonePlainObject(shopCollectItemInfo);
        applyListingEditToShopInfo(nextInfo, row);
        if (!hasMiaoshouCategory(nextInfo)) {
          throw new Error('妙手未自动匹配类目，可能是目标店铺未开通该类目或TikTok类目限制；请人工处理该商品');
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
          throw new Error(`保存后校验不一致：${verifyFailures.join('、')}`);
        }

        await this.updateRecordFields(
          listingEditBitable,
          record.record_id,
          buildFieldsByNamesAllowEmpty(editFields, {
            编辑状态: '草稿已保存',
            发布准备状态: getListingPublishReadyStatus(row),
            失败原因: getListingPublishReadyFailureReason(),
            最后更新时间: Date.now(),
          }, ['失败原因']),
        );
        savedCount += 1;
      } catch (error) {
        failedCount += 1;
        await this.updateRecordFields(
          listingEditBitable,
          record.record_id,
          buildFieldsByNames(editFields, {
            编辑状态: '需人工处理',
            失败原因: error instanceof Error ? error.message : '保存妙手草稿失败',
            最后更新时间: Date.now(),
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
      throw new Error('发布需要二次确认');
    }
    const listingEditBitable = await this.ensureListingEditTable(input.appToken);
    const editFields = await this.listFields(listingEditBitable);
    const editRecords = await this.searchRecords(listingEditBitable);
    const targetShopId = input.shopId?.trim() || input.targetShopId.trim();
    const hasExplicitShopFilter = Boolean(input.shopId?.trim());
    const rows = editRecords
      .map((record) => ({ record, row: readListingEditRecord(editFields, record) }))
      .filter(({ row }) => row.editStatus === '草稿已保存')
      .filter(({ row }) => !row.publishReadyStatus.includes('已提交发布'))
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
          throw new Error(`发布前检查未通过：${rowFailures.join('、')}`);
        }
        if (!rowShopId) {
          throw new Error('目标店铺ID为空');
        }
        await this.updateRecordFields(
          listingEditBitable,
          record.record_id,
          buildFieldsByNamesAllowEmpty(editFields, {
            发布准备状态: '发布中',
            失败原因: '',
            最后更新时间: Date.now(),
          }, ['失败原因']),
        );
        await input.publishProducts({
          detailIds: [row.tiktokCollectBoxId],
          shopIds: [rowShopId],
        });
        await this.updateRecordFields(
          listingEditBitable,
          record.record_id,
          buildFieldsByNamesAllowEmpty(editFields, {
            编辑状态: '已提交发布',
            发布准备状态: '已提交发布',
            发布复核状态: '待复核',
            妙手发布状态: '',
            TikTok商品ID: '',
            已发布商品链接: '',
            维护状态: '',
            维护备注: '',
            失败原因: '',
            最后更新时间: Date.now(),
          }, ['失败原因', '妙手发布状态', 'TikTok商品ID', '已发布商品链接', '维护状态', '维护备注']),
        );
        publishedCount += 1;
      } catch (error) {
        failedCount += 1;
        await this.updateRecordFields(
          listingEditBitable,
          record.record_id,
          buildFieldsByNames(editFields, {
            编辑状态: '需人工处理',
            发布准备状态: '发布失败',
            失败原因: error instanceof Error ? error.message : '妙手提交发布失败',
            最后更新时间: Date.now(),
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
              编辑状态: '需人工处理',
              发布准备状态: '资料缺失',
              失败原因: failureReason,
              最后更新时间: Date.now(),
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
          编辑状态: '发布中',
          发布准备状态: '浏览器模拟发布中',
          失败原因: '',
          最后更新时间: Date.now(),
        }, ['失败原因']),
      );

      const result = await input.publishByBrowser(row);
      const status = result.status === 'success' ? '已提交发布' : '需人工处理';
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
            编辑状态: status,
            发布准备状态: '已提交发布',
            发布复核状态: '待复核',
            妙手发布状态: result.publishResult || '浏览器已点击保存并发布',
            失败原因: '',
            最后更新时间: Date.now(),
          }, ['失败原因']),
        );
      } else {
        failedCount += 1;
        await this.updateRecordFields(
          listingEditBitable,
          record.record_id,
          buildFieldsByNames(editFields, {
            编辑状态: status,
            发布准备状态: result.currentStep || '浏览器模拟失败',
            失败原因: result.failureReason || '浏览器模拟保存并发布失败',
            最后更新时间: Date.now(),
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
          (row.editStatus === '已提交发布' || row.publishReadyStatus.includes('已提交发布') || Boolean(row.publishVerifyStatus)) &&
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
        const isPublished = result.publishVerifyStatus === '已发布';
        const isPending = ['发布中', '发布中待复核', '未发布'].includes(result.publishVerifyStatus);
        await this.updateRecordFields(
          listingEditBitable,
          record.record_id,
          buildFieldsByNamesAllowEmpty(editFields, {
            编辑状态: row.editStatus,
            发布复核状态: result.publishVerifyStatus,
            发布复核时间: Date.now(),
            妙手发布状态: result.miaoshouPublishStatus,
            妙手发布任务ID: result.miaoshouPublishTaskId,
            TikTok商品ID: result.tiktokProductId,
            已发布商品链接: result.publishedProductUrl,
            维护状态: isPublished ? row.maintenanceStatus || '可维护' : row.maintenanceStatus,
            维护备注: isPublished ? row.maintenanceNote || '发布复核已确认，可进入已发布维护入口' : row.maintenanceNote,
            失败原因: result.failureReason,
            最后更新时间: Date.now(),
          }, ['失败原因', 'TikTok商品ID', '已发布商品链接', '维护状态', '维护备注']),
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
            发布复核状态: '复核失败',
            发布复核时间: Date.now(),
            失败原因: error instanceof Error ? error.message : '发布结果复核失败',
            最后更新时间: Date.now(),
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
      .filter(({ row }) => row.publishVerifyStatus === '已发布' || row.editStatus === '已发布')
      .slice(0, getOptionalLimit(input.limit));

    let preparedCount = 0;
    let failedCount = 0;

    for (const { record, row } of rows) {
      const missing = [
        ...(!row.tiktokCollectBoxId ? ['TikTok采集箱ID'] : []),
        ...(!row.targetShopId ? ['目标店铺ID'] : []),
        ...(!row.targetShopSite ? ['目标店铺站点'] : []),
      ];
      if (missing.length > 0) {
        failedCount += 1;
        await this.updateRecordFields(
          listingEditBitable,
          record.record_id,
          buildFieldsByNames(editFields, {
            维护状态: '需人工处理',
            维护备注: `已发布维护缺少：${missing.join('、')}`,
            最后更新时间: Date.now(),
          }),
        );
        continue;
      }

      await this.updateRecordFields(
        listingEditBitable,
        record.record_id,
        buildFieldsByNamesAllowEmpty(editFields, {
          维护状态: '待维护',
          维护备注: '已发布维护入口已准备；后续只允许安全字段改价、改重量、改尺寸，保存前重新读取妙手详情',
          最后更新时间: Date.now(),
        }, ['维护备注']),
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
        .map((record) => fieldValueToText(record.fields[getFieldNameByCandidates(listingFields, ['关联键'])]))
        .filter(Boolean),
    );

    const records = outputRows
      .filter((row) => row.status === '成功' || row.status === '已完成')
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
    const keyFieldName = getFieldNameByCandidates(fields, ['审核键']);
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
      unavailableCount: auditRows.filter((row) => row.listingStatus === '不可上架' || row.listingStatus === '资料缺失').length,
      outputExcelPath: input.outputExcelPath,
    };
  }

  async exportMiaoshouListingPackage(input: ExportMiaoshouListingInput) {
    const tables = await this.ensureCommerceTables(input);
    const listingRows = await this.readListingProducts(tables.listingBitable);
    const exportableRows = listingRows.filter((row) => row.reviewStatus === '已通过' || row.reviewStatus === '待审核');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('妙手上架资料');
    const headers = [
      '商品ID',
      '站点',
      '店铺',
      '商品标题',
      '原商品链接',
      '主图URL',
      'SKU图片URL',
      'SKU名称',
      '1688链接',
      '采购成本价',
      '商品价',
      '运费',
      '克重',
      '尺寸',
      '供应商',
      '风险备注',
      '妙手定价模板名',
      '仓库',
      '物流模板',
      '发布方式',
    ];
    worksheet.columns = headers.map((header) => ({ header, key: header, width: Math.max(12, Math.min(28, header.length * 2 + 8)) }));

    for (const row of exportableRows) {
      worksheet.addRow({
        商品ID: row.productId,
        站点: input.site || 'TikTok Shop 跨境',
        店铺: input.shopName || '',
        商品标题: row.title,
        原商品链接: row.sourceUrl,
        主图URL: row.sourceImageUrl,
        SKU图片URL: row.skuImageUrl,
        SKU名称: row.skuName,
        '1688链接': row.offerUrl,
        采购成本价: row.purchaseCost,
        商品价: row.itemPrice,
        运费: row.shippingFee,
        克重: row.weightGram,
        尺寸: row.dimensions,
        供应商: row.supplier,
        风险备注: row.riskNote,
        妙手定价模板名: input.pricingTemplateName ?? '',
        仓库: input.warehouseName ?? '',
        物流模板: input.logisticsTemplateName ?? '',
        发布方式: '生成妙手草稿资料，人工检查后发布',
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
    const approvedRows = listingRows.filter((row) => row.reviewStatus === '已通过' && getMiaoshouCollectUrl(row, collectSource));
    const publicationFields = await this.listFields(tables.publicationBitable);
    const batchId = `miaoshou-source-${Date.now()}`;
    let importedCount = 0;
    let failedCount = 0;

    for (const row of approvedRows) {
      const collectUrl = getMiaoshouCollectUrl(row, collectSource);
      try {
        if (!collectUrl) {
          throw new Error(collectSource === 'sourceUrl' ? '缺少原商品链接，无法导入妙手采集箱' : '缺少1688链接，无法导入妙手采集箱');
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
              status: detailId ? '已导入公共采集箱' : '妙手导入失败',
              failureReason: detailId ? '' : '妙手未返回公共采集箱ID',
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
              status: '妙手导入失败',
              failureReason: error instanceof Error ? error.message : '货源采集导入失败',
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
        commonId: readTextByCandidates(publicationFields, record, ['公共采集箱ID', '妙手草稿ID']),
        status: readTextByCandidates(publicationFields, record, ['刊登状态']),
      }))
      .filter((row) => row.commonId && !['已认领到TikTok采集箱', '已发布'].includes(row.status));

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
            TikTok采集箱ID: tiktokId ? String(tiktokId) : '',
            刊登状态: tiktokId ? '已认领到TikTok采集箱' : '认领失败',
            失败原因: tiktokId ? '' : '妙手未返回 TikTok 采集箱ID',
            最后更新时间: Date.now(),
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
            刊登状态: '认领失败',
            失败原因: error instanceof Error ? error.message : '认领到 TikTok 失败',
            最后更新时间: Date.now(),
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
          ...(!site ? ['目标站点'] : []),
          ...(!shopId ? ['目标店铺ID'] : []),
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
    const alreadySubmittedCount = rows.filter(({ row }) => row.editStatus === '已提交发布' || row.publishReadyStatus.includes('已提交发布')).length;

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
    const publishedRows = listingRows.filter((row) => row.publicationStatus === '已发布' || row.publicationStatus === '出单待采购');
    const purchaseFields = await this.listFields(tables.purchaseBitable);
    const existingRows = await this.searchRecords(tables.purchaseBitable);
    const existingKeys = new Set(
      existingRows
        .map((record) => fieldValueToText(record.fields[getFieldNameByCandidates(purchaseFields, ['关联键'])]))
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
    const approvedRows = listingRows.filter((row) => row.reviewStatus === '已通过');
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
              status: '妙手草稿已创建',
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
              status: '妙手导入失败',
              failureReason: error instanceof Error ? error.message : '妙手 API 创建草稿失败',
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
      throw new Error('输入表缺少「状态」字段');
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

      await this.updateInputRecordStatus(bitable, record.record_id, getRunningInputStatus(fields), fields);
      return {
        recordId: record.record_id,
        sourceUrl: row.sourceUrl ?? '',
        item: row,
      };
    }

    return null;
  }

  async exportSelectionRecordToExcel(input: ExportSelectionRecordToExcelInput) {
    const fields = await this.listFields(input.bitable);
    const records = await this.searchRecords(input.bitable);
    const record = records.find((item) => item.record_id === input.recordId);
    if (!record) {
      throw new Error(`待核实记录不存在：${input.recordId}`);
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
      throw new Error('输入表缺少「状态」字段');
    }

    await this.updateRecordFields(bitable, recordId, { [statusFieldName]: status });
  }

  async markInputRecordEnteredComparison(
    bitable: FeishuBitableConfig,
    recordId: string,
    batchId: string,
    status = '已进入比价',
  ) {
    const fields = await this.listFields(bitable);
    const patch = buildFieldsByNames(fields, {
      状态: findFieldByName(fields, '当前比价批次号') ? status : '已完成',
      当前比价批次号: batchId,
      最后更新时间: Date.now(),
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
      状态: '失败',
      失败归因: normalizeInputFailureReason(message),
      备注: message,
      最后更新时间: Date.now(),
    });
    if (Object.keys(patch).length === 0) {
      await this.updateInputRecordStatus(bitable, recordId, '失败', fields);
      return;
    }

    await this.updateRecordFields(bitable, recordId, patch);
  }

  async syncInputStatusesByItems(bitable: FeishuBitableConfig, items: ProductItem[]) {
    const fields = await this.listFields(bitable);
    const statusField = pickField(fields, statusFieldCandidates);
    const sourceUrlField = pickField(fields, sourceUrlFieldCandidates);
    const productIdField = pickField(fields, ['商品ID', '原商品ID', '产品ID', 'Product ID']);
    const statusFieldName = statusField ? getFeishuFieldName(statusField) : '';
    const sourceUrlFieldName = sourceUrlField ? getFeishuFieldName(sourceUrlField) : '';
    const productIdFieldName = productIdField ? getFeishuFieldName(productIdField) : '';
    if (!statusFieldName) {
      throw new Error('输入表缺少「状态」字段');
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
        原商品ID: item.productId,
        原商品链接: item.sourceUrl ?? '',
        郑和数据链接: item.zhengheDataUrl ?? '',
        原商品主图URL: item.imageUrl ?? '',
        商品标题: item.title ?? '',
        国家: item.country ?? '',
        类目: item.category ?? '',
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
    let sourceUrl = String(row['原商品链接'] ?? '').trim();
    const zhengheDataUrl = String(row['郑和数据链接'] ?? '').trim();
    const parsedSource = parseTikTokProductUrl(sourceUrl);
    const existingCountry = normalizeInputCountry(String(row['国家'] ?? '').trim());
    const fallbackCountry = normalizeInputCountry(this.options.defaultSite ?? '');
    const parsedZhenghe = parseZhengheProductReference(zhengheDataUrl);
    const existingProductId = String(row['原商品ID'] ?? '').trim();
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
    let imageUrl = String(row['原商品主图URL'] ?? '').trim();
    let title = String(row['商品标题'] ?? '').trim();
    let category = String(row['类目'] ?? '').trim();
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
          row['原商品主图URL'] = '';
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
    setDerivedRowValue(fields, row, patch, productIdFieldCandidates, '原商品ID', productId, shouldOverwriteZhengheFields);
    setDerivedRowValue(fields, row, patch, sourceUrlFieldCandidates, '原商品链接', sourceUrl, shouldOverwriteZhengheFields);
    setDerivedRowValue(fields, row, patch, imageUrlFieldCandidates, '原商品主图URL', imageUrl, shouldOverwriteZhengheFields);
    setDerivedRowValue(fields, row, patch, titleFieldCandidates, '商品标题', title, shouldOverwriteZhengheFields);
    setDerivedRowValue(fields, row, patch, countryFieldCandidates, '国家', country, shouldOverwriteZhengheFields);
    setDerivedRowValue(fields, row, patch, categoryFieldCandidates, '类目', category, shouldOverwriteZhengheFields);

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
      label: '表一',
      bitable: input.duplicateScope.inputBitable ?? input.bitable,
      productId,
      site,
      excludedRecordId: input.record.record_id,
      validStatuses: ['待处理', '处理中', '已进入比价', '已重复', '失败', '待核实', '核实中', '已完成'],
    });
    if (inputDuplicate) {
      return inputDuplicate;
    }

    const outputDuplicate = await this.findDuplicateInTable({
      label: '表二',
      bitable: input.duplicateScope.outputBitable,
      productId,
      site,
      excludedInputRecordId: input.record.record_id,
      validStatuses: ['比价中', '待核实', '已核实', '待更新表三', '失败', '成功', '已完成'],
    });
    if (outputDuplicate) {
      return outputDuplicate;
    }

    return this.findDuplicateInTable({
      label: '表三',
      bitable: input.duplicateScope.reviewBitable,
      productId,
      site,
      excludedInputRecordId: input.record.record_id,
      validStatuses: ['核实中', '待核实', '已审核', '采集中', '采集完成', '失败'],
    });
  }

  private async findDuplicateInTable(input: {
    label: '表一' | '表二' | '表三';
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
        const rowInputRecordId = readTextByCandidates(fields, record, ['输入表记录ID']);
        if (rowInputRecordId === input.excludedInputRecordId) {
          continue;
        }
      }

      const productId = readTextByCandidates(fields, record, ['商品ID', '原商品ID', '产品ID', 'Product ID']);
      const site = readTextByCandidates(fields, record, ['国家/站点', '国家', '站点', '市场']);
      if (buildProductSiteKey(productId, site) !== buildProductSiteKey(input.productId, input.site)) {
        continue;
      }

      const status = readTextByCandidates(fields, record, ['状态', '商品组状态', '候选状态', '搜图状态', '处理状态']);
      if (status && !input.validStatuses.includes(status)) {
        continue;
      }
      if (input.label === '表二') {
        const offerId = readTextByCandidates(fields, record, ['offerId', 'Offer ID', '货源ID']);
        const offerUrl = readTextByCandidates(fields, record, ['1688链接', '推荐1688链接', '货源链接'], true);
        const candidateStatus = readTextByCandidates(fields, record, ['状态', '候选状态', '商品组状态']);
        if (candidateStatus === '失败' && !offerId && !offerUrl) {
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
      状态: '已重复',
      失败归因: '商品已重复',
      重复位置: duplicate.location,
      重复记录ID: duplicate.recordId,
      备注: `按 商品ID + 国家/站点 命中重复：${duplicate.location} / ${duplicate.recordId}`,
      最后更新时间: Date.now(),
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
      状态: '失败',
      失败归因: failureReasons,
      备注: failureReasons.join('；'),
      最后更新时间: Date.now(),
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
            column.targetHeader === '原商品链接' || column.targetHeader === '郑和数据链接' || column.targetHeader === '原商品主图URL',
          )
        : '';
    }
    await this.fillDerivedInputValues(bitable, fields, record, row);
    const zhengheReference = parseZhengheProductReference(String(row['郑和数据链接'] ?? '').trim());
    const tiktokReference = parseTikTokProductUrl(String(row['原商品链接'] ?? '').trim());
    const productId =
      String(row['原商品ID'] ?? '').trim() ||
      zhengheReference.productId ||
      tiktokReference.productId ||
      (String(row['原商品主图URL'] ?? '').trim() ? `img_${record.record_id}` : '');
    const rawCountry = normalizeInputCountry(String(row['国家'] ?? '').trim());
    const country =
      rawCountry ||
      zhengheReference.region ||
      tiktokReference.country ||
      normalizeInputCountry(this.options.defaultSite ?? '') ||
      '';

    return {
      rowIndex: 2,
      productId,
      sourceUrl: String(row['原商品链接'] ?? '').trim(),
      zhengheDataUrl: String(row['郑和数据链接'] ?? '').trim(),
      imageUrl: String(row['原商品主图URL'] ?? '').trim(),
      sourceImageUrl: String(row['原商品主图URL'] ?? '').trim(),
      title: String(row['商品标题'] ?? '').trim(),
      country,
      category: String(row['类目'] ?? '').trim(),
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
          groupStatus: candidateStatus === '成功' ? '已核实' : '失败',
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
    const groupStatus = row.groupStatus ?? (candidateStatus === '成功' ? '已核实' : row.item.status === 'success' ? '待核实' : '失败');
    Object.assign(values, buildFieldsByNames(fields, {
      商品组状态: groupStatus,
      候选状态: candidateStatus,
      比价批次号: options.batchId,
      输入表记录ID: options.inputRecordId,
      候选序号: row.match?.rank ?? row.rank ?? 0,
      失败归因: getOutputFailureReason(row.item),
      风险备注: getRiskNoteForOutputRow(row),
      最后更新时间: Date.now(),
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
      编辑状态: '失败',
      失败原因: input.reason,
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
        关联键: input.row.key,
        商品ID: input.row.productId,
        '国家/站点': input.row.site,
        表三记录ID: input.row.reviewRecordId,
        AI上架编辑表记录ID: input.editRecordId,
        offerId: input.row.offerId || extractOfferIdFromUrl(input.row.offerUrl),
        货源ID: input.row.collectSourceItemId || input.row.productId,
        采集源货源ID: input.row.collectSourceItemId || input.row.productId,
        采购总成本: input.row.purchaseCost,
        克重: input.row.weightGram,
        目标店铺ID: input.row.targetShopId,
        目标店铺名称: input.row.targetShopName,
        公共采集箱ID: input.row.commonCollectBoxId,
        TikTok采集箱ID: input.row.tiktokCollectBoxId,
        妙手定价模板ID: input.browserResult.template?.priceTemplateId ?? '',
        妙手定价模板名: input.browserResult.template?.name ?? '',
        浏览器模拟状态: input.browserResult.status === 'success' ? '已提交发布' : '失败',
        当前步骤: input.browserResult.currentStep,
        发布结果: input.browserResult.publishResult,
        失败原因: input.browserResult.failureReason,
        失败截图路径: input.browserResult.screenshotPath,
        最后更新时间: Date.now(),
      }),
    }]);
  }

  private async createListingEditRecord(
    listingEditBitable: FeishuBitableConfig,
    editFields: FeishuField[],
    values: Record<string, unknown>,
  ) {
    const recordKey = String(values.关联键 ?? '');
    await this.batchCreateRecords(listingEditBitable, [{ fields: buildFieldsByNames(editFields, values) }]);
    const records = await this.searchRecordsWithoutView(listingEditBitable);
    const created = records.find((record) => readTextByCandidates(editFields, record, ['关联键']) === recordKey);
    if (!created) {
      throw new Error('AI上架编辑表记录已创建，但未能按关联键回查');
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
      最后更新时间: Date.now(),
    }, ['失败原因', '公共采集箱ID', 'TikTok采集箱ID']);
    if (existingRecord) {
      await this.updateRecordFields(listingEditBitable, existingRecord.record_id, fieldsToWrite);
      return existingRecord;
    }

    await this.batchCreateRecords(listingEditBitable, [{ fields: fieldsToWrite }]);
    const recordKey = String(values.关联键 ?? '');
    const records = await this.searchRecordsWithoutView(listingEditBitable);
    return records.find((record) => readTextByCandidates(editFields, record, ['关联键']) === recordKey);
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
        公共采集箱ID: '',
        TikTok采集箱ID: '',
        认领状态: '待采集',
        店铺认领状态: '待采集',
        采集状态: '采集中',
        编辑状态: '采集中',
        失败原因: '',
      });
      const collectUrl = getReviewCollectUrl(input.reviewRow);
      if (!collectUrl) {
        throw new Error('缺少采集链接：原商品链接和1688链接均为空');
      }
      const mapping = await input.importLinks([collectUrl]);
      const nextCommonCollectBoxId = String(mapping[collectUrl] ?? Object.values(mapping)[0] ?? '');
      if (!nextCommonCollectBoxId) {
        throw new Error('妙手未返回公共采集箱ID');
      }
      await this.writeListingEditStatus(input.listingEditBitable, input.editFields, input.record, {
        ...baseValues,
        公共采集箱ID: nextCommonCollectBoxId,
        TikTok采集箱ID: '',
        采集状态: '采集中',
        编辑状态: '采集中',
        失败原因: '',
      });
      return nextCommonCollectBoxId;
    };

    const claimToTiktokCollectBox = async (currentCommonCollectBoxId: string) => {
      await this.writeListingEditStatus(input.listingEditBitable, input.editFields, input.record, {
        ...baseValues,
        公共采集箱ID: currentCommonCollectBoxId,
        采集状态: '已采集公共采集箱',
        认领状态: '认领中',
        编辑状态: '认领中',
        失败原因: '',
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
        throw new Error('妙手未返回TikTok采集箱ID');
      }
      await this.writeListingEditStatus(input.listingEditBitable, input.editFields, input.record, {
        ...baseValues,
        公共采集箱ID: currentCommonCollectBoxId,
        TikTok采集箱ID: nextTiktokCollectBoxId,
        认领状态: '已认领TikTok采集箱',
        编辑状态: '已认领TikTok采集箱',
        失败原因: '',
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
      if (!isStaleMiaoshouCollectBoxError(error)) {
        throw error;
      }
      commonCollectBoxId = await collectSourceLink();
      tiktokCollectBoxId = '';
      commonDetail = await pollCommonCollectBoxDetail(commonCollectBoxId, input.getCommonCollectBoxDetail);
    }
    void commonDetail;
    await this.writeListingEditStatus(input.listingEditBitable, input.editFields, input.record, {
      ...baseValues,
      公共采集箱ID: commonCollectBoxId,
      采集状态: '已采集公共采集箱',
      编辑状态: tiktokCollectBoxId ? '已认领TikTok采集箱' : '认领中',
      失败原因: '',
    });

    if (!tiktokCollectBoxId) {
      tiktokCollectBoxId = await claimToTiktokCollectBox(commonCollectBoxId);
    }

    if (existingRow.shopClaimStatus !== '已认领目标店铺') {
      await this.writeListingEditStatus(input.listingEditBitable, input.editFields, input.record, {
        ...baseValues,
        公共采集箱ID: commonCollectBoxId,
        TikTok采集箱ID: tiktokCollectBoxId,
        店铺认领状态: '店铺认领中',
        编辑状态: '店铺认领中',
        失败原因: '',
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
        公共采集箱ID: commonCollectBoxId,
        TikTok采集箱ID: tiktokCollectBoxId,
        采集状态: '已采集公共采集箱',
        认领状态: '已认领TikTok采集箱',
        店铺认领状态: '店铺认领中',
        编辑状态: '店铺认领中',
        失败原因: '',
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
      const reason = '妙手未触发预发布店铺选择，请先在妙手采集箱点击“选择店铺”并选择目标店铺';
      await this.writeListingEditStatus(input.listingEditBitable, input.editFields, input.record, {
        ...baseValues,
        公共采集箱ID: commonCollectBoxId,
        TikTok采集箱ID: tiktokCollectBoxId,
        采集状态: '已采集公共采集箱',
        认领状态: '已认领TikTok采集箱',
        店铺认领状态: '需人工选择店铺',
        编辑状态: '需人工处理',
        失败原因: reason,
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
      throw new Error('妙手详情读取失败');
    }
    const skuCount = countActiveSkus(shopCollectItemInfo);
    if (skuCount <= 0) {
      throw new Error('妙手店铺模式详情未返回有效SKU');
    }
    const title = extractShopTitle(shopCollectItemInfo);
    if (!hasMiaoshouCategory(shopCollectItemInfo)) {
      const reason = '妙手未自动匹配类目，可能是目标店铺未开通该类目或TikTok类目限制；请人工处理该商品';
      await this.writeListingEditStatus(input.listingEditBitable, input.editFields, input.record, {
        ...baseValues,
        编辑标题: existingRow.editTitle || title,
        公共采集箱ID: commonCollectBoxId,
        TikTok采集箱ID: tiktokCollectBoxId,
        编辑模式: detailPayload.mode,
        SKU数量: skuCount,
        采集状态: '已采集公共采集箱',
        认领状态: '已认领TikTok采集箱',
        店铺认领状态: '已认领目标店铺',
        编辑状态: '需人工处理',
        发布准备状态: '类目未自动匹配',
        失败原因: reason,
      });
      return false;
    }

    await this.writeListingEditStatus(input.listingEditBitable, input.editFields, input.record, {
      ...baseValues,
      编辑标题: existingRow.editTitle || title,
      公共采集箱ID: commonCollectBoxId,
      TikTok采集箱ID: tiktokCollectBoxId,
      编辑模式: detailPayload.mode,
      SKU数量: skuCount,
      采集状态: '已采集公共采集箱',
      认领状态: '已认领TikTok采集箱',
      店铺认领状态: '已认领目标店铺',
      编辑状态: '待人工编辑',
      发布准备状态: '待人工编辑后保存',
      失败原因: '',
    });

    return true;
  }

  private buildListingProductFields(fields: FeishuField[], row: SourcingOutputRecord) {
    return buildFieldsByNames(fields, {
      关联键: row.key,
      商品ID: row.productId,
      原商品链接: row.sourceUrl,
      郑和数据链接: row.zhengheDataUrl,
      原商品主图URL: row.sourceImageUrl,
      '1688链接': row.offerUrl,
      offerId: row.offerId,
      SKU名称: row.skuName,
      SKU图片URL: row.skuImageUrl,
      采购成本价: row.purchaseCost,
      商品价: row.itemPrice,
      运费: row.shippingFee,
      尺寸: row.dimensions,
      克重: row.weightGram,
      供应商: row.supplier,
      相似度: row.similarity,
      风险备注: row.riskNote,
      审核状态: '待审核',
      刊登状态: '待生成妙手资料',
      采购绑定状态: '未绑定订单',
      商品标题: row.title,
      国家: row.country,
      类目: row.category,
      最后更新时间: Date.now(),
    });
  }

  private buildPublicationFields(
    fields: FeishuField[],
    row: ListingProductRecord,
    input: ExportMiaoshouListingInput,
    batchId: string,
  ) {
    return buildFieldsByNames(fields, {
      关联键: row.key,
      商品ID: row.productId,
      站点: input.site || 'TikTok Shop 跨境',
      店铺: input.shopName || '',
      妙手模板名: input.pricingTemplateName ?? '',
      妙手草稿ID: '',
      导入批次号: batchId,
      刊登状态: '已生成妙手资料',
      失败原因: '',
      资料包路径: input.outputExcelPath,
      最后更新时间: Date.now(),
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
      关联键: row.key,
      商品ID: row.productId,
      站点: 'TikTok Shop 跨境',
      店铺: '',
      妙手模板名: '妙手开放平台 API',
      妙手草稿ID: result.draftId,
      公共采集箱ID: result.commonCollectBoxId,
      TikTok采集箱ID: result.tiktokCollectBoxId,
      导入批次号: result.batchId,
      刊登状态: result.status,
      失败原因: result.failureReason,
      发布前检查: result.publishCheck,
      资料包路径: '',
      最后更新时间: Date.now(),
    });
  }

  private buildPurchaseFields(fields: FeishuField[], row: ListingProductRecord, freightForwarderAddress: string) {
    return buildFieldsByNames(fields, {
      关联键: row.key,
      订单号: '',
      商品ID: row.productId,
      offerId: row.offerId,
      '1688链接': row.offerUrl,
      SKU名称: row.skuName,
      采购数量: 1,
      采购单价: row.itemPrice,
      采购运费: row.shippingFee,
      货代地址: freightForwarderAddress,
      确认状态: '待二次确认',
      '1688订单号': '',
      采购状态: '采购确认中',
      物流单号: '',
      异常备注: freightForwarderAddress ? '自动生成采购任务，提交付款前必须人工二次确认。' : '缺少货代地址，需人工处理。',
      最后更新时间: Date.now(),
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
      throw new Error(`${input.tableName} app_token 必填`);
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
      throw new Error(`飞书数据表创建成功但未返回 table_id：${input.tableName}`);
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
          throw new Error(`字段类型不匹配：${field.field_name}，当前类型 ${existingField.type}，期望类型 ${field.type}`);
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
    const statusFieldName = getFieldNameByCandidates(fields, ['商品组状态']);
    if (!statusFieldName || group.rows.length === 0) {
      return;
    }

    const targetStatus = group.rows.find((row) => row.groupStatus === '待更新表三')?.groupStatus
      ?? group.rows.find((row) => row.groupStatus === '已核实')?.groupStatus
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
      throw new Error(`飞书 tenant_access_token 获取失败：${response.status} ${response.statusText}`);
    }

    const payload = (await response.json()) as { code: number; msg: string; tenant_access_token?: string; expire?: number };
    if (payload.code !== 0 || !payload.tenant_access_token) {
      throw new Error(`飞书 tenant_access_token 获取失败：${payload.msg || payload.code}（code: ${payload.code}）`);
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
      throw new Error(`飞书接口请求失败：${response.status} ${response.statusText}`);
    }

    const payload = (await response.json()) as T;
    if (payload.code !== 0) {
      throw new Error(`飞书接口返回错误：${payload.msg || payload.code}（code: ${payload.code}）`);
    }

    return payload;
  }
}

export function assertFeishuBitableConfig(label: string, bitable?: FeishuBitableConfig): asserts bitable is FeishuBitableConfig {
  if (!bitable?.appToken?.trim() || !bitable.tableId?.trim()) {
    throw new Error(`${label}多维表格 app_token 和 table_id 必填`);
  }
}

export function assertFeishuCredentials(appId: string, appSecret: string) {
  if (!appId.trim() || !appSecret.trim()) {
    throw new Error('请先在 AI比价配置填写飞书 app_id 和 app_secret');
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
    pickField(fields, ['1688链接', '货源链接', '1688货源链接', '推荐1688链接']) ||
      pickField(fields, ['推荐排名', '货源排名', '排名']) ||
      pickField(fields, ['offerId', 'Offer ID', '货源ID']),
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
  return item.status === 'success' ? '成功' : '失败';
}

function getOutputCandidateStatus(row: OutputRow) {
  return row.item.status === 'success' && Boolean(row.match?.offerUrl || row.candidate?.offerUrl) ? '成功' : '失败';
}

function getOutputGroupStatus(item: ProductItem, rows: Array<Pick<OutputRow, 'candidateStatus'>>) {
  if (item.status !== 'success') {
    return '失败';
  }
  if (rows.length > 0 && rows.every((row) => row.candidateStatus === '成功')) {
    return '已核实';
  }
  return '待核实';
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
    return value ? '是' : '否';
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeFieldValueForExcel(item, preferUrl)).filter(Boolean).join('、');
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
      .split(/[；;、,，]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (field.type === 7) {
    if (typeof value === 'boolean') {
      return value;
    }
    return ['true', '1', '是', '已选', '选中', 'yes'].includes(String(value).trim().toLowerCase());
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

  return ['true', '1', '是', '已选', '选中', 'yes'].includes(fieldValueToText(value).toLowerCase());
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
    ].join('；');
  }

  return item.errorMessage ?? '处理失败';
}

function getRiskNoteForOutputRow(row: OutputRow) {
  if (row.item.status !== 'success') {
    return row.item.errorMessage ?? '处理失败';
  }

  const riskFlags = [
    ...(row.candidate?.riskFlags ?? []),
    ...(row.match?.riskFlags ?? []),
  ];
  if (riskFlags.length > 0) {
    return riskFlags.join('；');
  }

  return getRiskNote(row.item);
}

function getOutputFailureReason(item: ProductItem) {
  if (item.status === 'success' && (item.skuMatches ?? []).length > 0) {
    return '';
  }

  if (item.status === 'missing_image') {
    return '主图下载失败';
  }

  if (item.status === 'not_found') {
    return '1688无搜索结果';
  }

  const message = item.errorMessage ?? '';
  if (/候选解析|未解析出候选|候选详情链接|搜图结果页|搜图/.test(message)) return '1688搜图失败';
  if (/SKU/.test(message)) return 'SKU匹配失败';
  if (/运费/.test(message)) return '运费缺失';
  if (/价格|采购/.test(message)) return '采购价缺失';
  if (/详情页/.test(message)) return '详情页解析失败';
  if (/登录/.test(message)) return '1688登录失效';
  if (/验证|验证码|拦截/.test(message)) return '1688验证拦截';
  if (/搜图/.test(message)) return '1688搜图失败';
  return item.status === 'success' ? '' : '未知异常';
}

function getInputPreflightFailures(item: ProductItem) {
  const failures: string[] = [];
  const zhengheDataUrl = item.zhengheDataUrl?.trim() ?? '';
  const sourceUrl = item.sourceUrl?.trim() ?? '';
  const imageUrl = item.sourceImageUrl?.trim() || item.imageUrl?.trim() || '';
  const hasAnySearchEntry = Boolean(zhengheDataUrl || sourceUrl || imageUrl);

  if (zhengheDataUrl && isZhengheDetailUrl(zhengheDataUrl) && !parseZhengheProductReference(zhengheDataUrl).productId) {
    failures.push('郑和商品ID解析失败');
  }
  if (zhengheDataUrl && !isHttpUrl(zhengheDataUrl)) {
    failures.push('郑和链接格式错误');
  }
  if (!hasAnySearchEntry) {
    failures.push('郑和链接为空');
    failures.push('原商品链接缺失');
    failures.push('原商品主图缺失');
  }
  if (zhengheDataUrl && !item.productId?.trim()) {
    failures.push(zhengheDataUrl ? '郑和商品ID解析失败' : '郑和链接为空');
  }
  if (zhengheDataUrl && !item.country?.trim()) {
    failures.push('国家/站点解析失败');
  }

  return [...new Set(failures)];
}

function normalizeInputFailureReason(message: string) {
  if (/郑和.*格式|链接.*格式/.test(message)) return '郑和链接格式错误';
  if (/郑和.*商品ID|商品ID/.test(message)) return '郑和商品ID解析失败';
  if (/国家|站点|region/i.test(message)) return '国家/站点解析失败';
  if (/主图|图片/.test(message)) return '原商品主图缺失';
  if (/原商品链接|商品链接/.test(message)) return '原商品链接缺失';
  if (/郑和.*接口|郑和.*请求/.test(message)) return '郑和接口请求失败';
  if (/郑和.*返回.*空/.test(message)) return '郑和返回数据为空';
  if (/郑和.*字段/.test(message)) return '郑和返回字段缺失';
  return '未知异常';
}

function getRunningInputStatus(fields: FeishuField[]) {
  return findFieldByName(fields, '当前比价批次号') ? '处理中' : '核实中';
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
    return (item.candidates ?? []).length > 0 ? '成功' : '未找到';
  }

  if (item.status === 'missing_image') {
    return '缺少主图';
  }

  if (item.status === 'not_found') {
    return '未找到';
  }

  return '失败';
}

function getRealtimeRowStatus(item: ProductItem) {
  if (item.status === 'success') {
    return (item.candidates ?? []).length > 0 ? '已完成' : '失败';
  }

  return '失败';
}

function matchesClaimStatus(status: string, statusFilter: RowStatusFilter) {
  if (statusFilter === 'failedOnly') {
    return status === '失败';
  }

  if (statusFilter === 'pendingOnly') {
    return !status || status === '待处理' || status === '待核实';
  }

  return !['已完成', '已进入比价', '处理中', '核实中', '已重复'].includes(status);
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
  const productId = readTextByCandidates(fields, record, ['商品ID', '原商品ID', '产品ID', 'Product ID']);
  const offerId = readTextByCandidates(fields, record, ['offerId', 'Offer ID', '货源ID']);
  const skuName = readTextByCandidates(fields, record, ['SKU名称', '匹配SKU', 'SKU']);

  return {
    key: buildCommerceKey(productId, offerId, skuName),
    productId,
    sourceUrl: readTextByCandidates(fields, record, ['原商品链接', '商品链接', '商品URL', '原链接'], true),
    zhengheDataUrl: readTextByCandidates(fields, record, ['郑和数据链接', '郑和链接', '郑和商品链接'], true),
    sourceImageUrl: readTextByCandidates(fields, record, ['原商品主图URL', '主图URL', '商品主图', '图片URL'], true),
    offerUrl: readTextByCandidates(fields, record, ['1688链接', '货源链接', '1688货源链接', '推荐1688链接'], true),
    offerId,
    skuName,
    skuImageUrl: readTextByCandidates(fields, record, ['SKU图片URL'], true),
    purchaseCost: readNumberByCandidates(fields, record, ['采购成本价', '采购成本', '成本价']),
    itemPrice: readNumberByCandidates(fields, record, ['商品价', '商品价格', '货源价格']),
    shippingFee: readNumberByCandidates(fields, record, ['运费', '预估运费']),
    dimensions: readTextByCandidates(fields, record, ['尺寸', '规格尺寸']),
    weightGram: readNumberByCandidates(fields, record, ['克重', '克重g', '重量g', '重量']),
    supplier: readTextByCandidates(fields, record, ['1688供应商', '供应商', '货源供应商']),
    similarity: readNumberByCandidates(fields, record, ['SKU图片相似度', 'SKU相似度', '相似度', '列表图片相似度', '列表相似度']),
    riskNote: readTextByCandidates(fields, record, ['风险备注', '风险标记', '备注', '失败原因']),
    title: readTextByCandidates(fields, record, ['原商品标题', '商品标题', '标题', '品名']),
    country: readTextByCandidates(fields, record, ['国家', '站点', '市场']),
    category: readTextByCandidates(fields, record, ['类目', '分类']),
    status: readTextByCandidates(fields, record, ['状态', '搜图状态', '处理状态', '原链接状态']),
    rank,
  };
}

function readPriceOutputRow(fields: FeishuField[], record: FeishuRecord): PriceOutputRow {
  const itemPrice = readNumberByCandidates(fields, record, ['采购价', '商品价', '商品价格', '货源价格']);
  const shippingFee = readNumberByCandidates(fields, record, ['运费', '预估运费']);
  const purchaseCost =
    readNumberByCandidates(fields, record, ['采购总成本', '采购成本价', '采购成本', '成本价']) ||
    (typeof itemPrice === 'number' && typeof shippingFee === 'number' ? itemPrice + shippingFee : '');

  return {
    recordId: record.record_id,
    productId: readTextByCandidates(fields, record, ['商品ID', '原商品ID', '产品ID', 'Product ID']),
    site: readTextByCandidates(fields, record, ['国家/站点', '国家', '站点', '市场']),
    groupStatus: readTextByCandidates(fields, record, ['商品组状态', '状态']),
    candidateStatus: readTextByCandidates(fields, record, ['候选状态', '搜图状态', '处理状态']),
    purchaseCost,
    weightGram: readNumberByCandidates(fields, record, ['克重', '克重g', '重量g', '重量']),
    dimensions: readTextByCandidates(fields, record, ['尺寸', '规格尺寸']),
    manuallySelected: fieldValueToBoolean(record.fields[getFieldNameByCandidates(fields, ['人工指定上架货源'])]),
    batchId: readTextByCandidates(fields, record, ['比价批次号', '当前比价批次号']),
    inputRecordId: readTextByCandidates(fields, record, ['输入表记录ID']),
    candidateRank: readNumberByCandidates(fields, record, ['候选序号', '推荐排名', '货源排名', '排名']),
    offerUrl: readTextByCandidates(fields, record, ['1688链接', '货源链接', '1688货源链接', '推荐1688链接'], true),
    offerId: readTextByCandidates(fields, record, ['offerId', 'Offer ID', '货源ID']),
    skuName: readTextByCandidates(fields, record, ['SKU名称', '匹配SKU', 'SKU']),
    skuImageUrl: readTextByCandidates(fields, record, ['SKU图片URL'], true),
    itemPrice,
    shippingFee,
    supplier: readTextByCandidates(fields, record, ['供应商', '1688供应商', '货源供应商']),
    similarity: readNumberByCandidates(fields, record, ['相似度', 'SKU图片相似度', 'SKU相似度', '列表图片相似度']),
    minimumOrderQuantity: readNumberByCandidates(fields, record, ['起批量', '最小起订量']),
    annualSalesVolume: readNumberByCandidates(fields, record, ['年销量']),
    monthlyDistributionVolume: readNumberByCandidates(fields, record, ['月代销']),
    salesVolume: readNumberByCandidates(fields, record, ['1688销量', '销量']),
    salesText: readTextByCandidates(fields, record, ['1688销量文本', '销量文本']),
    salesRiskNote: readTextByCandidates(fields, record, ['销量风险备注']),
    riskNote: readTextByCandidates(fields, record, ['风险备注', '风险标记', '备注']),
    failureReason: readTextByCandidates(fields, record, ['失败归因', '失败原因']),
    zhengheDataUrl: readTextByCandidates(fields, record, ['郑和数据链接', '郑和链接', '郑和商品链接'], true),
    sourceUrl: readTextByCandidates(fields, record, ['原商品链接', '商品链接', '商品URL', '原链接'], true),
    sourceImageUrl: readTextByCandidates(fields, record, ['原商品主图URL', '主图URL', '商品主图', '图片URL'], true),
  };
}

function groupPriceOutputRecords(fields: FeishuField[], records: FeishuRecord[]) {
  const groups = new Map<string, PriceOutputGroup>();
  for (const record of records) {
    const row = readPriceOutputRow(fields, record);
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

function getLatestBatchRows(rows: PriceOutputRow[]) {
  const latestBatchId = rows
    .map((row) => row.batchId)
    .filter(Boolean)
    .sort((left, right) => right.localeCompare(left))[0];
  return latestBatchId ? rows.filter((row) => row.batchId === latestBatchId) : rows;
}

function getLatestSuccessfulOutputBatchId(rows: PriceOutputRow[]) {
  return rows
    .filter((row) => row.batchId && row.candidateStatus !== '失败')
    .map((row) => row.batchId)
    .sort((left, right) => right.localeCompare(left))[0] ?? '';
}

function getLatestSuccessfulReviewBatchId(rows: PriceReviewRecord[]) {
  return rows
    .filter((row) => row.batchId && row.status !== '失败')
    .map((row) => row.batchId)
    .sort((left, right) => right.localeCompare(left))[0] ?? '';
}

function buildReviewRecommendation(rows: PriceOutputRow[], weightToleranceGram: number): ReviewRecommendation {
  const firstRow = rows[0];
  const baseValues = {
    商品ID: firstRow?.productId ?? '',
    '国家/站点': firstRow?.site ?? '',
    比价批次号: firstRow?.batchId ?? '',
    输入表记录ID: firstRow?.inputRecordId ?? '',
    候选数量: rows.length,
    有效候选数量: getValidReviewCandidates(rows).length,
    郑和数据链接: firstRow?.zhengheDataUrl ?? '',
    原商品链接: firstRow?.sourceUrl ?? '',
    原商品主图URL: firstRow?.sourceImageUrl ?? '',
  };

  if (rows.length === 0 || !firstRow) {
    return {
      success: false,
      values: {
        ...baseValues,
        失败归因: '无可用候选链接',
      },
    };
  }

  const selectedRows = rows.filter((row) => row.manuallySelected);
  if (selectedRows.length > 1) {
    return {
      success: false,
      values: {
        ...baseValues,
        失败归因: '人工指定多条候选',
      },
    };
  }

  const selectedRow = selectedRows[0] ?? selectByWeightMajority(rows, weightToleranceGram);
  if (!selectedRow) {
    return {
      success: false,
      values: {
        ...baseValues,
        失败归因: getSelectionFailureReason(rows),
      },
    };
  }

  const validationFailure = getReviewValidationFailure(selectedRow);
  const selectedValues = buildReviewValuesFromOutputRow(selectedRow, {
    candidateCount: rows.length,
    validCandidateCount: getValidReviewCandidates(rows).length,
    selectionReason: selectedRows[0]
      ? '人工指定候选'
      : buildWeightSelectionReason(rows, selectedRow, weightToleranceGram),
  });

  return {
    success: !validationFailure,
    values: {
      ...baseValues,
      ...selectedValues,
      失败归因: validationFailure,
    },
  };
}

function getValidReviewCandidates(rows: PriceOutputRow[]) {
  return rows.filter((row) => !getReviewValidationFailure(row));
}

function getSelectionFailureReason(rows: PriceOutputRow[]) {
  if (!rows.some((row) => row.offerUrl)) {
    return '无可用候选链接';
  }

  if (rows.every((row) => row.candidateStatus === '失败')) {
    return '候选均失败';
  }

  if (rows.every((row) => typeof row.weightGram !== 'number')) {
    return '候选均缺克重';
  }

  return '克重无法形成多数决策';
}

function selectByWeightMajority(rows: PriceOutputRow[], weightToleranceGram: number) {
  const candidates = rows.filter((row) => row.candidateStatus !== '失败' && typeof row.weightGram === 'number' && row.offerUrl);
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
  if (!row.productId) return '商品ID无法关联';
  if (!row.site) return '国家/站点无法关联';
  if (!row.offerUrl) return '无可用候选链接';
  if (!row.offerId && !extractOfferIdFromUrl(row.offerUrl)) return 'offerId解析失败';
  if (typeof row.purchaseCost !== 'number') return '采购总成本缺失';
  if (typeof row.weightGram !== 'number') return '克重缺失';
  return '';
}

function buildReviewValuesFromOutputRow(
  row: PriceOutputRow,
  options: { candidateCount: number; validCandidateCount: number; selectionReason: string },
) {
  return {
    商品ID: row.productId,
    '国家/站点': row.site,
    比价批次号: row.batchId,
    输入表记录ID: row.inputRecordId,
    输出货源表记录ID: row.recordId,
    推荐1688链接: row.offerUrl,
    offerId: row.offerId || extractOfferIdFromUrl(row.offerUrl),
    采购总成本: row.purchaseCost,
    '采购总成本（CNY）': row.purchaseCost,
    克重: row.weightGram,
    '克重（g）': row.weightGram,
    尺寸: row.dimensions,
    候选数量: options.candidateCount,
    有效候选数量: options.validCandidateCount,
    选择依据: options.selectionReason,
    风险备注: [row.riskNote, row.salesRiskNote].filter(Boolean).join('；'),
    郑和数据链接: row.zhengheDataUrl,
    原商品链接: row.sourceUrl,
    原商品主图URL: row.sourceImageUrl,
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
    return `克重无多数决策：${selectedWeight}g组命中${hitCount}/${rows.length}，按采购总成本最低链接进入表三，待人工核重`;
  }
  return hitCount > maxOtherHitCount
    ? `克重多数决策：${selectedWeight}g组命中${hitCount}/${rows.length}，组内最低采购总成本链接胜出`
    : `克重组并列：${selectedWeight}g组命中${hitCount}/${rows.length}，按组内最低采购总成本链接胜出`;
}

function buildProductSiteKey(productId: string, site: string) {
  return [productId.trim(), site.trim().toLowerCase()].filter(Boolean).join('__');
}

function readListingRecord(fields: FeishuField[], record: FeishuRecord, rank: number): ListingProductRecord {
  const output = readOutputRecord(fields, record, rank);
  const key = readTextByCandidates(fields, record, ['关联键']) || output.key;

  return {
    ...output,
    key,
    productId: readTextByCandidates(fields, record, ['商品ID', '原商品ID', '产品ID', 'Product ID']) || output.productId,
    reviewStatus: readTextByCandidates(fields, record, ['审核状态']) || '待审核',
    publicationStatus: readTextByCandidates(fields, record, ['刊登状态']) || '待生成妙手资料',
    purchaseBindingStatus: readTextByCandidates(fields, record, ['采购绑定状态']) || '未绑定订单',
  };
}

function readPriceReviewRecord(fields: FeishuField[], record: FeishuRecord): PriceReviewRecord {
  const itemPrice = readNumberByCandidates(fields, record, ['采购价', '商品价']);
  const shippingFee = readNumberByCandidates(fields, record, ['运费']);
  const purchaseCost =
    readNumberByCandidates(fields, record, ['采购总成本（CNY）', '采购总成本/CNY', '采购总成本', '采购总成本价', '采购成本价']) ||
    (typeof itemPrice === 'number' && typeof shippingFee === 'number' ? itemPrice + shippingFee : '');

  return {
    recordId: record.record_id,
    productId: readTextByCandidates(fields, record, ['商品ID']),
    site: normalizeSite(readTextByCandidates(fields, record, ['国家/站点', '国家', '站点', '市场'])),
    status: readTextByCandidates(fields, record, ['状态']),
    batchId: readTextByCandidates(fields, record, ['比价批次号', '当前比价批次号']),
    sourceUrl: readTextByCandidates(fields, record, ['原商品链接', '商品链接', 'TikTok前端链接'], true),
    offerUrl: readTextByCandidates(fields, record, ['推荐1688链接', '1688链接', '货源链接'], true),
    offerId: readTextByCandidates(fields, record, ['offerId', 'Offer ID', '货源ID']) ||
      extractOfferIdFromUrl(readTextByCandidates(fields, record, ['推荐1688链接', '1688链接', '货源链接'], true)),
    collectSourceItemId: resolveCollectSourceItemId({
      configuredSourceItemId: readTextByCandidates(fields, record, ['采集源货源ID']),
      offerId: readTextByCandidates(fields, record, ['offerId', 'Offer ID', '货源ID']),
      offerUrl: readTextByCandidates(fields, record, ['推荐1688链接', '1688链接', '货源链接'], true),
      sourceUrl: readTextByCandidates(fields, record, ['原商品链接', '商品链接', 'TikTok前端链接'], true),
      productId: readTextByCandidates(fields, record, ['原商品ID', '商品ID']),
    }),
    purchaseCost,
    displayPrice: readNumberByCandidates(fields, record, [
      '本地展示价(折后)(MYR)',
      '本地展示价/MYR',
      '本地展示价',
      '本地展示价格',
      '本地展示价(原价)(MYR)',
      '展示价',
      '展示价格',
      '最终成交价格/MYR',
    ]),
    weightGram: readNumberByCandidates(fields, record, ['克重（g）', '克重', '重量g', '包裹重量g']),
    dimensions: readTextByCandidates(fields, record, ['尺寸', '规格尺寸']),
  };
}

function readListingEditRecord(fields: FeishuField[], record: FeishuRecord): ListingEditRecord {
  return {
    recordId: record.record_id,
    key: readTextByCandidates(fields, record, ['关联键']),
    productId: readTextByCandidates(fields, record, ['商品ID']),
    reviewRecordId: readTextByCandidates(fields, record, ['表三记录ID']),
    batchId: readTextByCandidates(fields, record, ['比价批次号', '当前比价批次号']),
    offerId: readTextByCandidates(fields, record, ['offerId', '货源ID']) || extractOfferIdFromUrl(readTextByCandidates(fields, record, ['推荐1688链接', '1688链接'], true)),
    collectSourceItemId: resolveCollectSourceItemId({
      configuredSourceItemId: readTextByCandidates(fields, record, ['采集源货源ID']),
      offerId: readTextByCandidates(fields, record, ['offerId', '货源ID']),
      offerUrl: readTextByCandidates(fields, record, ['推荐1688链接', '1688链接'], true),
      sourceUrl: readTextByCandidates(fields, record, ['原商品链接'], true),
      productId: readTextByCandidates(fields, record, ['原商品ID', '商品ID']),
    }),
    site: normalizeSite(readTextByCandidates(fields, record, ['国家/站点', '国家', '站点'])),
    sourceUrl: readTextByCandidates(fields, record, ['原商品链接'], true),
    offerUrl: readTextByCandidates(fields, record, ['推荐1688链接', '1688链接'], true),
    purchaseCost: readNumberByCandidates(fields, record, ['采购总成本']),
    unifiedSourcePrice: readNumberByCandidates(fields, record, ['统一货源价格']),
    displayPrice: readPositiveNumberByCandidates(fields, record, ['本地展示价', '展示价格', '展示价']),
    editTitle: readTextByCandidates(fields, record, ['编辑标题']),
    weightGram: readNumberByCandidates(fields, record, ['包裹重量g', '克重']),
    lengthCm: readNumberByCandidates(fields, record, ['包裹长度cm']),
    widthCm: readNumberByCandidates(fields, record, ['包裹宽度cm']),
    heightCm: readNumberByCandidates(fields, record, ['包裹高度cm']),
    targetShopId: readTextByCandidates(fields, record, ['目标店铺ID']),
    targetShopName: readTextByCandidates(fields, record, ['目标店铺名称']),
    targetShopSite: normalizeSite(readTextByCandidates(fields, record, ['目标店铺站点', '店铺站点', '目标站点'])),
    targetCategoryId: readTextByCandidates(fields, record, ['目标类目ID', '目标类目id', '类目ID', 'cid']),
    editModel: readTextByCandidates(fields, record, ['编辑模式', 'editModel']),
    commonCollectBoxId: readTextByCandidates(fields, record, ['公共采集箱ID', '妙手公共采集箱ID']),
    tiktokCollectBoxId: readTextByCandidates(fields, record, ['TikTok采集箱ID', '妙手TikTok采集箱ID']),
    skuCount: readNumberByCandidates(fields, record, ['SKU数量']),
    collectStatus: readTextByCandidates(fields, record, ['采集状态']),
    claimStatus: readTextByCandidates(fields, record, ['认领状态']),
    shopClaimStatus: readTextByCandidates(fields, record, ['店铺认领状态']),
    editStatus: readTextByCandidates(fields, record, ['编辑状态']),
    publishReadyStatus: readTextByCandidates(fields, record, ['发布准备状态']),
    publishVerifyStatus: readTextByCandidates(fields, record, ['发布复核状态']),
    miaoshouPublishStatus: readTextByCandidates(fields, record, ['妙手发布状态']),
    miaoshouPublishTaskId: readTextByCandidates(fields, record, ['妙手发布任务ID']),
    tiktokProductId: readTextByCandidates(fields, record, ['TikTok商品ID', 'TikTok商品id']),
    publishedProductUrl: readTextByCandidates(fields, record, ['已发布商品链接', 'TikTok商品链接'], true),
    maintenanceStatus: readTextByCandidates(fields, record, ['维护状态']),
    maintenanceNote: readTextByCandidates(fields, record, ['维护备注']),
    failureReason: readTextByCandidates(fields, record, ['失败原因', '失败归因']),
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
    input.existingRow?.editStatus === '已提交发布' && typeof input.existingRow.displayPrice === 'number'
      ? input.existingRow.displayPrice
      : typeof row.displayPrice === 'number'
        ? row.displayPrice
        : input.existingRow?.displayPrice;
  const weightGram =
    typeof input.existingRow?.weightGram === 'number'
      ? input.existingRow.weightGram
      : row.weightGram;

  return {
    关联键: input.key,
    商品ID: row.productId,
    '国家/站点': normalizeSite(row.site),
    比价批次号: row.batchId,
    表三记录ID: row.recordId,
    原商品链接: row.sourceUrl,
    推荐1688链接: row.offerUrl,
    offerId: row.offerId || extractOfferIdFromUrl(row.offerUrl),
    采集源货源ID: row.collectSourceItemId || row.offerId || extractOfferIdFromUrl(row.offerUrl) || parseTikTokProductUrl(row.sourceUrl).productId || row.productId,
    采购总成本: row.purchaseCost,
    统一货源价格: unifiedSourcePrice,
    展示价格: displayPrice,
    本地展示价: displayPrice,
    包裹重量g: weightGram,
    包裹长度cm: size.length,
    包裹宽度cm: size.width,
    包裹高度cm: size.height,
    目标店铺ID: input.targetShopId,
    目标店铺名称: input.targetShopName,
    目标店铺站点: input.existingRow?.targetShopSite || normalizeSite(input.targetShopSite),
    目标类目ID: input.existingRow?.targetCategoryId || input.targetCategoryId || '',
    编辑模式: input.existingRow?.editModel || '',
    采集状态: input.existingRow?.collectStatus || '待采集',
    认领状态: input.existingRow?.claimStatus || '待采集',
    店铺认领状态: input.existingRow?.shopClaimStatus || '待采集',
    编辑状态: input.existingRow?.editStatus || '待采集',
    发布准备状态: input.existingRow?.publishReadyStatus || '',
    发布复核状态: input.existingRow?.publishVerifyStatus || '',
    妙手发布状态: input.existingRow?.miaoshouPublishStatus || '',
    妙手发布任务ID: input.existingRow?.miaoshouPublishTaskId || '',
    TikTok商品ID: input.existingRow?.tiktokProductId || '',
    已发布商品链接: input.existingRow?.publishedProductUrl || '',
    维护状态: input.existingRow?.maintenanceStatus || '',
    维护备注: input.existingRow?.maintenanceNote || '',
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
    if (!/未选择预发布店铺|已被删除|不存在|失效|site/i.test(message)) {
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
      throw new Error(`公共采集箱采集失败：${extractFailureReason(lastDetail) || '妙手返回失败状态'}`);
    }
    if (isCommonCollectBoxComplete(lastDetail)) {
      return lastDetail;
    }
  }

  throw new Error('公共采集箱采集超时');
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
  return ['fail', 'failed', 'error'].some((item) => status.includes(item)) || /失败|错误|异常/.test(reason);
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
    { status: 'published', verifyStatus: '已发布' },
    { status: 'timingPublish', verifyStatus: '发布中' },
    {
      status: 'notPublished',
      verifyStatus: rowWasSubmitted(input.row) ? '发布中待复核' : '未发布',
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
        failureReason: statusConfig.verifyStatus === '已发布' ? '' : `妙手采集箱状态仍为 ${statusConfig.status}`,
      };
    }
  }

  return {
    publishVerifyStatus: '未找到',
    miaoshouPublishStatus: `未在 ${[...new Set(searchedStatuses)].join('/')} 中找到`,
    miaoshouPublishTaskId: '',
    tiktokProductId: '',
    publishedProductUrl: '',
    failureReason: '妙手采集箱未返回该商品的发布结果；可能仍在发布队列、已被移动到其他列表，或当前开放接口不返回最终商品ID',
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
  return row.editStatus === '已提交发布' || row.publishReadyStatus.includes('已提交发布');
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
  return ['失败', '需人工处理', '发布失败'].includes(row.editStatus) &&
    /已被删除|不存在|失效|无效|未找到采集箱产品信息|采集箱产品信息|未搜索到货源ID|暂无数据|not\s*found/i.test(row.failureReason);
}

function isListingEditLockedStatus(status: string) {
  return ['保存中', '发布中', '已提交发布'].includes(status);
}

function isListingEditRetryCandidate(row: ListingEditRecord | null) {
  if (!row) {
    return false;
  }
  return (
    ['失败', '需人工处理', '发布失败', '需人工选择店铺'].includes(row.editStatus) ||
    ['失败', '发布失败', '类目未自动匹配'].some((status) => row.publishReadyStatus.includes(status)) ||
    row.collectStatus === '失败' ||
    row.claimStatus === '失败' ||
    row.shopClaimStatus === '需人工选择店铺'
  );
}

function getBrowserPublishPreflightFailure(row: ListingEditRecord, options: { hasPricingTemplate?: boolean } = {}) {
  if (row.editStatus === '已提交发布' || row.publishReadyStatus.includes('已提交发布')) {
    return '已提交发布，禁止重复发布';
  }
  if (row.publishReadyStatus.includes('类目未自动匹配') || row.failureReason.includes('类目')) {
    return '类目未自动匹配，需人工处理';
  }
  if (!['待人工编辑', '待保存草稿', '草稿已保存', '需人工处理', '发布中'].includes(row.editStatus)) {
    return `当前编辑状态不可发布：${row.editStatus || '空'}`;
  }
  if (row.collectStatus !== '已采集公共采集箱') {
    return `采集状态未完成：${row.collectStatus || '空'}`;
  }
  if (row.claimStatus !== '已认领TikTok采集箱') {
    return `认领状态未完成：${row.claimStatus || '空'}`;
  }
  if (row.shopClaimStatus !== '已认领目标店铺') {
    return `店铺认领状态未完成：${row.shopClaimStatus || '空'}`;
  }
  if (!row.tiktokCollectBoxId || !row.targetShopId) {
    return 'TikTok采集箱ID或目标店铺ID缺失';
  }
  if (!row.collectSourceItemId && !row.productId) {
    return '采集源货源ID缺失，无法在妙手采集箱搜索';
  }
  if (typeof row.unifiedSourcePrice !== 'number' || row.unifiedSourcePrice <= 0) {
    return '统一货源价格必须大于0';
  }
  if (!options.hasPricingTemplate) {
    return '未配置妙手定价模板';
  }
  if (typeof row.weightGram !== 'number' || row.weightGram <= 0) {
    return '包裹重量g必须大于0';
  }
  return '';
}

function isBrowserPublishPreflightReportable(row: ListingEditRecord) {
  return ['待人工编辑', '待保存草稿', '草稿已保存', '需人工处理', '发布失败', '失败', '发布中'].includes(row.editStatus);
}

function isBrowserPublishRetryCandidate(row: ListingEditRecord) {
  return (
    ['需人工处理', '发布失败', '失败', '发布中'].includes(row.editStatus) ||
    ['发布失败', '浏览器模拟发布中'].some((status) => row.publishReadyStatus.includes(status))
  );
}

function isStaleMiaoshouCollectBoxError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /已被删除|不存在|失效|无效|未找到采集箱产品信息|采集箱产品信息|找不到对应产品|未搜索到货源ID|暂无数据|not\s*found/i.test(message);
}

function getListingPublishReadyStatus(row: ListingEditRecord) {
  if (typeof row.displayPrice !== 'number' || row.displayPrice <= 0) {
    return '价格异常';
  }
  return '待人工发布';
}

function getListingPublishReadyFailureReason() {
  return '';
}

const alreadySubmittedPublishFailure = '已提交发布，禁止重复发布';

function getListingSiteMismatchReason(
  row: ListingEditRecord,
  input: {
    targetShopId: string;
    targetSite: string;
  },
) {
  const productSite = normalizeSite(row.site);
  const shopSite = normalizeSite(row.targetShopSite || input.targetSite);
  if (productSite && shopSite && productSite !== shopSite) {
    return `商品站点与目标店铺站点不一致：${productSite} -> ${shopSite}`;
  }

  const rowShopId = row.targetShopId || input.targetShopId;
  if (input.targetShopId && rowShopId && String(rowShopId) !== String(input.targetShopId)) {
    return '目标店铺ID与当前配置不一致';
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

  if (row.editStatus === '已提交发布' || row.publishReadyStatus.includes('已提交发布')) {
    failures.push(alreadySubmittedPublishFailure);
  }
  if (siteMismatch) {
    failures.push(siteMismatch);
  }
  if (input.requireDraftSaved && row.editStatus !== '草稿已保存') {
    failures.push('草稿未保存');
  }
  if (!row.tiktokCollectBoxId) {
    failures.push('TikTok采集箱ID为空');
  }
  if (!rowShopId) {
    failures.push('目标店铺ID为空');
  } else if (input.targetShopId && String(rowShopId) !== String(input.targetShopId)) {
    failures.push('目标店铺ID与当前配置不一致');
  }
  if (!rowSite) {
    failures.push('目标店铺站点为空');
  } else if (targetSite && rowSite !== targetSite) {
    failures.push('目标店铺站点与当前配置不一致');
  }
  if (row.shopClaimStatus !== '已认领目标店铺') {
    failures.push('未认领目标店铺');
  }
  if (typeof row.unifiedSourcePrice !== 'number' || row.unifiedSourcePrice <= 0) {
    failures.push('统一货源价格缺失');
  }
  if (typeof row.weightGram !== 'number' || row.weightGram <= 0) {
    failures.push('包裹重量g缺失');
  }
  if (safeDimension(row.lengthCm) <= 0 || safeDimension(row.widthCm) <= 0 || safeDimension(row.heightCm) <= 0) {
    failures.push('包裹尺寸缺失');
  }
  return failures;
}

function applyListingEditToShopInfo(shopInfo: Record<string, unknown>, row: ListingEditRecord) {
  const title = row.editTitle.trim() || extractShopTitle(shopInfo);
  if (!title) {
    throw new Error('编辑标题为空，且妙手采集标题为空');
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
  ensureMiaoshouDeliveryDefaults(shopInfo);
  normalizeMiaoshouSizeChart(shopInfo);

  const skuMap = asRecord(shopInfo.skuMap);
  if (!skuMap) {
    throw new Error('妙手详情SKU结构为空');
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
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : 10;
}

function extractOfferIdFromUrl(value: string) {
  return value.match(/offer\/(\d+)\.html/i)?.[1] ?? value.match(/[?&]offerId=(\d+)/i)?.[1] ?? '';
}

function verifySavedShopInfo(shopCollectItemInfo: unknown, row: ListingEditRecord) {
  const failures: string[] = [];
  const info = asRecord(shopCollectItemInfo);
  if (!info) {
    return ['店铺模式详情为空'];
  }
  const expectedTitle = row.editTitle.trim();
  if (expectedTitle && String(info.title ?? '').trim() !== expectedTitle) {
    failures.push('标题');
  }
  const expectedWeightKg = Math.round((Number(row.weightGram) / 1000) * 1000) / 1000;
  if (!numbersClose(Number(info.weight), expectedWeightKg)) {
    failures.push('商品重量');
  }
  if (!numbersClose(Number(info.packageLength), safeDimension(row.lengthCm))) {
    failures.push('包裹长度');
  }
  if (!numbersClose(Number(info.packageWidth), safeDimension(row.widthCm))) {
    failures.push('包裹宽度');
  }
  if (!numbersClose(Number(info.packageHeight), safeDimension(row.heightCm))) {
    failures.push('包裹高度');
  }
  const skuMap = asRecord(info.skuMap);
  if (!skuMap) {
    failures.push('SKU结构');
    return failures;
  }
  const activeSkus = Object.values(skuMap)
    .map(asRecord)
    .filter((sku): sku is Record<string, unknown> => Boolean(sku && String(sku.isDelete ?? '') !== '1'));
  if (activeSkus.length === 0) {
    failures.push('有效SKU');
    return failures;
  }
  if (activeSkus.some((sku) => !numbersClose(Number(sku.originPrice), Number(row.unifiedSourcePrice)))) {
    failures.push('SKU货源价格');
  }
  if (activeSkus.some((sku) => !numbersClose(Number(sku.weight), expectedWeightKg))) {
    failures.push('SKU重量');
  }
  if (
    typeof row.displayPrice === 'number' &&
    row.displayPrice > 0 &&
    activeSkus.some((sku) => !numbersClose(Number(sku.priceIncludeVat), Number(row.displayPrice)))
  ) {
    failures.push('展示价格');
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
