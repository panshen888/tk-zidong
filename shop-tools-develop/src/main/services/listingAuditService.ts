import fs from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import type { SourcingOutputRecord } from './feishuBitableService';
import { parseZhengheProductReference, type ZhengheDataClient, type ZhengheProductData, type ZhengheSku } from './zhengheDataService';

export type ListingAuditRow = {
  auditKey: string;
  productId: string;
  sourceUrl: string;
  zhengheDataUrl: string;
  zhengheProductId: string;
  zhengheRegion: string;
  zhengheProductUrl: string;
  zhengheCurrencySymbol: string;
  zhengheProductTitle: string;
  zhengheCategoryId: string;
  zhengheCategoryName: string;
  zhengheCreateTime: string;
  zhengheRating: string;
  zhengheReviewCount: number | '';
  zhengheCommissionRatio: number | '';
  zhengheTotalSales: number | '';
  zhengheThirtyDaySales: number | '';
  zhengheThirtyDayGmv: number | '';
  zhengheThirtyDayPrice: number | '';
  zhengheSkuId: string;
  zhengheSkuName: string;
  zhengheSkuPrice: number | '';
  zhengheSkuStock: number | '';
  zhengheSkuUpdateTime: string;
  exchangeRateToCny: number | '';
  frontendPriceCny: number | '';
  skuMatchStatus: string;
  skuMatchConfidence: number | '';
  selectedOfferUrl: string;
  selectedOfferId: string;
  selectedSkuName: string;
  selectedPurchasePrice: number | '';
  selectedShippingFee: number | '';
  selectedPurchaseCost: number | '';
  selectedWeightGram: number | '';
  selectedDimensions: string;
  selectedSupplier: string;
  selectedSimilarity: number | '';
  weightDecision: string;
  estimatedProfitCny: number | '';
  estimatedProfitRate: number | '';
  minPriceForTargetProfitCny: number | '';
  listingStatus: string;
  unavailableReason: string;
  riskNote: string;
};

type BuildListingAuditRowsInput = {
  sourcingRows: SourcingOutputRecord[];
  zhengheClient: ZhengheDataClient;
  exchangeRates: string;
  targetProfitRate: number;
};

const auditHeaders: Array<keyof ListingAuditRow> = [
  'auditKey',
  'productId',
  'sourceUrl',
  'zhengheDataUrl',
  'zhengheProductId',
  'zhengheRegion',
  'zhengheProductUrl',
  'zhengheCurrencySymbol',
  'zhengheProductTitle',
  'zhengheCategoryId',
  'zhengheCategoryName',
  'zhengheCreateTime',
  'zhengheRating',
  'zhengheReviewCount',
  'zhengheCommissionRatio',
  'zhengheTotalSales',
  'zhengheThirtyDaySales',
  'zhengheThirtyDayGmv',
  'zhengheThirtyDayPrice',
  'zhengheSkuId',
  'zhengheSkuName',
  'zhengheSkuPrice',
  'zhengheSkuStock',
  'zhengheSkuUpdateTime',
  'exchangeRateToCny',
  'frontendPriceCny',
  'skuMatchStatus',
  'skuMatchConfidence',
  'selectedOfferUrl',
  'selectedOfferId',
  'selectedSkuName',
  'selectedPurchasePrice',
  'selectedShippingFee',
  'selectedPurchaseCost',
  'selectedWeightGram',
  'selectedDimensions',
  'selectedSupplier',
  'selectedSimilarity',
  'weightDecision',
  'estimatedProfitCny',
  'estimatedProfitRate',
  'minPriceForTargetProfitCny',
  'listingStatus',
  'unavailableReason',
  'riskNote',
];

