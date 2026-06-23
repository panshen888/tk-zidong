import fs from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import type { ProductItem, RowStatusFilter, SkuMatchResult, SupplierCandidate } from '../../shared/types';
import type { DetailPageAdapter } from './detailAdapter';
import type { ImageSimilarityService } from './imageSimilarityService';
import type { ImageSearchAdapter } from './searchAdapter';
import { delay, mapWithConcurrency, stagger } from './concurrency';
import { parseTikTokProductUrl } from './tiktokProductUrl';
import { buildTikTokProductUrl, parseZhengheProductReference, ZhengheDataClient } from './zhengheDataService';
import {
  priceInputHeaders,
  priceInputTableName,
  priceOutputHeaders,
  priceOutputTableName,
  priceReviewHeaders,
  priceReviewTableName,
} from '../../shared/priceComparisonSchema';

export { createMockImageSearchAdapter, createReal1688ImageSearchAdapter } from './searchAdapter';
export { createMockDetailPageAdapter } from './detailAdapter';
export { createImageSimilarityService } from './imageSimilarityService';

const selectionSheetName = '选品表';
const requiredHeaders: string[] = [];
const statusHeader = '状态';
const completedStatusText = '已完成';
const runningStatusText = '核实中';
const pendingStatusText = '待核实';
const failedStatusText = '失败';

type ParsedWorkbook = {
  workbook: ExcelJS.Workbook;
  worksheet: ExcelJS.Worksheet;
  headerMap: Map<string, number>;
};

type ProductProcessingInput = {
  taskId: string;
  assetDir: string;
  candidateLimit: number;
  acceptedCandidateLimit: number;
  sourcingMode: 'fast' | 'accurate';
  detailPageConcurrency: number;
  aiListBatchSize: number;
  retryCount: number;
  enable1688RealFactoryFilter: boolean;
  enable1688StrengthFactoryFilter: boolean;
  enable1688AnnualSalesFilter: boolean;
  min1688AnnualSales: number;
  enable1688MonthlySalesFilter: boolean;
  min1688MonthlySales: number;
  enable1688SalesReference: boolean;
  min1688SalesVolume: number;
  missing1688SalesAction: 'ignore' | 'markRisk' | 'filter';
  searchAdapter?: ImageSearchAdapter;
  detailAdapter?: DetailPageAdapter;
  imageSimilarityService?: ImageSimilarityService;
  signal?: AbortSignal;
  appendLog: (level: 'info' | 'warn' | 'error', message: string) => void;
};

type ProcessExcelInput = ProductProcessingInput & {
  inputExcelPath: string;
  outputExcelPath: string;
  excelRowConcurrency: number;
  rowLimit?: number;
  statusFilter?: RowStatusFilter;
  syncResultToInputExcel?: boolean;
  settingsRows?: Array<{ name: string; value: string | number }>;
};

export type ProcessProductItemsInput = ProductProcessingInput & {
  items: ProductItem[];
};

type RankedSkuMatch = SkuMatchResult & {
  rank: number;
};

type SalesReferenceConfig = Pick<
  ProductProcessingInput,
  'enable1688SalesReference' | 'min1688SalesVolume' | 'missing1688SalesAction'
  | 'enable1688AnnualSalesFilter' | 'min1688AnnualSales'
  | 'enable1688MonthlySalesFilter' | 'min1688MonthlySales'
>;

type ProcessExcelResult = {
  totalCount: number;
  successCount: number;
  failedCount: number;
  items: ProductItem[];
};

type LocalPriceOutputRow = {
  rowNumber: number;
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
  zhengheDataUrl: string;
  sourceUrl: string;
  sourceImageUrl: string;
};

type LocalReviewRow = {
  rowNumber: number;
  productId: string;
  site: string;
};

type LocalPriceOutputGroup = {
  key: string;
  productId: string;
  site: string;
  rows: LocalPriceOutputRow[];
};

type LocalReviewRecommendation = {
  success: boolean;
  values: Record<string, string | number | Date>;
};

export async function writeLocalThreeTableTemplate(outputExcelPath: string) {
  const workbook = new ExcelJS.Workbook();
  addHeaderOnlySheet(workbook, priceInputTableName, [...priceInputHeaders]);
  addHeaderOnlySheet(workbook, priceOutputTableName, [...priceOutputHeaders]);
  addHeaderOnlySheet(workbook, priceReviewTableName, [...priceReviewHeaders]);
  await fs.mkdir(path.dirname(outputExcelPath), { recursive: true });
  await workbook.xlsx.writeFile(outputExcelPath);
}

export async function generateLocalPriceComparisonReviewTable(input: {
  workbookPath: string;
  weightToleranceGram?: number;
}) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(input.workbookPath);
  const outputWorksheet = workbook.getWorksheet(priceOutputTableName);
  if (!outputWorksheet) {
    throw new Error(`Excel 缺少 Sheet：${priceOutputTableName}`);
  }

  const reviewWorksheet = workbook.getWorksheet(priceReviewTableName) ?? addHeaderOnlySheet(workbook, priceReviewTableName, [...priceReviewHeaders]);
  ensureSheetHeaders(outputWorksheet, [...priceOutputHeaders]);
  ensureSheetHeaders(reviewWorksheet, [...priceReviewHeaders]);

  const outputHeaderMap = buildHeaderMap(outputWorksheet);
  const reviewHeaderMap = buildHeaderMap(reviewWorksheet);
  const outputRows = readLocalPriceOutputRows(outputWorksheet, outputHeaderMap);
  const reviewRows = readLocalReviewRows(reviewWorksheet, reviewHeaderMap);
  const reviewRowByKey = new Map(
    reviewRows
      .map((row) => [buildLocalProductSiteKey(row.productId, row.site), row] as const)
      .filter(([key]) => Boolean(key)),
  );
  const groups = groupLocalPriceOutputRows(outputRows);
  const targetGroups = [...groups.values()]
    .map((group) => ({ ...group, rows: getLatestLocalBatchRows(group.rows) }))
    .filter((group) => group.rows.some((row) => row.groupStatus === '已核实' || row.groupStatus === '待更新表三'));

  let generatedCount = 0;
  let failedCount = 0;
  for (const group of targetGroups) {
    syncLocalOutputGroupStatus(outputWorksheet, outputHeaderMap, group.rows);
    const reviewResult = buildLocalReviewRecommendation(group.rows, input.weightToleranceGram ?? 5);
    const key = buildLocalProductSiteKey(group.productId, group.site);
    const existingReviewRow = reviewRowByKey.get(key);
    const rowNumber = existingReviewRow?.rowNumber ?? getNextWorksheetRowNumber(reviewWorksheet);
    const values = {
      ...reviewResult.values,
      状态: reviewResult.success ? '待核实' : '失败',
      最后更新时间: new Date(),
    };
    writeLocalFieldsToRow(reviewWorksheet, reviewHeaderMap, rowNumber, values);

    if (reviewResult.success) {
      generatedCount += 1;
    } else {
      failedCount += 1;
    }
  }

  await workbook.xlsx.writeFile(input.workbookPath);
  return {
    outputExcelPath: input.workbookPath,
    scannedGroupCount: targetGroups.length,
    generatedCount,
    failedCount,
  };
}

type RowProcessContext = {
  workbook: ExcelJS.Workbook;
  worksheet: ExcelJS.Worksheet;
  headerMap: Map<string, number>;
  cellImageStore: CellImageStore;
  originalImageCells: Map<number, OriginalImageCell>;
  imageDir: string;
  imageColumn?: number;
};

type RowProcessResult = {
  item: ProductItem;
  rowNumber: number;
};

type CachedImage = {
  buffer: Buffer;
  extension: string;
};

type CellImageStore = {
  byId: Map<string, CachedImage>;
};

type OriginalImageCell =
  | {
      kind: 'cell-image';
      image: CachedImage;
      value: ExcelJS.CellValue | undefined;
    }
  | {
      kind: 'floating-image';
      imageId: number;
      extension: string;
      range: ExcelJS.ImageRange;
      value: ExcelJS.CellValue | undefined;
    }
  | {
      kind: 'value';
      value: ExcelJS.CellValue | undefined;
    };

type FloatingImageReference = Omit<Extract<OriginalImageCell, { kind: 'floating-image' }>, 'value'>;

function getValueText(value: ExcelJS.CellValue | undefined, options: { preferHyperlink?: boolean } = {}) {
  if (value == null) {
    return '';
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'object') {
    const record = value as unknown as Record<string, unknown>;
    const text = typeof record.text === 'string' ? record.text : '';
    const hyperlink = typeof record.hyperlink === 'string' ? record.hyperlink : '';

    if (options.preferHyperlink && hyperlink) {
      return hyperlink.trim();
    }

    if (text || hyperlink) {
      return (text || hyperlink).trim();
    }

    if (Array.isArray(record.richText)) {
      return record.richText
        .map((part) => {
          if (typeof part === 'object' && part !== null && 'text' in part) {
            return String((part as Record<string, unknown>).text ?? '');
          }

          return '';
        })
        .join('')
        .trim();
    }

    if ('result' in record) {
      return getValueText(record.result as ExcelJS.CellValue | undefined, options);
    }
  }

  return String(value).trim();
}

function extractDispImageId(value: ExcelJS.CellValue | undefined) {
  const text = getValueText(value);
  return text.match(/DISPIMG\("([^"]+)"/i)?.[1] ?? text.match(/DISPIMG\('([^']+)'/i)?.[1] ?? '';
}

function getCellText(cell: ExcelJS.Cell) {
  const value = cell.value;
  if (extractDispImageId(value)) {
    return '';
  }

  return getValueText(value);
}

function getCellUrlText(cell: ExcelJS.Cell) {
  if (extractDispImageId(cell.value)) {
    return '';
  }

  return getValueText(cell.value, { preferHyperlink: true });
}