const auditHeaderLabels: Record<keyof ListingAuditRow, string> = {
  auditKey: '审核键',
  productId: '商品ID',
  sourceUrl: '原商品链接',
  zhengheDataUrl: '郑和数据链接',
  zhengheProductId: '郑和商品ID',
  zhengheRegion: '郑和站点',
  zhengheProductUrl: 'TikTok前端链接',
  zhengheCurrencySymbol: '前端币种',
  zhengheProductTitle: '郑和商品标题',
  zhengheCategoryId: '郑和类目ID',
  zhengheCategoryName: '郑和类目',
  zhengheCreateTime: '上架时间',
  zhengheRating: '商品评分',
  zhengheReviewCount: '评价数',
  zhengheCommissionRatio: '佣金比例',
  zhengheTotalSales: '总销量',
  zhengheThirtyDaySales: '近30天销量',
  zhengheThirtyDayGmv: '近30天GMV',
  zhengheThirtyDayPrice: '近30天均价',
  zhengheSkuId: '前端SKU ID',
  zhengheSkuName: '前端SKU名称',
  zhengheSkuPrice: '前端SKU价格',
  zhengheSkuStock: '前端SKU库存',
  zhengheSkuUpdateTime: '前端价格更新时间',
  exchangeRateToCny: '汇率到人民币',
  frontendPriceCny: '前端售价人民币',
  skuMatchStatus: 'SKU匹配状态',
  skuMatchConfidence: 'SKU匹配置信度',
  selectedOfferUrl: '推荐1688链接',
  selectedOfferId: '推荐offerId',
  selectedSkuName: '推荐1688 SKU',
  selectedPurchasePrice: '推荐采购价',
  selectedShippingFee: '推荐运费',
  selectedPurchaseCost: '采购成本人民币',
  selectedWeightGram: '推荐采购克重',
  selectedDimensions: '尺寸',
  selectedSupplier: '供应商',
  selectedSimilarity: '相似度',
  weightDecision: '克重决策',
  estimatedProfitCny: '预估利润人民币',
  estimatedProfitRate: '预估利润率',
  minPriceForTargetProfitCny: '5%利润最低售价人民币',
  listingStatus: '上架状态',
  unavailableReason: '不可上架原因',
  riskNote: '风险备注',
};

export async function buildListingAuditRows(input: BuildListingAuditRowsInput): Promise<ListingAuditRow[]> {
  const exchangeRateMap = parseExchangeRates(input.exchangeRates);
  const groups = groupSourcingRows(input.sourcingRows);
  const rows: ListingAuditRow[] = [];
  const zhengheCache = new Map<string, Promise<ZhengheProductData>>();

  for (const groupRows of groups.values()) {
    const firstRow = groupRows[0];
    const zhengheDataUrl = firstRow.zhengheDataUrl;
    const region = normalizeRegion(firstRow.country || parseZhengheProductReference(zhengheDataUrl).region);
    const selected = selectMajorityWeightRow(groupRows);
    const baseRisk = groupRows.map((row) => row.riskNote).filter(Boolean).join('；');
    let zhengheData: ZhengheProductData | null = null;
    let zhengheError = '';

    if (zhengheDataUrl) {
      const cacheKey = `${zhengheDataUrl}__${region}`;
      if (!zhengheCache.has(cacheKey)) {
        zhengheCache.set(cacheKey, input.zhengheClient.fetchProductData({ url: zhengheDataUrl, fallbackRegion: region }));
      }
      try {
        zhengheData = await zhengheCache.get(cacheKey) ?? null;
      } catch (error) {
        zhengheError = error instanceof Error ? error.message : String(error);
      }
    }

    const skuMatch = zhengheData && selected.row ? selectZhengheSku(zhengheData.skus, selected.row.skuName) : null;
    const finalRegion = normalizeRegion(zhengheData?.region || region);
    const zhengheBaseInfoTrusted = zhengheData?.metrics.baseInfoTrusted ?? false;
    const exchangeRate = exchangeRateMap.get(finalRegion) ?? '';
    const frontendPriceCny = skuMatch?.sku.price && exchangeRate ? roundMoney(Number(skuMatch.sku.price) * exchangeRate) : '';
    const purchaseCost = selected.row ? getPurchaseCost(selected.row) : '';
    const estimatedProfit = frontendPriceCny !== '' && purchaseCost !== '' ? roundMoney(frontendPriceCny - purchaseCost) : '';
    const estimatedProfitRate = estimatedProfit !== '' && frontendPriceCny ? roundRate(estimatedProfit / frontendPriceCny) : '';
    const minPriceForTargetProfit = purchaseCost !== ''
      ? roundMoney(purchaseCost / Math.max(0.01, 1 - input.targetProfitRate))
      : '';
    const decision = decideListingStatus({
      hasZhengheUrl: Boolean(zhengheDataUrl),
      zhengheError,
      selected,
      skuMatch,
      exchangeRate,
      frontendPriceCny,
      purchaseCost,
      estimatedProfit,
      estimatedProfitRate,
      targetProfitRate: input.targetProfitRate,
    });

    rows.push({
      auditKey: firstRow.productId,
      productId: firstRow.productId,
      sourceUrl: firstRow.sourceUrl,
      zhengheDataUrl,
      zhengheProductId: zhengheData?.sourceProductId ?? '',
      zhengheRegion: finalRegion,
      zhengheProductUrl: zhengheData?.productUrl ?? '',
      zhengheCurrencySymbol: zhengheData?.metrics.currencySymbol ?? '',
      zhengheProductTitle: zhengheBaseInfoTrusted ? zhengheData?.metrics.productName ?? '' : firstRow.title,
      zhengheCategoryId: zhengheBaseInfoTrusted ? zhengheData?.metrics.categoryId ?? '' : '',
      zhengheCategoryName: zhengheBaseInfoTrusted ? zhengheData?.metrics.categoryFullName ?? '' : firstRow.category,
      zhengheCreateTime: zhengheData?.metrics.createTime ?? '',
      zhengheRating: zhengheData?.metrics.productRating ?? '',
      zhengheReviewCount: zhengheData?.metrics.reviewCount ?? '',
      zhengheCommissionRatio: zhengheData?.metrics.commissionRatio ?? '',
      zhengheTotalSales: zhengheData?.metrics.soldCount ?? '',
      zhengheThirtyDaySales: zhengheData?.metrics.thirtyDaySales ?? '',
      zhengheThirtyDayGmv: zhengheData?.metrics.thirtyDayGmv ?? '',
      zhengheThirtyDayPrice: zhengheData?.metrics.thirtyDayPrice ?? '',
      zhengheSkuId: skuMatch?.sku.skuId ?? '',
      zhengheSkuName: skuMatch?.sku.skuName ?? '',
      zhengheSkuPrice: skuMatch?.sku.price ?? '',
      zhengheSkuStock: skuMatch?.sku.stock ?? '',
      zhengheSkuUpdateTime: skuMatch?.sku.detailUpdateTime ?? '',
      exchangeRateToCny: exchangeRate,
      frontendPriceCny,
      skuMatchStatus: skuMatch?.status ?? '未匹配',
      skuMatchConfidence: skuMatch?.confidence ?? '',
      selectedOfferUrl: selected.row?.offerUrl ?? '',
      selectedOfferId: selected.row?.offerId ?? '',
      selectedSkuName: selected.row?.skuName ?? '',
      selectedPurchasePrice: selected.row?.itemPrice ?? '',
      selectedShippingFee: selected.row?.shippingFee ?? '',
      selectedPurchaseCost: purchaseCost,
      selectedWeightGram: selected.row?.weightGram ?? '',
      selectedDimensions: selected.row?.dimensions ?? '',
      selectedSupplier: selected.row?.supplier ?? '',
      selectedSimilarity: selected.row?.similarity ?? '',
      weightDecision: selected.reason,
      estimatedProfitCny: estimatedProfit,
      estimatedProfitRate,
      minPriceForTargetProfitCny: minPriceForTargetProfit,
      listingStatus: decision.status,
      unavailableReason: decision.reason,
      riskNote: [baseRisk, zhengheError, zhengheData?.metrics.infoWarning].filter(Boolean).join('；'),
    });
  }

  return rows;
}

export async function writeListingAuditExcel(outputExcelPath: string, rows: ListingAuditRow[]) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('AI上架审核表');
  worksheet.columns = auditHeaders.map((key) => ({
    header: auditHeaderLabels[key],
    key,
    width: Math.max(12, Math.min(34, auditHeaderLabels[key].length * 2 + 8)),
  }));
  for (const row of rows) {
    worksheet.addRow(row);
  }
  await fs.mkdir(path.dirname(outputExcelPath), { recursive: true });
  await workbook.xlsx.writeFile(outputExcelPath);
}