function buildHeaderMap(worksheet: ExcelJS.Worksheet) {
  const headerMap = new Map<string, number>();
  const headerRow = worksheet.getRow(1);
  headerRow.eachCell((cell, columnNumber) => {
    const text = getCellText(cell);
    if (text) {
      headerMap.set(text, columnNumber);
      headerMap.set(normalizeHeaderName(text), columnNumber);
    }
  });
  return headerMap;
}

function assertInputShape(headerMap: Map<string, number>) {
  const missingHeaders = requiredHeaders.filter((header) => !hasHeader(headerMap, header));
  if (missingHeaders.length > 0) {
    throw new Error(`Excel 缺少必填字段：${missingHeaders.join('、')}`);
  }

  if (!hasHeader(headerMap, '原商品ID') && !hasHeader(headerMap, '郑和数据链接')) {
    throw new Error('Excel 至少需要「原商品ID」或「郑和数据链接」字段');
  }
}

function addHeaderOnlySheet(workbook: ExcelJS.Workbook, sheetName: string, headers: string[]) {
  const worksheet = workbook.addWorksheet(sheetName);
  worksheet.columns = headers.map((header) => ({
    header,
    key: header,
    width: Math.max(12, Math.min(32, header.length * 2 + 6)),
  }));
  return worksheet;
}

function ensureSheetHeaders(worksheet: ExcelJS.Worksheet, headers: string[]) {
  const headerMap = buildHeaderMap(worksheet);
  let nextColumn = worksheet.getRow(1).cellCount + 1;
  for (const header of headers) {
    if (hasHeader(headerMap, header)) {
      continue;
    }

    worksheet.getRow(1).getCell(nextColumn).value = header;
    headerMap.set(header, nextColumn);
    headerMap.set(normalizeHeaderName(header), nextColumn);
    nextColumn += 1;
  }
}

async function readWorkbook(inputExcelPath: string): Promise<ParsedWorkbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(inputExcelPath);

  const worksheet = workbook.getWorksheet(selectionSheetName);
  if (!worksheet) {
    throw new Error(`Excel 缺少 Sheet：${selectionSheetName}`);
  }

  const headerMap = ensureLocalStatusHeader(worksheet);
  assertInputShape(headerMap);

  return { workbook, worksheet, headerMap };
}

async function readCellImageStore(inputExcelPath: string): Promise<CellImageStore> {
  const bytes = await fs.readFile(inputExcelPath);
  const zip = await JSZip.loadAsync(bytes);
  const cellImagesXml = await zip.file('xl/cellimages.xml')?.async('string');
  const cellImagesRelsXml = await zip.file('xl/_rels/cellimages.xml.rels')?.async('string');

  if (!cellImagesXml || !cellImagesRelsXml) {
    return { byId: new Map() };
  }

  const relationshipTargets = parseRelationshipTargets(cellImagesRelsXml);
  const cellImageRelationships = parseCellImageRelationships(cellImagesXml);
  const byId = new Map<string, CachedImage>();

  for (const [cellImageId, relationshipId] of cellImageRelationships) {
    const target = relationshipTargets.get(relationshipId);
    if (!target) {
      continue;
    }

    const imagePath = normalizeZipPath('xl', target);
    const imageFile = zip.file(imagePath);
    if (!imageFile) {
      continue;
    }

    const buffer = Buffer.from(await imageFile.async('nodebuffer'));
    byId.set(cellImageId, {
      buffer,
      extension: path.posix.extname(imagePath).slice(1).toLowerCase() || 'png',
    });
  }

  return { byId };
}

function parseRelationshipTargets(xml: string) {
  const relationships = new Map<string, string>();
  for (const tag of xml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = getXmlAttribute(tag[0], 'Id');
    const target = getXmlAttribute(tag[0], 'Target');
    if (id && target) {
      relationships.set(id, target);
    }
  }

  return relationships;
}