export async function readSourcingRowsFromExcel(inputExcelPath: string): Promise<SourcingOutputRecord[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(inputExcelPath);
  const selectionSheet = workbook.getWorksheet('选品表');
  const candidateSheet = workbook.getWorksheet('1688候选供应商') ?? workbook.getWorksheet('SKU匹配结果');
  if (!candidateSheet) {
    throw new Error('本地结果 Excel 缺少「1688候选供应商」或「SKU匹配结果」Sheet');
  }
  const selectionByProductId = selectionSheet ? readSelectionContext(selectionSheet) : new Map<string, Partial<SourcingOutputRecord>>();
  const headerMap = buildHeaderMap(candidateSheet);
  const rows: SourcingOutputRecord[] = [];
  for (let rowNumber = 2; rowNumber <= candidateSheet.rowCount; rowNumber += 1) {
    const row = candidateSheet.getRow(rowNumber);
    const productId = getCell(row, headerMap, ['原商品ID', '商品ID']);
    if (!productId) {
      continue;
    }
    const context = selectionByProductId.get(productId) ?? {};
    const offerId = getCell(row, headerMap, ['offerId', 'Offer ID', '货源ID']);
    const skuName = getCell(row, headerMap, ['SKU名称', '匹配SKU', 'SKU']);
    rows.push({
      key: [productId, offerId, skuName].filter(Boolean).join('__'),
      productId,
      sourceUrl: context.sourceUrl ?? '',
      zhengheDataUrl: context.zhengheDataUrl ?? '',
      sourceImageUrl: context.sourceImageUrl ?? '',
      offerUrl: getCell(row, headerMap, ['1688链接', '货源链接', '推荐1688链接'], true),
      offerId,
      skuName,
      skuImageUrl: getCell(row, headerMap, ['SKU图片URL'], true),
      purchaseCost: numberOrBlank(getCell(row, headerMap, ['采购成本价', '采购成本'])),
      itemPrice: numberOrBlank(getCell(row, headerMap, ['商品价', '商品价格'])),
      shippingFee: numberOrBlank(getCell(row, headerMap, ['运费', '预估运费'])),
      dimensions: getCell(row, headerMap, ['尺寸', '规格尺寸']),
      weightGram: numberOrBlank(getCell(row, headerMap, ['克重g', '克重', '重量g', '重量'])),
      supplier: getCell(row, headerMap, ['供应商', '1688供应商']),
      similarity: numberOrBlank(getCell(row, headerMap, ['SKU图片相似度', '相似度', '列表图片相似度'])),
      riskNote: getCell(row, headerMap, ['风险标记', '风险备注', '备注']),
      title: context.title ?? getCell(row, headerMap, ['商品标题', '1688商品标题']),
      country: context.country ?? '',
      targetSiteCategory: context.targetSiteCategory ?? context.category ?? '',
      category: context.category ?? '',
      status: '成功',
      rank: numberOrBlank(getCell(row, headerMap, ['推荐排名', '排名'])) || rowNumber - 1,
    });
  }
  return rows;
}

export function getListingAuditHeaders() {
  return auditHeaders.map((key) => auditHeaderLabels[key]);
}

export function listingAuditRowToChineseFields(row: ListingAuditRow): Record<string, string | number> {
  const output: Record<string, string | number> = {};
  for (const key of auditHeaders) {
    const value = row[key];
    output[auditHeaderLabels[key]] = value;
  }
  return output;
}

function groupSourcingRows(rows: SourcingOutputRecord[]) {
  const groups = new Map<string, SourcingOutputRecord[]>();
  for (const row of rows.filter((item) => item.productId)) {
    const current = groups.get(row.productId) ?? [];
    current.push(row);
    groups.set(row.productId, current);
  }
  for (const groupRows of groups.values()) {
    groupRows.sort((left, right) => {
      const leftRank = Number(left.rank || 999);
      const rightRank = Number(right.rank || 999);
      return leftRank - rightRank;
    });
  }
  return groups;
}

function selectMajorityWeightRow(rows: SourcingOutputRecord[]) {
  const candidates = rows
    .filter((row) => row.offerUrl && row.skuName)
    .slice(0, 3);
  const weightedRows = candidates.filter((row) => typeof row.weightGram === 'number' && Number.isFinite(row.weightGram));
  if (weightedRows.length === 0) {
    return { row: candidates[0], reason: 'Top3缺少克重，按第一条候选待人工核重' };
  }

  const groups: SourcingOutputRecord[][] = [];
  for (const row of weightedRows) {
    const group = groups.find((items) => isSimilarWeight(Number(items[0].weightGram), Number(row.weightGram)));
    if (group) {
      group.push(row);
    } else {
      groups.push([row]);
    }
  }
  groups.sort((left, right) => right.length - left.length || minCost(left) - minCost(right));
  const bestGroup = groups[0] ?? [];
  const selectedRow = bestGroup.slice().sort((left, right) => Number(getPurchaseCost(left, Infinity)) - Number(getPurchaseCost(right, Infinity)))[0] ?? candidates[0];
  const reason = bestGroup.length >= 2
    ? `Top3克重多数决：${bestGroup.length}条约${selectedRow.weightGram}g，选该组最低采购成本`
    : 'Top3克重无多数一致，暂选最低可用候选并待人工核重';
  return { row: selectedRow, reason };
}

function selectZhengheSku(skus: ZhengheSku[], targetSkuName: string) {
  const pricedSkus = skus.filter((sku) => typeof sku.price === 'number');
  if (pricedSkus.length === 0) {
    return null;
  }
  const targetTokens = tokenizeSku(targetSkuName);
  const scored = pricedSkus
    .map((sku) => {
      const skuTokens = tokenizeSku(sku.skuName);
      const overlap = skuTokens.filter((token) => targetTokens.includes(token)).length;
      const confidence = targetTokens.length > 0 ? overlap / targetTokens.length : 0;
      return { sku, confidence };
    })
    .sort((left, right) => right.confidence - left.confidence || Number(left.sku.price) - Number(right.sku.price));
  const best = scored[0];
  if (!best || best.confidence < 0.35) {
    const fallback = pricedSkus.slice().sort((left, right) => Number(left.price) - Number(right.price))[0];
    return {
      sku: fallback,
      confidence: best?.confidence ?? 0,
      status: pricedSkus.length === 1 ? '单SKU自动采用' : '待人工确认SKU',
    };
  }
  return {
    sku: best.sku,
    confidence: roundRate(best.confidence),
    status: best.confidence >= 0.75 ? '自动匹配' : '疑似匹配',
  };
}

function decideListingStatus(input: {
  hasZhengheUrl: boolean;
  zhengheError: string;
  selected: ReturnType<typeof selectMajorityWeightRow>;
  skuMatch: ReturnType<typeof selectZhengheSku> | null;
  exchangeRate: number | '';
  frontendPriceCny: number | '';
  purchaseCost: number | '';
  estimatedProfit: number | '';
  estimatedProfitRate: number | '';
  targetProfitRate: number;
}) {
  const reasons: string[] = [];
  if (!input.hasZhengheUrl) reasons.push('缺少郑和数据链接');
  if (input.zhengheError) reasons.push(`郑和数据读取失败：${input.zhengheError}`);
  if (!input.selected.row) reasons.push('缺少可用1688候选');
  if (!input.selected.reason.includes('多数决')) reasons.push('Top3克重无多数一致');
  if (!input.skuMatch) reasons.push('缺少前端SKU价格');
  if (input.skuMatch?.status === '待人工确认SKU') reasons.push('前端SKU需人工确认');
  if (input.exchangeRate === '') reasons.push('缺少站点汇率');
  if (input.purchaseCost === '') reasons.push('缺少采购成本');
  if (input.frontendPriceCny === '') reasons.push('缺少前端人民币售价');

  if (input.estimatedProfit !== '' && input.estimatedProfit < 0) {
    return { status: '不可上架', reason: ['预估利润为负', ...reasons].join('；') };
  }
  if (reasons.some((reason) => reason.includes('缺少'))) {
    return { status: '资料缺失', reason: reasons.join('；') };
  }
  if (reasons.length > 0) {
    return { status: '待人工确认', reason: reasons.join('；') };
  }
  if (input.estimatedProfitRate !== '' && input.estimatedProfitRate < input.targetProfitRate) {
    return { status: '低利润待确认', reason: `预估利润率低于${Math.round(input.targetProfitRate * 100)}%` };
  }
  return { status: '可上架', reason: '' };
}