function parseCellImageRelationships(xml: string) {
  const relationships = new Map<string, string>();
  for (const block of xml.matchAll(/<[^:>]*:?cellImage\b[\s\S]*?<\/[^:>]*:?cellImage>/g)) {
    const content = block[0];
    const imageId = content.match(/<[^:>]*:?cNvPr\b[^>]*\bname=(["'])(.*?)\1/)?.[2] ?? '';
    const relationshipId = content.match(/<[^:>]*:?blip\b[^>]*\br:embed=(["'])(.*?)\1/)?.[2] ?? '';
    if (imageId && relationshipId) {
      relationships.set(decodeXmlAttribute(imageId), decodeXmlAttribute(relationshipId));
    }
  }

  return relationships;
}

function getXmlAttribute(tag: string, attributeName: string) {
  const escapedAttributeName = attributeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = tag.match(new RegExp(`\\b${escapedAttributeName}=(["'])(.*?)\\1`));
  return match ? decodeXmlAttribute(match[2]) : '';
}

function decodeXmlAttribute(value: string) {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

function normalizeZipPath(baseDir: string, target: string) {
  if (target.startsWith('/')) {
    return target.slice(1);
  }

  return path.posix.normalize(path.posix.join(baseDir, target));
}

function getCellByHeader(row: ExcelJS.Row, headerMap: Map<string, number>, header: string) {
  const column = getHeaderColumn(headerMap, header);
  if (!column) {
    return '';
  }

  return getCellText(row.getCell(column));
}

function getCellUrlByHeader(row: ExcelJS.Row, headerMap: Map<string, number>, header: string) {
  const column = getHeaderColumn(headerMap, header);
  if (!column) {
    return '';
  }

  return getCellUrlText(row.getCell(column));
}

function getCellByHeaders(row: ExcelJS.Row, headerMap: Map<string, number>, headers: string[], preferUrl = false) {
  for (const header of headers) {
    const column = getHeaderColumn(headerMap, header);
    if (!column) {
      continue;
    }

    const value = preferUrl ? getCellUrlText(row.getCell(column)) : getCellText(row.getCell(column));
    if (value) {
      return value;
    }
  }

  return '';
}

function getNumberByHeaders(row: ExcelJS.Row, headerMap: Map<string, number>, headers: string[]): number | '' {
  const text = getCellByHeaders(row, headerMap, headers).replace(/,/g, '');
  if (!text.trim()) {
    return '';
  }

  const value = Number(text);
  return Number.isFinite(value) ? value : '';
}

function getBooleanByHeaders(row: ExcelJS.Row, headerMap: Map<string, number>, headers: string[]) {
  const value = getCellByHeaders(row, headerMap, headers).toLowerCase();
  return ['true', '1', '是', '已选', '选中', 'yes'].includes(value);
}

function writeLocalFieldsToRow(
  worksheet: ExcelJS.Worksheet,
  headerMap: Map<string, number>,
  rowNumber: number,
  values: Record<string, string | number | Date>,
) {
  for (const [header, value] of Object.entries(values)) {
    if (value === '' || value == null) {
      continue;
    }

    const column = getHeaderColumn(headerMap, header);
    if (!column) {
      continue;
    }

    worksheet.getRow(rowNumber).getCell(column).value = value;
  }
}

function hasHeader(headerMap: Map<string, number>, header: string) {
  return Boolean(getHeaderColumn(headerMap, header));
}

function getHeaderColumn(headerMap: Map<string, number>, header: string) {
  return headerMap.get(header) ?? headerMap.get(normalizeHeaderName(header));
}

function normalizeHeaderName(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function readLocalPriceOutputRows(worksheet: ExcelJS.Worksheet, headerMap: Map<string, number>) {
  const rows: LocalPriceOutputRow[] = [];
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const productId = getCellByHeaders(row, headerMap, ['商品ID', '原商品ID', '产品ID', 'Product ID']);
    const site = getCellByHeaders(row, headerMap, ['国家/站点', '国家', '站点', '市场']);
    const offerUrl = getCellByHeaders(row, headerMap, ['1688链接', '货源链接', '1688货源链接', '推荐1688链接'], true);
    const batchId = getCellByHeaders(row, headerMap, ['比价批次号', '当前比价批次号']);
    if (!productId && !site && !offerUrl && !batchId) {
      continue;
    }

    const itemPrice = getNumberByHeaders(row, headerMap, ['采购价', '商品价', '商品价格', '货源价格']);
    const shippingFee = getNumberByHeaders(row, headerMap, ['运费', '预估运费']);
    const explicitPurchaseCost = getNumberByHeaders(row, headerMap, ['采购总成本', '采购成本价', '采购成本', '成本价']);
    const purchaseCost =
      explicitPurchaseCost ||
      (typeof itemPrice === 'number' && typeof shippingFee === 'number' ? itemPrice + shippingFee : '');

    rows.push({
      rowNumber,
      productId,
      site,
      groupStatus: getCellByHeaders(row, headerMap, ['商品组状态', '状态']),
      candidateStatus: getCellByHeaders(row, headerMap, ['候选状态', '搜图状态', '处理状态']),
      purchaseCost,
      weightGram: getNumberByHeaders(row, headerMap, ['克重', '克重g', '重量g', '重量']),
      dimensions: getCellByHeaders(row, headerMap, ['尺寸', '规格尺寸']),
      manuallySelected: getBooleanByHeaders(row, headerMap, ['人工指定上架货源']),
      batchId,
      inputRecordId: getCellByHeaders(row, headerMap, ['输入表记录ID']),
      candidateRank: getNumberByHeaders(row, headerMap, ['候选序号', '推荐排名', '货源排名', '排名']),
      offerUrl,
      offerId: getCellByHeaders(row, headerMap, ['offerId', 'Offer ID', '货源ID']),
      skuName: getCellByHeaders(row, headerMap, ['SKU名称', '匹配SKU', 'SKU']),
      skuImageUrl: getCellByHeaders(row, headerMap, ['SKU图片URL'], true),
      itemPrice,
      shippingFee,
      supplier: getCellByHeaders(row, headerMap, ['供应商', '1688供应商', '货源供应商']),
      similarity: getNumberByHeaders(row, headerMap, ['相似度', 'SKU图片相似度', 'SKU相似度', '列表图片相似度']),
      minimumOrderQuantity: getNumberByHeaders(row, headerMap, ['起批量', '最小起订量']),
      annualSalesVolume: getNumberByHeaders(row, headerMap, ['年销量']),
      monthlyDistributionVolume: getNumberByHeaders(row, headerMap, ['月代销']),
      salesVolume: getNumberByHeaders(row, headerMap, ['1688销量', '销量']),
      salesText: getCellByHeaders(row, headerMap, ['1688销量文本', '销量文本']),
      salesRiskNote: getCellByHeaders(row, headerMap, ['销量风险备注']),
      riskNote: getCellByHeaders(row, headerMap, ['风险备注', '风险标记', '备注']),
      zhengheDataUrl: getCellByHeaders(row, headerMap, ['郑和数据链接', '郑和链接', '郑和商品链接'], true),
      sourceUrl: getCellByHeaders(row, headerMap, ['原商品链接', '商品链接', '商品URL', '原链接'], true),
      sourceImageUrl: getCellByHeaders(row, headerMap, ['原商品主图URL', '主图URL', '商品主图', '图片URL'], true),
    });
  }

  return rows;
}

function readLocalReviewRows(worksheet: ExcelJS.Worksheet, headerMap: Map<string, number>) {
  const rows: LocalReviewRow[] = [];
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const productId = getCellByHeaders(row, headerMap, ['商品ID', '原商品ID', '产品ID', 'Product ID']);
    const site = getCellByHeaders(row, headerMap, ['国家/站点', '国家', '站点', '市场']);
    if (!productId && !site) {
      continue;
    }

    rows.push({
      rowNumber,
      productId,
      site,
    });
  }

  return rows;
}

function groupLocalPriceOutputRows(rows: LocalPriceOutputRow[]) {
  const groups = new Map<string, LocalPriceOutputGroup>();
  for (const row of rows) {
    const key = buildLocalProductSiteKey(row.productId, row.site);
    if (!key) {
      continue;
    }

    const group = groups.get(key) ?? { key, productId: row.productId, site: row.site, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }

  return groups;
}

function getLatestLocalBatchRows(rows: LocalPriceOutputRow[]) {
  const latestBatchId = rows
    .map((row) => row.batchId)
    .filter(Boolean)
    .sort((left, right) => right.localeCompare(left))[0];
  return latestBatchId ? rows.filter((row) => row.batchId === latestBatchId) : rows;
}

function syncLocalOutputGroupStatus(
  worksheet: ExcelJS.Worksheet,
  headerMap: Map<string, number>,
  rows: LocalPriceOutputRow[],
) {
  const statusColumn = headerMap.get('商品组状态');
  if (!statusColumn || rows.length === 0) {
    return;
  }

  const targetStatus = rows.find((row) => row.groupStatus === '待更新表三')?.groupStatus
    ?? rows.find((row) => row.groupStatus === '已核实')?.groupStatus
    ?? '';
  if (!targetStatus) {
    return;
  }

  for (const row of rows) {
    worksheet.getRow(row.rowNumber).getCell(statusColumn).value = targetStatus;
  }
}

function buildLocalReviewRecommendation(rows: LocalPriceOutputRow[], weightToleranceGram: number): LocalReviewRecommendation {
  const firstRow = rows[0];
  const baseValues: Record<string, string | number> = {
    商品ID: firstRow?.productId ?? '',
    '国家/站点': firstRow?.site ?? '',
    比价批次号: firstRow?.batchId ?? '',
    输入表记录ID: firstRow?.inputRecordId ?? '',
    候选数量: rows.length,
    有效候选数量: getValidLocalReviewCandidates(rows).length,
    郑和数据链接: firstRow?.zhengheDataUrl ?? '',
    原商品链接: firstRow?.sourceUrl ?? '',
    原商品主图URL: firstRow?.sourceImageUrl ?? '',
  };

  if (rows.length === 0 || !firstRow) {
    return { success: false, values: { ...baseValues, 失败归因: '无可用候选链接' } };
  }

  const selectedRows = rows.filter((row) => row.manuallySelected);
  if (selectedRows.length > 1) {
    return { success: false, values: { ...baseValues, 失败归因: '人工指定多条候选' } };
  }

  const selectedRow = selectedRows[0] ?? selectLocalByWeightMajority(rows, weightToleranceGram);
  if (!selectedRow) {
    return {
      success: false,
      values: {
        ...baseValues,
        失败归因: getLocalSelectionFailureReason(rows),
      },
    };
  }

  const validationFailure = getLocalReviewValidationFailure(selectedRow);
  const selectedValues = buildLocalReviewValuesFromOutputRow(selectedRow, {
    candidateCount: rows.length,
    validCandidateCount: getValidLocalReviewCandidates(rows).length,
    selectionReason: selectedRows[0]
      ? '人工指定候选'
      : buildLocalWeightSelectionReason(rows, selectedRow, weightToleranceGram),
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

function getValidLocalReviewCandidates(rows: LocalPriceOutputRow[]) {
  return rows.filter((row) => !getLocalReviewValidationFailure(row));
}

function getLocalSelectionFailureReason(rows: LocalPriceOutputRow[]) {
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

function selectLocalByWeightMajority(rows: LocalPriceOutputRow[], weightToleranceGram: number) {
  const candidates = rows.filter((row) => row.candidateStatus !== '失败' && typeof row.weightGram === 'number' && row.offerUrl);
  if (candidates.length === 0) {
    return null;
  }

  const tolerance = Math.max(0, Number(weightToleranceGram) || 5);
  const sortedCandidates = [...candidates].sort((left, right) => Number(left.weightGram) - Number(right.weightGram));
  const groups: LocalPriceOutputRow[][] = [];
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
      return countDiff !== 0 ? countDiff : left.minCost - right.minCost;
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

function getLocalReviewValidationFailure(row: LocalPriceOutputRow) {
  if (!row.productId) return '商品ID无法关联';
  if (!row.site) return '国家/站点无法关联';
  if (!row.offerUrl) return '无可用候选链接';
  if (typeof row.itemPrice !== 'number') return '采购价缺失';
  if (typeof row.shippingFee !== 'number') return '运费缺失';
  if (typeof row.purchaseCost !== 'number') return '采购总成本缺失';
  if (typeof row.weightGram !== 'number') return '克重缺失';
  return '';
}

function buildLocalReviewValuesFromOutputRow(
  row: LocalPriceOutputRow,
  options: { candidateCount: number; validCandidateCount: number; selectionReason: string },
) {
  return {
    商品ID: row.productId,
    '国家/站点': row.site,
    比价批次号: row.batchId,
    输入表记录ID: row.inputRecordId,
    输出货源表记录ID: String(row.rowNumber),
    推荐1688链接: row.offerUrl,
    offerId: row.offerId,
    推荐SKU名称: row.skuName,
    SKU图片URL: row.skuImageUrl,
    采购价: row.itemPrice,
    运费: row.shippingFee,
    采购总成本: row.purchaseCost,
    克重: row.weightGram,
    尺寸: row.dimensions,
    起批量: row.minimumOrderQuantity,
    供应商: row.supplier,
    候选数量: options.candidateCount,
    有效候选数量: options.validCandidateCount,
    选择依据: options.selectionReason,
    风险备注: [row.riskNote, row.salesRiskNote].filter(Boolean).join('；'),
    郑和数据链接: row.zhengheDataUrl,
    原商品链接: row.sourceUrl,
    原商品主图URL: row.sourceImageUrl,
  };
}

function buildLocalWeightSelectionReason(rows: LocalPriceOutputRow[], selectedRow: LocalPriceOutputRow, weightToleranceGram: number) {
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

function buildLocalProductSiteKey(productId: string, site: string) {
  return [productId.trim(), site.trim().toLowerCase()].filter(Boolean).join('__');
}

function getNextWorksheetRowNumber(worksheet: ExcelJS.Worksheet) {
  return Math.max(worksheet.rowCount + 1, 2);
}

function getCellImageByHeader(row: ExcelJS.Row, headerMap: Map<string, number>, header: string, cellImageStore: CellImageStore) {
  const column = headerMap.get(header);
  if (!column) {
    return null;
  }

  const cellImageId = extractDispImageId(row.getCell(column).value);
  if (!cellImageId) {
    return null;
  }

  return cellImageStore.byId.get(cellImageId) ?? null;
}

function getOriginalImageCellForRow(
  workbook: ExcelJS.Workbook,
  worksheet: ExcelJS.Worksheet,
  row: ExcelJS.Row,
  headerMap: Map<string, number>,
  cellImageStore: CellImageStore,
  imageColumn?: number,
): OriginalImageCell {
  const sourceCell = imageColumn ? row.getCell(imageColumn) : null;
  const cellImage = getCellImageByHeader(row, headerMap, '原商品主图URL', cellImageStore);
  if (cellImage) {
    return { kind: 'cell-image', image: cellImage, value: sourceCell?.value };
  }

  const floatingImage = getEmbeddedImageReferenceForRow(workbook, worksheet, row.number, imageColumn);
  if (floatingImage) {
    return { ...floatingImage, value: sourceCell?.value };
  }

  return { kind: 'value', value: sourceCell?.value };
}

function getOnlyCellImageForRow(row: ExcelJS.Row, cellImageStore: CellImageStore) {
  const rowImages: CachedImage[] = [];
  row.eachCell((cell) => {
    const cellImageId = extractDispImageId(cell.value);
    const image = cellImageId ? cellImageStore.byId.get(cellImageId) : null;
    if (image) {
      rowImages.push(image);
    }
  });

  return rowImages.length === 1 ? rowImages[0] : null;
}

function getEmbeddedImageForRow(
  workbook: ExcelJS.Workbook,
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  preferredColumn?: number,
) {
  const imageReference = getEmbeddedImageReferenceForRow(workbook, worksheet, rowNumber, preferredColumn);
  if (!imageReference) {
    return null;
  }

  const workbookImage = workbook.getImage(Number(imageReference.imageId));
  if (!workbookImage?.buffer) {
    return null;
  }

  return {
    buffer: Buffer.from(workbookImage.buffer),
    extension: workbookImage.extension || imageReference.extension,
  };
}

function getEmbeddedImageReferenceForRow(
  workbook: ExcelJS.Workbook,
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  preferredColumn?: number,
): FloatingImageReference | null {
  const images = worksheet.getImages();

  const rowImages = images.filter((item) => {
    const range = item.range;
    const topRow = Math.floor(range.tl.nativeRow) + 1;
    const bottomRow = Math.floor(range.br?.nativeRow ?? range.tl.nativeRow) + 1;
    return rowNumber >= topRow && rowNumber <= bottomRow;
  });

  const image =
    preferredColumn == null
      ? rowImages[0]
      : rowImages.find((item) => {
          const range = item.range;
          const leftColumn = Math.floor(range.tl.nativeCol) + 1;
          const rightColumn = Math.floor(range.br?.nativeCol ?? range.tl.nativeCol) + 1;
          return preferredColumn >= leftColumn && preferredColumn <= rightColumn;
        });

  if (!image) {
    return null;
  }

  const workbookImage = workbook.getImage(Number(image.imageId));
  return {
    kind: 'floating-image',
    imageId: Number(image.imageId),
    extension: workbookImage.extension || 'png',
    range: image.range,
  };
}

function hasEmbeddedImageForRow(worksheet: ExcelJS.Worksheet, rowNumber: number) {
  return worksheet.getImages().some((item) => {
    const range = item.range;
    const topRow = Math.floor(range.tl.nativeRow) + 1;
    const bottomRow = Math.floor(range.br?.nativeRow ?? range.tl.nativeRow) + 1;
    return rowNumber >= topRow && rowNumber <= bottomRow;
  });
}

function isInputRowEmpty(worksheet: ExcelJS.Worksheet, headerMap: Map<string, number>, row: ExcelJS.Row) {
  const statusColumn = headerMap.get(statusHeader);
  for (const column of headerMap.values()) {
    if (column === statusColumn) {
      continue;
    }
    if (getCellText(row.getCell(column))) {
      return false;
    }
  }

  return !hasEmbeddedImageForRow(worksheet, row.number);
}

function isSupportedImageUrl(value: string) {
  if (!value) {
    return false;
  }

  if (value.startsWith('data:image/')) {
    return true;
  }

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

async function cacheImageFromUrl(url: string, targetPath: string) {
  if (url.startsWith('data:')) {
    const [, payload = ''] = url.split(',', 2);
    const isBase64 = url.slice(0, url.indexOf(',')).includes(';base64');
    const bytes = isBase64 ? Buffer.from(payload, 'base64') : Buffer.from(decodeURIComponent(payload));
    await fs.writeFile(targetPath, bytes);
    return;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`图片下载失败：${response.status} ${response.statusText}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(targetPath, bytes);
}

async function copyCellImagesPackage(inputExcelPath: string, outputExcelPath: string) {
  const inputBytes = await fs.readFile(inputExcelPath);
  const outputBytes = await fs.readFile(outputExcelPath);
  const inputZip = await JSZip.loadAsync(inputBytes);
  const outputZip = await JSZip.loadAsync(outputBytes);
  const cellImagesXml = await inputZip.file('xl/cellimages.xml')?.async('nodebuffer');
  const cellImagesRelsXml = await inputZip.file('xl/_rels/cellimages.xml.rels')?.async('nodebuffer');

  if (!cellImagesXml || !cellImagesRelsXml) {
    return;
  }

  outputZip.file('xl/cellimages.xml', cellImagesXml);
  outputZip.file('xl/_rels/cellimages.xml.rels', cellImagesRelsXml);
  await copyCellImageMediaFiles(inputZip, outputZip, cellImagesRelsXml.toString('utf8'));
  await ensureCellImagesContentType(outputZip);
  const nextBytes = await outputZip.generateAsync({ type: 'nodebuffer' });
  await fs.writeFile(outputExcelPath, nextBytes);
}

async function copyCellImageMediaFiles(inputZip: JSZip, outputZip: JSZip, cellImagesRelsXml: string) {
  const targets = parseRelationshipTargets(cellImagesRelsXml);
  for (const target of targets.values()) {
    const zipPath = normalizeZipPath('xl', target);
    const imageBytes = await inputZip.file(zipPath)?.async('nodebuffer');
    if (imageBytes) {
      outputZip.file(zipPath, imageBytes);
    }
  }
}

async function ensureCellImagesContentType(outputZip: JSZip) {
  const contentTypesPath = '[Content_Types].xml';
  const contentTypesXml = await outputZip.file(contentTypesPath)?.async('string');
  if (!contentTypesXml || contentTypesXml.includes('/xl/cellimages.xml')) {
    return;
  }

  const override =
    '<Override PartName="/xl/cellimages.xml" ContentType="application/vnd.wps-officedocument.cellimage+xml"/>';
  outputZip.file(contentTypesPath, contentTypesXml.replace('</Types>', `${override}</Types>`));
}

function ensureOutputHeaders(worksheet: ExcelJS.Worksheet) {
  const existingHeaders = buildHeaderMap(worksheet);
  const outputHeaders = [
    '原商品主图本地路径',
    '郑和数据链接',
    '搜图状态',
    '1688候选数',
    '推荐1688链接1',
    '推荐1688链接2',
    '推荐1688链接3',
    '匹配SKU',
    '采购成本价',
    '商品价',
    '运费',
    '尺寸',
    '克重',
    '克重置信度',
    'SKU图片相似度',
    '供应商评分',
    '风险备注',
    '执行模式',
    '候选链接数设置',
    '采纳下钻条数设置',
    '详情页并发设置',
    'AI列表批量大小设置',
  ];

  let nextColumn = worksheet.getRow(1).cellCount + 1;
  for (const header of outputHeaders) {
    if (!existingHeaders.has(header)) {
      worksheet.getRow(1).getCell(nextColumn).value = header;
      nextColumn += 1;
    }
  }

  return buildHeaderMap(worksheet);
}

function setOutputCell(
  worksheet: ExcelJS.Worksheet,
  headerMap: Map<string, number>,
  rowNumber: number,
  header: string,
  value: string | number,
) {
  const column = headerMap.get(header);
  if (column) {
    worksheet.getRow(rowNumber).getCell(column).value = value;
  }
}

function restoreOriginalImageCells(context: RowProcessContext, rowNumbers: number[]) {
  const imageColumn = context.imageColumn;
  if (!imageColumn) {
    return;
  }

  for (const rowNumber of rowNumbers) {
    const originalCell = context.originalImageCells.get(rowNumber);
    const cell = context.worksheet.getRow(rowNumber).getCell(imageColumn);
    if (!originalCell) {
      continue;
    }

    cell.value = originalCell.value ?? null;
  }
}

function createCandidateSheet(workbook: ExcelJS.Workbook, items: ProductItem[]) {
  const existing = workbook.getWorksheet('1688候选供应商');
  if (existing) {
    workbook.removeWorksheet(existing.id);
  }

  const sheet = workbook.addWorksheet('1688候选供应商');
  sheet.columns = [
    { header: '原商品ID', key: 'productId', width: 18 },
    { header: '推荐排名', key: 'rank', width: 12 },
    { header: '1688链接', key: 'offerUrl', width: 28 },
    { header: 'offerId', key: 'offerId', width: 16 },
    { header: '列表图片相似度', key: 'listImageSimilarity', width: 16 },
    { header: 'SKU名称', key: 'skuName', width: 30 },
    { header: 'SKU图片相似度', key: 'skuImageSimilarity', width: 16 },
    { header: '商品价', key: 'itemPrice', width: 12 },
    { header: '运费', key: 'shippingFee', width: 12 },
    { header: '采购成本价', key: 'purchaseCost', width: 14 },
    { header: '尺寸', key: 'dimensions', width: 18 },
    { header: '克重g', key: 'weightGram', width: 12 },
    { header: '供应商', key: 'supplier', width: 18 },
    { header: '商品标题', key: 'title', width: 26 },
    { header: '年销量', key: 'annualSalesVolume', width: 12 },
    { header: '月代销', key: 'monthlyDistributionVolume', width: 12 },
    { header: '1688销量', key: 'salesVolume', width: 12 },
    { header: '1688销量文本', key: 'salesText', width: 16 },
    { header: '销量风险备注', key: 'salesRiskNote', width: 26 },
    { header: '风险标记', key: 'risk', width: 30 },
  ];

  for (const item of items) {
    for (const match of getTopPriceMatches(item, 3)) {
      const candidate = findCandidateByOfferId(item, match.offerId);
      sheet.addRow({
        productId: match.productId,
        rank: match.rank,
        offerUrl: match.offerUrl,
        offerId: match.offerId,
        listImageSimilarity: candidate?.listImageSimilarity ?? '',
        skuName: match.skuName,
        skuImageSimilarity: match.skuImageSimilarity,
        itemPrice: match.itemPrice ?? '',
        shippingFee: match.shippingFee ?? '',
        purchaseCost: match.purchaseCost ?? '',
        dimensions: match.dimensions ?? '',
        weightGram: match.weightGram ?? '',
        supplier: candidate?.supplier ?? '',
        title: candidate?.title ?? '',
        annualSalesVolume: candidate?.annualSalesVolume ?? '',
        monthlyDistributionVolume: candidate?.monthlyDistributionVolume ?? '',
        salesVolume: candidate?.salesVolume ?? '',
        salesText: candidate?.salesText ?? '',
        salesRiskNote: candidate?.salesRiskNote ?? '',
        risk: [...(candidate?.riskFlags ?? []), ...match.riskFlags].join('；'),
      });
    }
  }
}

function createSkuMatchSheet(workbook: ExcelJS.Workbook, items: ProductItem[]) {
  const existing = workbook.getWorksheet('SKU匹配结果');
  if (existing) {
    workbook.removeWorksheet(existing.id);
  }

  const sheet = workbook.addWorksheet('SKU匹配结果');
  sheet.columns = [
    { header: '原商品ID', key: 'productId', width: 18 },
    { header: '1688链接', key: 'offerUrl', width: 28 },
    { header: 'offerId', key: 'offerId', width: 16 },
    { header: '列表图片相似度', key: 'listImageSimilarity', width: 16 },
    { header: 'skuId', key: 'skuId', width: 18 },
    { header: 'SKU名称', key: 'skuName', width: 30 },
    { header: 'SKU图片URL', key: 'skuImageUrl', width: 30 },
    { header: 'SKU图片相似度', key: 'skuImageSimilarity', width: 16 },
    { header: '商品价', key: 'itemPrice', width: 12 },
    { header: '运费', key: 'shippingFee', width: 12 },
    { header: '采购成本价', key: 'purchaseCost', width: 14 },
    { header: '币种', key: 'currency', width: 10 },
    { header: '数量', key: 'quantity', width: 10 },
    { header: '尺寸', key: 'dimensions', width: 18 },
    { header: '克重g', key: 'weightGram', width: 12 },
    { header: '克重来源', key: 'weightSource', width: 14 },
    { header: '克重置信度', key: 'weightConfidence', width: 14 },
    { header: '提取来源', key: 'extractionSource', width: 14 },
    { header: '供应商', key: 'supplier', width: 18 },
    { header: '商品标题', key: 'title', width: 26 },
    { header: '年销量', key: 'annualSalesVolume', width: 12 },
    { header: '月代销', key: 'monthlyDistributionVolume', width: 12 },
    { header: '1688销量', key: 'salesVolume', width: 12 },
    { header: '1688销量文本', key: 'salesText', width: 16 },
    { header: '销量风险备注', key: 'salesRiskNote', width: 26 },
    { header: '风险标记', key: 'riskFlags', width: 30 },
  ];

  for (const item of items) {
    const bestMatch = getBestPriceMatch(item);
    if (!bestMatch) {
      continue;
    }

    const candidate = findCandidateByOfferId(item, bestMatch.offerId);
    sheet.addRow({
      ...bestMatch,
      listImageSimilarity: candidate?.listImageSimilarity ?? '',
      supplier: candidate?.supplier ?? '',
      title: candidate?.title ?? '',
      annualSalesVolume: candidate?.annualSalesVolume ?? '',
      monthlyDistributionVolume: candidate?.monthlyDistributionVolume ?? '',
      salesVolume: candidate?.salesVolume ?? '',
      salesText: candidate?.salesText ?? '',
      salesRiskNote: candidate?.salesRiskNote ?? '',
      riskFlags: [...(candidate?.riskFlags ?? []), ...bestMatch.riskFlags].join('；'),
    });
  }
}

function createRunSettingsSheet(workbook: ExcelJS.Workbook, settingsRows: ProcessExcelInput['settingsRows'] = []) {
  const existing = workbook.getWorksheet('执行配置');
  if (existing) {
    workbook.removeWorksheet(existing.id);
  }

  const sheet = workbook.addWorksheet('执行配置');
  sheet.columns = [
    { header: '配置项', key: 'name', width: 24 },
    { header: '配置值', key: 'value', width: 40 },
  ];

  for (const row of settingsRows) {
    sheet.addRow(row);
  }
}

function findCandidateByOfferId(item: ProductItem, offerId: string) {
  return item.candidates?.find((candidate) => candidate.offerId === offerId);
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

function getRiskNote(item: ProductItem) {
  if (item.status === 'success') {
    const riskFlags = [
      ...(item.candidates ?? []).flatMap((candidate) => candidate.riskFlags),
      ...(item.skuMatches ?? []).flatMap((match) => match.riskFlags),
    ];
    return riskFlags.join('；');
  }

  return item.errorMessage ?? '处理失败';
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

function writeSelectionRowResult(
  worksheet: ExcelJS.Worksheet,
  outputHeaderMap: Map<string, number>,
  rowNumber: number,
  item: ProductItem,
  input: ProcessExcelInput,
) {
  const itemCandidates = item.candidates ?? [];
  const topPriceMatches = getTopPriceMatches(item, 3);
  const bestSkuMatch = getBestPriceMatch(item);

  setOutputCell(worksheet, outputHeaderMap, rowNumber, '搜图状态', getSelectionRowStatus(item));
  setOutputCell(worksheet, outputHeaderMap, rowNumber, '原商品主图本地路径', item.localImagePath ?? item.imageUrl ?? '');
  setOutputCell(worksheet, outputHeaderMap, rowNumber, '郑和数据链接', item.zhengheDataUrl ?? '');
  setOutputCell(worksheet, outputHeaderMap, rowNumber, '1688候选数', itemCandidates.length);
  setOutputCell(worksheet, outputHeaderMap, rowNumber, '推荐1688链接1', topPriceMatches[0]?.offerUrl ?? itemCandidates[0]?.offerUrl ?? '');
  setOutputCell(worksheet, outputHeaderMap, rowNumber, '推荐1688链接2', topPriceMatches[1]?.offerUrl ?? itemCandidates[1]?.offerUrl ?? '');
  setOutputCell(worksheet, outputHeaderMap, rowNumber, '推荐1688链接3', topPriceMatches[2]?.offerUrl ?? itemCandidates[2]?.offerUrl ?? '');
  setOutputCell(worksheet, outputHeaderMap, rowNumber, '匹配SKU', bestSkuMatch?.skuName ?? '');
  setOutputCell(worksheet, outputHeaderMap, rowNumber, '采购成本价', bestSkuMatch?.purchaseCost ?? '');
  setOutputCell(worksheet, outputHeaderMap, rowNumber, '商品价', bestSkuMatch?.itemPrice ?? '');
  setOutputCell(worksheet, outputHeaderMap, rowNumber, '运费', bestSkuMatch?.shippingFee ?? '');
  setOutputCell(worksheet, outputHeaderMap, rowNumber, '尺寸', bestSkuMatch?.dimensions ?? '');
  setOutputCell(worksheet, outputHeaderMap, rowNumber, '克重', bestSkuMatch?.weightGram ?? '');
  setOutputCell(worksheet, outputHeaderMap, rowNumber, '克重置信度', bestSkuMatch?.weightConfidence ?? '');
  setOutputCell(worksheet, outputHeaderMap, rowNumber, 'SKU图片相似度', bestSkuMatch?.skuImageSimilarity ?? '');
  setOutputCell(worksheet, outputHeaderMap, rowNumber, '供应商评分', itemCandidates[0]?.score ?? '');
  setOutputCell(worksheet, outputHeaderMap, rowNumber, '风险备注', getRiskNote(item));
  setOutputCell(worksheet, outputHeaderMap, rowNumber, '执行模式', input.sourcingMode === 'fast' ? '快速模式' : '精准模式');
  setOutputCell(worksheet, outputHeaderMap, rowNumber, '候选链接数设置', input.candidateLimit);
  setOutputCell(worksheet, outputHeaderMap, rowNumber, '采纳下钻条数设置', input.acceptedCandidateLimit);
  setOutputCell(worksheet, outputHeaderMap, rowNumber, '详情页并发设置', input.detailPageConcurrency);
  setOutputCell(worksheet, outputHeaderMap, rowNumber, 'AI列表批量大小设置', input.aiListBatchSize);
}

function formatCandidateLinksForLog(candidates: SupplierCandidate[] | undefined) {
  const links = (candidates ?? []).map((candidate) => candidate.offerUrl).filter(Boolean).slice(0, 3);
  return links.length > 0 ? `已获取候选详情页链接：${links.join('、')}` : '尚未获取候选详情页链接';
}

function getFailureStageForLog(item: ProductItem) {
  if ((item.candidates ?? []).length > 0) {
    return '详情页验证或结果筛选阶段';
  }

  if (item.localImagePath) {
    return '搜图结果页候选解析阶段';
  }

  return '原商品主图读取/缓存阶段';
}

export async function processProductItems(input: ProcessProductItemsInput): Promise<ProcessExcelResult> {
  const imageDir = path.join(input.assetDir, 'images');
  await fs.mkdir(imageDir, { recursive: true });
  const rowResults = await mapWithConcurrency(input.items, 1, async (item, index) => {
    await stagger(index, 500, 1600);
    return await processProductItemWithRetry(input, item, imageDir);
  });
  const items = rowResults.sort((left, right) => left.rowIndex - right.rowIndex);
  const successCount = items.filter((item) => item.status === 'success').length;
  const failedCount = items.length - successCount;
  return {
    totalCount: items.length,
    successCount,
    failedCount,
    items,
  };
}

async function processProductItemWithRetry(
  input: ProductProcessingInput,
  item: ProductItem,
  imageDir = path.join(input.assetDir, 'images'),
): Promise<ProductItem> {
  const maxAttempts = Math.max(1, Math.floor(input.retryCount) + 1);
  let latestItem = item;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    throwIfAborted(input.signal);
    const attemptItem: ProductItem = {
      ...item,
      status: 'pending',
      errorMessage: undefined,
      candidates: undefined,
      skuMatches: undefined,
    };

    if (attempt > 1) {
      input.appendLog('warn', `第 ${item.rowIndex} 行第 ${attempt}/${maxAttempts} 次重试开始。`);
    }

    latestItem = await processProductItem(input, attemptItem, imageDir);
    if (latestItem.status === 'success') {
      if (attempt > 1) {
        input.appendLog('info', `第 ${item.rowIndex} 行重试成功。`);
      }
      return latestItem;
    }

    if (attempt < maxAttempts) {
      input.appendLog('warn', `第 ${item.rowIndex} 行本次失败：${latestItem.errorMessage ?? latestItem.status}，准备重试。`);
      await delay(1000 * attempt);
    }
  }

  return latestItem;
}

export async function processProductItem(
  input: ProductProcessingInput,
  item: ProductItem,
  imageDir = path.join(input.assetDir, 'images'),
): Promise<ProductItem> {
  throwIfAborted(input.signal);
  await fs.mkdir(imageDir, { recursive: true });
  await enrichProductItemFromZhenghe(input, item);
  input.appendLog('info', `开始处理第 ${item.rowIndex} 行：${item.productId}`);

  try {
    if (!item.productId) {
      throw new Error('缺少原商品ID');
    }

    if (isSupportedImageUrl(item.imageUrl ?? '')) {
      const imagePath = path.join(imageDir, `${item.rowIndex}-${item.productId}.jpg`);
      item.sourceImageUrl ||= item.imageUrl;
      await cacheImageFromUrl(item.imageUrl ?? '', imagePath);
      item.localImagePath = imagePath;
      item.imageUrl = imagePath;
      item.status = 'success';
    } else if (item.localImagePath) {
      item.status = 'success';
    } else {
      item.status = 'missing_image';
      item.errorMessage = item.imageUrl
        ? `原商品主图URL 不是可下载图片地址：${item.imageUrl}`
        : '缺少内嵌图片和原商品主图URL';
    }

    if (item.status === 'success' && item.localImagePath && input.searchAdapter) {
      throwIfAborted(input.signal);
      input.appendLog('info', `第 ${item.rowIndex} 行开始搜图：${item.localImagePath}`);
      item.candidates = await input.searchAdapter.searchByImage({
        item,
        imagePath: item.localImagePath,
        candidateLimit: input.candidateLimit,
        acceptedCandidateLimit: input.acceptedCandidateLimit,
        enableRealFactoryFilter: input.enable1688RealFactoryFilter,
        enableStrengthFactoryFilter: input.enable1688StrengthFactoryFilter,
        signal: input.signal,
        appendLog: input.appendLog,
      });
      throwIfAborted(input.signal);
      input.appendLog('info', `第 ${item.rowIndex} 行搜图完成：${item.candidates.length} 个候选`);
      if (item.candidates.length === 0) {
        item.status = 'not_found';
        item.errorMessage = '未找到对应货源商品';
      }
    }

    if (item.status === 'success' && item.localImagePath && input.detailAdapter && item.candidates?.length) {
      throwIfAborted(input.signal);
      const originalImagePath = item.localImagePath;
      item.skuMatches = [];
      const qualifiedCandidates = await filterCandidatesByListSimilarity(
        item,
        originalImagePath,
        item.candidates,
        input.imageSimilarityService,
        input.acceptedCandidateLimit,
        input.sourcingMode,
        input.aiListBatchSize,
        input,
        input.appendLog,
        input.signal,
      );
      throwIfAborted(input.signal);

      item.skuMatches = await inspectQualifiedCandidatesUntilEnough(
        input,
        item,
        originalImagePath,
        qualifiedCandidates,
        `第 ${item.rowIndex} 行`,
      );

      if (qualifiedCandidates.length > 0 && getQualifiedMatches(item).length === 0) {
        item.status = 'failed';
        item.errorMessage = '相似度达标候选均未拿到可用 SKU 图片、价格或运费';
      }
    }
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    item.status = 'failed';
    item.errorMessage = error instanceof Error ? error.message : String(error);
  }

  return item;
}

async function enrichProductItemFromZhenghe(input: ProductProcessingInput, item: ProductItem) {
  if (!item.zhengheDataUrl?.trim() || isSupportedImageUrl(item.imageUrl ?? '') || item.localImagePath) {
    return;
  }

  try {
    const zhengheData = await new ZhengheDataClient().fetchProductData({
      url: item.zhengheDataUrl,
      fallbackRegion: item.country,
    });
    if (!zhengheData.metrics.baseInfoTrusted) {
      input.appendLog('warn', `第 ${item.rowIndex} 行郑和数据返回商品或站点不匹配，已拒绝使用返回主图：${zhengheData.metrics.infoWarning}`);
      return;
    }
    const mainImageUrl = zhengheData.metrics.mainImageUrl;
    if (!mainImageUrl) {
      input.appendLog('warn', `第 ${item.rowIndex} 行郑和数据未返回主图URL`);
      return;
    }

    item.imageUrl = mainImageUrl;
    item.sourceImageUrl = mainImageUrl;
    item.sourceUrl ||= zhengheData.productUrl;
    item.country ||= zhengheData.region;
    if (zhengheData.metrics.baseInfoTrusted) {
      item.title ||= zhengheData.metrics.productName;
      item.category ||= zhengheData.metrics.categoryFullName;
    }
    input.appendLog('info', `第 ${item.rowIndex} 行郑和数据补主图成功：${mainImageUrl}`);
  } catch (error) {
    input.appendLog('warn', `第 ${item.rowIndex} 行郑和数据补主图失败：${error instanceof Error ? error.message : String(error)}`);
  }
}

async function filterCandidatesByListSimilarity(
  item: ProductItem,
  originalImagePath: string,
  candidates: SupplierCandidate[],
  imageSimilarityService: ImageSimilarityService | undefined,
  acceptedCandidateLimit: number,
  sourcingMode: ProcessExcelInput['sourcingMode'],
  aiListBatchSize: number,
  input: SalesReferenceConfig,
  appendLog: ProcessExcelInput['appendLog'],
  signal?: AbortSignal,
) {
  const qualifiedCandidates: SupplierCandidate[] = [];
  throwIfAborted(signal);
  const targetImageUrlOrPaths = candidates.map((candidate) =>
    candidate.coverImageUrl?.startsWith('local://') ? '' : candidate.coverImageUrl || '',
  );
  const batchComparableIndexes = targetImageUrlOrPaths
    .map((targetImageUrlOrPath, index) => ({ targetImageUrlOrPath, index }))
    .filter((entry) => entry.targetImageUrlOrPath);
  if (imageSimilarityService && batchComparableIndexes.length > 0) {
    appendLog('info', `${item.productId} 开始批量 AI 列表相似度识别：${batchComparableIndexes.length} 张候选封面`);
  }
  const batchResults: Array<Awaited<ReturnType<ImageSimilarityService['compareBatch']>>[number] | undefined> = [];
  if (imageSimilarityService && batchComparableIndexes.length > 0) {
    const batchSize = Math.max(1, aiListBatchSize);
    for (let startIndex = 0; startIndex < batchComparableIndexes.length; startIndex += batchSize) {
      throwIfAborted(signal);
      const batch = batchComparableIndexes.slice(startIndex, startIndex + batchSize);
      try {
        const results = await imageSimilarityService.compareBatch({
          sourceImagePath: originalImagePath,
          targetImageUrlOrPaths: batch.map((entry) => entry.targetImageUrlOrPath),
        });
        batchResults.push(...results);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        appendLog('warn', `${item.productId} 第 ${Math.floor(startIndex / batchSize) + 1} 批列表相似度识别失败，使用列表候选分数兜底：${reason}`);
        batchResults.push(...batch.map(() => undefined));
      }
    }
  }
  throwIfAborted(signal);
  if (batchResults.length > 0) {
    appendLog('info', `${item.productId} 批量 AI 列表相似度识别完成：${batchResults.length}/${batchComparableIndexes.length}`);
  }
  const batchResultByCandidateIndex = new Map(
    batchComparableIndexes.map((entry, index) => [entry.index, batchResults[index]] as const).filter((entry) => entry[1]),
  );

  for (const [index, candidate] of candidates.entries()) {
    throwIfAborted(signal);
    try {
      const fallbackScore = candidate.listImageSimilarity ?? candidate.score / 100;
      const similarityResult = batchResultByCandidateIndex.get(index) ?? {
        score: fallbackScore,
        isSameProduct: fallbackScore >= 0.86,
        reason: '使用列表候选分数作为相似度占位',
        provider: 'mock' as const,
      };

      candidate.listImageSimilarity = similarityResult.score;
      candidate.suggestion = similarityResult.isSameProduct ? '待详情验证' : '不建议';
      candidate.riskFlags.push(`列表相似度：${similarityResult.score}，${similarityResult.reason}`);
      apply1688SalesReference(candidate, input);

      if (similarityResult.isSameProduct && !shouldFilterBy1688Sales(candidate)) {
        qualifiedCandidates.push(candidate);
      }
    } catch (error) {
      candidate.suggestion = '不建议';
      candidate.riskFlags.push(`列表相似度识别失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const acceptedCandidates = qualifiedCandidates.sort(
    sourcingMode === 'fast' ? compareCandidatesForPriceFirst : compareCandidatesForSimilarityFirst,
  );
  appendLog(
    'info',
    `${item.productId} 列表相似度达标：${qualifiedCandidates.length}/${candidates.length} 个候选，${
      sourcingMode === 'fast' ? '快速模式按列表价低优先' : '精准模式按列表相似度高优先'
    }目标下钻成功数：${Math.max(1, acceptedCandidateLimit)} 个`,
  );
  return acceptedCandidates;
}

async function inspectQualifiedCandidatesUntilEnough(
  input: ProductProcessingInput,
  item: ProductItem,
  originalImagePath: string,
  qualifiedCandidates: SupplierCandidate[],
  rowLabel: string,
) {
  const detailAdapter = input.detailAdapter;
  if (!detailAdapter || qualifiedCandidates.length === 0) {
    return [];
  }

  const targetCount = Math.max(1, input.acceptedCandidateLimit);
  const batchSize = targetCount;
  const successfulMatches: SkuMatchResult[] = [];

  for (let startIndex = 0; startIndex < qualifiedCandidates.length; startIndex += batchSize) {
    throwIfAborted(input.signal);
    const batch = qualifiedCandidates.slice(startIndex, startIndex + batchSize);
    const batchIndex = Math.floor(startIndex / batchSize) + 1;

    if (startIndex > 0) {
      input.appendLog(
        'warn',
        `${rowLabel}有效候选不足 ${successfulMatches.length}/${targetCount}，继续下钻第 ${batchIndex} 批候选。`,
      );
    }

    const matches = await mapWithConcurrency(batch, input.detailPageConcurrency, async (candidate, index) => {
      throwIfAborted(input.signal);
      await stagger(index, 300, 1200);
      input.appendLog('info', `${rowLabel}进入详情页验证 SKU：${candidate.offerUrl}`);
      try {
        const skuMatch = await detailAdapter.inspectCandidate({
          item,
          candidate,
          originalImagePath,
          sourcingMode: input.sourcingMode,
          imageSimilarityService: input.imageSimilarityService,
          appendLog: input.appendLog,
          signal: input.signal,
        });
        if (skuMatch && Number.isFinite(skuMatch.purchaseCost)) {
          input.appendLog('info', `${rowLabel} SKU 验证完成：${candidate.offerId}，成本 ${skuMatch.purchaseCost}`);
          return skuMatch;
        }

        candidate.suggestion = '不建议';
        candidate.riskFlags.push('详情页 SKU 验证未返回可用价格或运费');
        return null;
      } catch (error) {
        if (isAbortError(error)) {
          throw error;
        }

        const reason = error instanceof Error ? error.message : String(error);
        candidate.suggestion = '不建议';
        candidate.riskFlags.push(`详情页验证失败：${reason}`);
        input.appendLog('warn', `${rowLabel}候选详情页验证失败：${candidate.offerUrl}，${reason}`);
        return null;
      }
    });

    successfulMatches.push(...matches.filter((match): match is SkuMatchResult => Boolean(match)));
    if (successfulMatches.length >= targetCount) {
      break;
    }
  }

  if (successfulMatches.length < targetCount && qualifiedCandidates.length > 0) {
    input.appendLog(
      'warn',
      `${rowLabel}详情页验证结束，可用候选 ${successfulMatches.length}/${targetCount}，达标候选已耗尽。`,
    );
  }

  return successfulMatches;
}

function shouldFilterBy1688Sales(candidate: SupplierCandidate) {
  return (candidate.salesRiskNote ?? '').includes('按配置剔除候选');
}

function apply1688SalesReference(candidate: SupplierCandidate, input: SalesReferenceConfig) {
  const salesRisk = get1688SalesRisk(candidate, input);
  candidate.salesRiskNote = salesRisk;
  if (salesRisk) {
    candidate.riskFlags.push(salesRisk);
  }
}

function get1688SalesRisk(candidate: SupplierCandidate, input: SalesReferenceConfig) {
  const pluginDataAvailable =
    typeof candidate.annualSalesVolume === 'number' ||
    typeof candidate.monthlyDistributionVolume === 'number' ||
    Boolean(candidate.pluginExtraText);
  const risks: string[] = [];

  if (input.enable1688AnnualSalesFilter) {
    if (typeof candidate.annualSalesVolume === 'number') {
      if (candidate.annualSalesVolume < input.min1688AnnualSales) {
        risks.push(`年销量低于阈值：${candidate.annualSalesVolume}/${input.min1688AnnualSales}，按配置剔除候选`);
        return risks.join('；');
      }
      risks.push(`年销量达标：${candidate.annualSalesVolume}/${input.min1688AnnualSales}`);
      return risks.join('；');
    }

    if (pluginDataAvailable) {
      risks.push('年销量缺失，顺延使用月代销');
    }
  }

  if (input.enable1688MonthlySalesFilter) {
    if (typeof candidate.monthlyDistributionVolume === 'number') {
      if (candidate.monthlyDistributionVolume < input.min1688MonthlySales) {
        risks.push(`月代销低于阈值：${candidate.monthlyDistributionVolume}/${input.min1688MonthlySales}，按配置剔除候选`);
        return risks.join('；');
      }
      risks.push(`月代销达标：${candidate.monthlyDistributionVolume}/${input.min1688MonthlySales}`);
      return risks.join('；');
    }

    if (pluginDataAvailable) {
      risks.push('月代销缺失');
    }
  }

  if (pluginDataAvailable) {
    return risks.join('；');
  }

  if (!input.enable1688SalesReference) {
    return risks.join('；');
  }

  if (typeof candidate.salesVolume !== 'number') {
    if (input.missing1688SalesAction === 'ignore') {
      return risks.join('；');
    }
    risks.push(input.missing1688SalesAction === 'filter' ? '1688已售数量缺失，按配置剔除候选' : '1688已售数量缺失，需人工参考');
    return risks.join('；');
  }

  if (candidate.salesVolume < input.min1688SalesVolume) {
    risks.push(`1688已售数量低于阈值：${candidate.salesVolume}/${input.min1688SalesVolume}`);
  } else {
    risks.push(`1688已售数量兜底达标：${candidate.salesVolume}/${input.min1688SalesVolume}`);
  }

  return risks.join('；');
}

function getRowWorkflowStatus(row: ExcelJS.Row, headerMap: Map<string, number>) {
  return getCellByHeader(row, headerMap, statusHeader).trim();
}

function isPendingWorkflowStatus(status: string) {
  return !status || status === pendingStatusText;
}

function shouldSkipLocalRow(status: string, statusFilter: ProcessExcelInput['statusFilter'] = 'retryable') {
  if (status === completedStatusText || status === runningStatusText) {
    return true;
  }

  if (statusFilter === 'failedOnly') {
    return status !== failedStatusText;
  }

  return statusFilter === 'pendingOnly' && !isPendingWorkflowStatus(status);
}

function setWorkflowStatus(worksheet: ExcelJS.Worksheet, headerMap: Map<string, number>, rowNumber: number, status: string) {
  const column = headerMap.get(statusHeader);
  if (column) {
    worksheet.getRow(rowNumber).getCell(column).value = status;
  }
}

function ensureLocalStatusHeader(worksheet: ExcelJS.Worksheet) {
  const headerMap = buildHeaderMap(worksheet);
  if (headerMap.get(statusHeader) === 1) {
    return headerMap;
  }

  if (headerMap.has(statusHeader)) {
    return headerMap;
  }

  worksheet.spliceColumns(1, 0, [statusHeader]);
  return buildHeaderMap(worksheet);
}

function compareCandidatesForPriceFirst(left: SupplierCandidate, right: SupplierCandidate) {
  const leftHasPrice = Number.isFinite(left.listPrice);
  const rightHasPrice = Number.isFinite(right.listPrice);
  if (leftHasPrice !== rightHasPrice) {
    return leftHasPrice ? -1 : 1;
  }

  if (leftHasPrice && rightHasPrice && Number(left.listPrice) !== Number(right.listPrice)) {
    return Number(left.listPrice) - Number(right.listPrice);
  }

  return Number(right.listImageSimilarity ?? 0) - Number(left.listImageSimilarity ?? 0);
}

function compareCandidatesForSimilarityFirst(left: SupplierCandidate, right: SupplierCandidate) {
  const similarityDiff = Number(right.listImageSimilarity ?? 0) - Number(left.listImageSimilarity ?? 0);
  if (similarityDiff !== 0) {
    return similarityDiff;
  }

  return compareCandidatesForPriceFirst(left, right);
}

export async function processExcelTask(input: ProcessExcelInput): Promise<ProcessExcelResult> {
  throwIfAborted(input.signal);
  const { workbook, worksheet, headerMap } = await readWorkbook(input.inputExcelPath);
  const cellImageStore = await readCellImageStore(input.inputExcelPath);
  const imageDir = path.join(input.assetDir, 'images');
  await fs.mkdir(imageDir, { recursive: true });

  const outputHeaderMap = ensureOutputHeaders(worksheet);
  const imageColumn = headerMap.get('原商品主图URL');
  const rowNumbers: number[] = [];
  let skippedCount = 0;

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    throwIfAborted(input.signal);
    const row = worksheet.getRow(rowNumber);
    if (isInputRowEmpty(worksheet, headerMap, row)) {
      input.appendLog('info', `第 ${rowNumber} 行为空，停止继续读取。`);
      break;
    }
    const workflowStatus = getRowWorkflowStatus(row, headerMap);
    if (shouldSkipLocalRow(workflowStatus, input.statusFilter)) {
      skippedCount += 1;
      input.appendLog('info', `第 ${rowNumber} 行状态为「${workflowStatus}」，跳过不重复执行。`);
      continue;
    }
    setWorkflowStatus(worksheet, headerMap, rowNumber, runningStatusText);
    rowNumbers.push(rowNumber);
    if (input.rowLimit && rowNumbers.length >= input.rowLimit) {
      break;
    }
  }

  input.appendLog(
    'info',
    `Excel 待执行数据 ${rowNumbers.length} 行，跳过已完成/处理中 ${skippedCount} 行，行并发 ${Math.max(1, input.excelRowConcurrency)}，详情页并发 ${Math.max(1, input.detailPageConcurrency)}。`,
  );

  const context: RowProcessContext = {
    workbook,
    worksheet,
    headerMap,
    cellImageStore,
    originalImageCells: new Map(),
    imageDir,
    imageColumn,
  };

  const rowResults = await mapWithConcurrency(rowNumbers, input.excelRowConcurrency, async (rowNumber, index) => {
    await stagger(index, 500, 1600);
    return await processInputRowWithRetry(input, context, rowNumber);
  });
  const items = rowResults.map((result) => result.item).sort((left, right) => left.rowIndex - right.rowIndex);
  let successCount = 0;
  let failedCount = 0;

  for (const { item, rowNumber } of rowResults.sort((left, right) => left.rowNumber - right.rowNumber)) {
    writeSelectionRowResult(worksheet, outputHeaderMap, rowNumber, item, input);
    if (item.status === 'success') {
      successCount += 1;
      setWorkflowStatus(worksheet, headerMap, rowNumber, completedStatusText);
      input.appendLog('info', `第 ${rowNumber} 行图片缓存完成：${item.localImagePath}`);
    } else {
      failedCount += 1;
      setWorkflowStatus(worksheet, headerMap, rowNumber, failedStatusText);
      input.appendLog(
        'warn',
        `第 ${rowNumber} 行处理失败：${item.errorMessage ?? item.status}。阶段：${getFailureStageForLog(item)}。${formatCandidateLinksForLog(item.candidates)}`,
      );
    }
  }

  throwIfAborted(input.signal);
  createCandidateSheet(workbook, items);
  createSkuMatchSheet(workbook, items);
  createRunSettingsSheet(workbook, input.settingsRows);
  restoreOriginalImageCells(context, rowNumbers);
  await fs.mkdir(path.dirname(input.outputExcelPath), { recursive: true });
  await workbook.xlsx.writeFile(input.outputExcelPath);
  await copyCellImagesPackage(input.inputExcelPath, input.outputExcelPath);
  if (input.syncResultToInputExcel && path.resolve(input.inputExcelPath) !== path.resolve(input.outputExcelPath)) {
    try {
      await fs.copyFile(input.outputExcelPath, input.inputExcelPath);
      input.appendLog('info', '本地输入 Excel 已同步状态、输出结果和本次执行配置。');
    } catch (error) {
      input.appendLog('warn', `本地输入 Excel 回写失败，请确认文件未被 Excel 占用：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    totalCount: items.length,
    successCount,
    failedCount,
    items,
  };
}

async function processInputRowWithRetry(
  input: ProcessExcelInput,
  context: RowProcessContext,
  rowNumber: number,
): Promise<RowProcessResult> {
  const maxAttempts = Math.max(1, Math.floor(input.retryCount) + 1);
  let latestResult: RowProcessResult | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    throwIfAborted(input.signal);
    if (attempt > 1) {
      input.appendLog('warn', `第 ${rowNumber} 行第 ${attempt}/${maxAttempts} 次重试开始。`);
    }

    latestResult = await processInputRow(input, context, rowNumber);
    if (latestResult.item.status === 'success') {
      if (attempt > 1) {
        input.appendLog('info', `第 ${rowNumber} 行重试成功。`);
      }
      return latestResult;
    }

    if (attempt < maxAttempts) {
      input.appendLog('warn', `第 ${rowNumber} 行本次失败：${latestResult.item.errorMessage ?? latestResult.item.status}，准备重试。`);
      await delay(1000 * attempt);
    }
  }

  return latestResult ?? await processInputRow(input, context, rowNumber);
}

export async function hasPendingLocalExcelRows(inputExcelPath: string) {
  const { worksheet, headerMap } = await readWorkbook(inputExcelPath);
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    if (isInputRowEmpty(worksheet, headerMap, row)) {
      break;
    }

    if (isPendingWorkflowStatus(getRowWorkflowStatus(row, headerMap))) {
      return true;
    }
  }

  return false;
}

async function processInputRow(
  input: ProcessExcelInput,
  context: RowProcessContext,
  rowNumber: number,
): Promise<RowProcessResult> {
    throwIfAborted(input.signal);
    const { workbook, worksheet, headerMap, cellImageStore, imageDir, imageColumn } = context;
    const row = worksheet.getRow(rowNumber);
    context.originalImageCells.set(
      rowNumber,
      getOriginalImageCellForRow(workbook, worksheet, row, headerMap, cellImageStore, imageColumn),
    );

    let sourceUrl = getCellUrlByHeader(row, headerMap, '原商品链接') || getCellByHeader(row, headerMap, '原商品链接');
    const zhengheDataUrl = getCellUrlByHeader(row, headerMap, '郑和数据链接') || getCellByHeader(row, headerMap, '郑和数据链接');
    const parsedSourceUrl = parseTikTokProductUrl(sourceUrl);
    const parsedZhengheUrl = parseZhengheProductReference(zhengheDataUrl);
    const existingProductId = getCellByHeader(row, headerMap, '原商品ID');
    const zhengheProductId = parsedZhengheUrl.productId;
    const zhengheIdentityConflict = Boolean(
      zhengheProductId &&
        ((existingProductId && existingProductId !== zhengheProductId) ||
          (parsedSourceUrl.productId && parsedSourceUrl.productId !== zhengheProductId)),
    );
    const productId = zhengheProductId || existingProductId || parsedSourceUrl.productId;
    let country = zhengheIdentityConflict
      ? parsedZhengheUrl.region || parsedSourceUrl.country || getCellByHeader(row, headerMap, '国家')
      : parsedZhengheUrl.region || parsedSourceUrl.country || getCellByHeader(row, headerMap, '国家');
    const sourceRegionConflicts = parsedSourceUrl.country && country && parsedSourceUrl.country.toLowerCase() !== country.toLowerCase();
    if ((!sourceUrl || sourceRegionConflicts || zhengheIdentityConflict) && productId && country) {
      sourceUrl = buildTikTokProductUrl(productId, country);
    }
    let imageUrl = getCellUrlByHeader(row, headerMap, '原商品主图URL');
    let title = getCellByHeader(row, headerMap, '商品标题');
    let category = getCellByHeader(row, headerMap, '类目');
    if (zhengheIdentityConflict) {
      imageUrl = '';
    }
    const shouldEnrichFromZhenghe = Boolean(zhengheDataUrl && (!imageUrl || !country || !sourceUrl || /zhenghedata\.com\/product\/search\/detail(?:-old)?/.test(zhengheDataUrl)));
    if (shouldEnrichFromZhenghe) {
      try {
        const zhengheData = await new ZhengheDataClient().fetchProductData({
          url: zhengheDataUrl,
          fallbackRegion: parsedZhengheUrl.region,
        });
        if (zhengheData.metrics.baseInfoTrusted) {
          country = zhengheData.region || zhengheData.metrics.region || country;
          sourceUrl = zhengheData.productUrl || (productId && country ? buildTikTokProductUrl(productId, country) : sourceUrl);
          imageUrl = zhengheData.metrics.mainImageUrl || imageUrl;
          title = zhengheData.metrics.productName || title;
          category = zhengheData.metrics.categoryFullName || category;
        }
        if ((!sourceUrl || sourceRegionConflicts || zhengheIdentityConflict) && productId && country) {
          sourceUrl = buildTikTokProductUrl(productId, country);
        }
      } catch (error) {
        input.appendLog('warn', `第 ${rowNumber} 行郑和数据补全失败：${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const item: ProductItem = {
      rowIndex: rowNumber,
      productId: productId || `ROW-${rowNumber}`,
      sourceUrl,
      zhengheDataUrl,
      imageUrl,
      sourceImageUrl: imageUrl,
      title,
      country,
      category,
      status: 'pending',
    };

    input.appendLog('info', `开始处理第 ${rowNumber} 行：${productId}`);

    try {
      if (!productId) {
        throw new Error('缺少原商品ID，且无法从郑和数据链接解析商品ID');
      }

      const cellImage =
        getCellImageByHeader(row, headerMap, '原商品主图URL', cellImageStore) ?? getOnlyCellImageForRow(row, cellImageStore);
      const embeddedImage = cellImage ?? getEmbeddedImageForRow(workbook, worksheet, rowNumber, imageColumn);
      if (embeddedImage) {
        const imagePath = path.join(imageDir, `${rowNumber}-${productId}.${embeddedImage.extension}`);
        await fs.writeFile(imagePath, embeddedImage.buffer);
        item.localImagePath = imagePath;
        item.imageUrl = imagePath;
        item.status = 'success';
      } else if (isSupportedImageUrl(imageUrl)) {
        const imagePath = path.join(imageDir, `${rowNumber}-${productId}.jpg`);
        await cacheImageFromUrl(imageUrl, imagePath);
        item.localImagePath = imagePath;
        item.imageUrl = imagePath;
        item.status = 'success';
      } else {
        item.status = 'missing_image';
        item.errorMessage = imageUrl
          ? `原商品主图URL 不是可下载图片地址：${imageUrl}`
          : '缺少内嵌图片和原商品主图URL';
      }

      if (item.status === 'success' && item.localImagePath && input.searchAdapter) {
        throwIfAborted(input.signal);
        input.appendLog('info', `第 ${rowNumber} 行开始搜图：${item.localImagePath}`);
        item.candidates = await input.searchAdapter.searchByImage({
          item,
          imagePath: item.localImagePath,
          candidateLimit: input.candidateLimit,
          acceptedCandidateLimit: input.acceptedCandidateLimit,
          enableRealFactoryFilter: input.enable1688RealFactoryFilter,
          enableStrengthFactoryFilter: input.enable1688StrengthFactoryFilter,
          signal: input.signal,
          appendLog: input.appendLog,
        });
        throwIfAborted(input.signal);
        input.appendLog('info', `第 ${rowNumber} 行搜图完成：${item.candidates.length} 个候选`);
        if (item.candidates.length === 0) {
          item.status = 'not_found';
          item.errorMessage = '未找到对应货源商品';
        }
      }

      if (item.status === 'success' && item.localImagePath && input.detailAdapter && item.candidates?.length) {
        throwIfAborted(input.signal);
        const originalImagePath = item.localImagePath;
        item.skuMatches = [];
        const qualifiedCandidates = await filterCandidatesByListSimilarity(
          item,
          originalImagePath,
          item.candidates,
          input.imageSimilarityService,
          input.acceptedCandidateLimit,
          input.sourcingMode,
          input.aiListBatchSize,
          input,
          input.appendLog,
          input.signal,
        );
        throwIfAborted(input.signal);

        item.skuMatches = await inspectQualifiedCandidatesUntilEnough(
          input,
          item,
          originalImagePath,
          qualifiedCandidates,
          `第 ${rowNumber} 行`,
        );

        if (qualifiedCandidates.length > 0 && getQualifiedMatches(item).length === 0) {
          item.status = 'failed';
          item.errorMessage = '相似度达标候选均未拿到可用 SKU 图片、价格或运费';
        }
      }
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }

      item.status = 'failed';
      item.errorMessage = error instanceof Error ? error.message : String(error);
    }

  return { item, rowNumber };
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException('任务已中断', 'AbortError');
  }
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}