function readSelectionContext(sheet: ExcelJS.Worksheet) {
  const headerMap = buildHeaderMap(sheet);
  const map = new Map<string, Partial<SourcingOutputRecord>>();
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const productId = getCell(row, headerMap, ['原商品ID', '商品ID']);
    if (!productId) {
      continue;
    }
    map.set(productId, {
      sourceUrl: getCell(row, headerMap, ['原商品链接', '商品链接'], true),
      zhengheDataUrl: getCell(row, headerMap, ['郑和数据链接', '郑和链接', '郑和商品链接'], true),
      sourceImageUrl: getCell(row, headerMap, ['原商品主图URL', '主图URL'], true),
      title: getCell(row, headerMap, ['商品标题', '标题']),
      country: getCell(row, headerMap, ['国家', '站点']),
      category: getCell(row, headerMap, ['类目', '分类']),
    });
  }
  return map;
}

function buildHeaderMap(sheet: ExcelJS.Worksheet) {
  const map = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, columnNumber) => {
    const text = getValueText(cell.value);
    if (text) {
      map.set(normalizeHeader(text), columnNumber);
    }
  });
  return map;
}

function getCell(row: ExcelJS.Row, headerMap: Map<string, number>, names: string[], preferUrl = false) {
  const column = names.map((name) => headerMap.get(normalizeHeader(name))).find(Boolean);
  return column ? getValueText(row.getCell(column).value, preferUrl) : '';
}

function getValueText(value: ExcelJS.CellValue | undefined, preferUrl = false) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const record = value as unknown as Record<string, unknown>;
    if (preferUrl && typeof record.hyperlink === 'string') return record.hyperlink.trim();
    if (typeof record.text === 'string') return record.text.trim();
    if (typeof record.hyperlink === 'string') return record.hyperlink.trim();
    if (Array.isArray(record.richText)) {
      return record.richText.map((part) => typeof part === 'object' && part && 'text' in part ? String((part as Record<string, unknown>).text ?? '') : '').join('').trim();
    }
  }
  return String(value).trim();
}

function parseExchangeRates(value: string) {
  const map = new Map<string, number>();
  for (const part of value.split(/[,，;\n]/)) {
    const [key, rawValue] = part.split(/[=:：]/).map((item) => item.trim());
    const rate = Number(rawValue);
    if (key && Number.isFinite(rate) && rate > 0) {
      map.set(key.toLowerCase(), rate);
    }
  }
  return map;
}

function getPurchaseCost(row: SourcingOutputRecord, fallback = 0): number | '' {
  if (typeof row.purchaseCost === 'number' && Number.isFinite(row.purchaseCost)) return roundMoney(row.purchaseCost);
  const itemPrice = typeof row.itemPrice === 'number' ? row.itemPrice : 0;
  const shippingFee = typeof row.shippingFee === 'number' ? row.shippingFee : 0;
  const total = itemPrice + shippingFee;
  return total > 0 ? roundMoney(total) : fallback === Infinity ? Infinity : '';
}

function minCost(rows: SourcingOutputRecord[]) {
  return Math.min(...rows.map((row) => getPurchaseCost(row, Infinity) || Infinity));
}

function isSimilarWeight(left: number, right: number) {
  const diff = Math.abs(left - right);
  return diff <= 10 || diff / Math.max(left, right, 1) <= 0.05;
}

function tokenizeSku(value: string) {
  return normalizeHeader(value)
    .replace(/warna|color|colour|颜色|尺码|size/g, '')
    .split(/[^a-z0-9\u4e00-\u9fa5]+/)
    .filter((token) => token.length >= 2);
}

function normalizeHeader(value: string) {
  return value.replace(/\s+/g, '').toLowerCase();
}

function normalizeRegion(value: string) {
  return value.trim().toLowerCase();
}

function numberOrBlank(value: string): number | '' {
  const number = Number(value.replace(/,/g, '').trim());
  return Number.isFinite(number) ? number : '';
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function roundRate(value: number) {
  return Math.round(value * 10000) / 10000;
}
