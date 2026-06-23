import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import {
  generateLocalPriceComparisonReviewTable,
  writeLocalThreeTableTemplate,
} from '../dist/tools/excelService.js';

const tableNames = {
  input: '\u8f93\u5165\u8868',
  output: '\u8f93\u51fa\u8d27\u6e90\u8868',
  review: '\u5f85\u4eba\u5de5\u6838\u5b9e\u4e0a\u67b6\u8868',
};

const headers = {
  productId: '\u5546\u54c1ID',
  groupStatus: '\u5546\u54c1\u7ec4\u72b6\u6001',
  candidateStatus: '\u5019\u9009\u72b6\u6001',
  purchaseCost: '\u91c7\u8d2d\u603b\u6210\u672c',
  weightGram: '\u514b\u91cd',
  dimensions: '\u5c3a\u5bf8',
  manualSelected: '\u4eba\u5de5\u6307\u5b9a\u4e0a\u67b6\u8d27\u6e90',
  site: '\u56fd\u5bb6/\u7ad9\u70b9',
  batchId: '\u6bd4\u4ef7\u6279\u6b21\u53f7',
  inputRecordId: '\u8f93\u5165\u8868\u8bb0\u5f55ID',
  candidateRank: '\u5019\u9009\u5e8f\u53f7',
  offerUrl: '1688\u94fe\u63a5',
  offerId: 'offerId',
  skuName: 'SKU\u540d\u79f0',
  skuImageUrl: 'SKU\u56fe\u7247URL',
  itemPrice: '\u91c7\u8d2d\u4ef7',
  shippingFee: '\u8fd0\u8d39',
  supplier: '\u4f9b\u5e94\u5546',
  minimumOrderQuantity: '\u8d77\u6279\u91cf',
  riskNote: '\u98ce\u9669\u5907\u6ce8',
  status: '\u72b6\u6001',
  reviewOfferUrl: '\u63a8\u83501688\u94fe\u63a5',
  selectionReason: '\u9009\u62e9\u4f9d\u636e',
  failureReason: '\u5931\u8d25\u5f52\u56e0',
};

const values = {
  verified: '\u5df2\u6838\u5b9e',
  pendingReview: '\u5f85\u6838\u5b9e',
  failed: '\u5931\u8d25',
  success: '\u6210\u529f',
  manualSelectedReason: '\u4eba\u5de5\u6307\u5b9a\u5019\u9009',
  multipleManualReason: '\u4eba\u5de5\u6307\u5b9a\u591a\u6761\u5019\u9009',
  missingWeightReason: '\u5019\u9009\u5747\u7f3a\u514b\u91cd',
  majorityReasonPrefix: '\u514b\u91cd\u591a\u6570\u51b3\u7b56',
};

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tiktok-price-three-table-'));
try {
  await verifyWeightMajority();
  await verifyManualOverride();
  await verifyMultipleManualFailure();
  await verifyMissingWeightFailure();
  await verifyMinimumOrderReferenceOnly();
  console.log('Price three-table local review verification passed.');
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function verifyWeightMajority() {
  const workbookPath = await createWorkbook('weight-majority');
  await fillOutputRows(workbookPath, [
    candidate({ offerId: '1', offerUrl: 'https://detail.1688.com/offer/1.html', itemPrice: 10, shippingFee: 2, purchaseCost: 12, weightGram: 180 }),
    candidate({ offerId: '2', offerUrl: 'https://detail.1688.com/offer/2.html', itemPrice: 10, shippingFee: 2, purchaseCost: 12, weightGram: 180 }),
    candidate({ offerId: '3', offerUrl: 'https://detail.1688.com/offer/3.html', itemPrice: 20, shippingFee: 2, purchaseCost: 22, weightGram: 280 }),
  ]);

  const result = await generateLocalPriceComparisonReviewTable({ workbookPath, weightToleranceGram: 5 });
  const row = await readReviewRow(workbookPath);

  assert.equal(result.scannedGroupCount, 1);
  assert.equal(result.generatedCount, 1);
  assert.equal(result.failedCount, 0);
  assert.equal(row[headers.status], values.pendingReview);
  assert.equal(row[headers.reviewOfferUrl], 'https://detail.1688.com/offer/1.html');
  assert.equal(row[headers.weightGram], 180);
  assert.match(String(row[headers.selectionReason]), new RegExp(values.majorityReasonPrefix));
}

async function verifyManualOverride() {
  const workbookPath = await createWorkbook('manual-override');
  await fillOutputRows(workbookPath, [
    candidate({ offerId: '1', offerUrl: 'https://detail.1688.com/offer/1.html', itemPrice: 10, shippingFee: 2, purchaseCost: 12, weightGram: 180 }),
    candidate({ offerId: '2', offerUrl: 'https://detail.1688.com/offer/2.html', itemPrice: 15, shippingFee: 2, purchaseCost: 17, weightGram: 280, manuallySelected: true }),
  ]);

  const result = await generateLocalPriceComparisonReviewTable({ workbookPath, weightToleranceGram: 5 });
  const row = await readReviewRow(workbookPath);

  assert.equal(result.generatedCount, 1);
  assert.equal(row[headers.status], values.pendingReview);
  assert.equal(row[headers.reviewOfferUrl], 'https://detail.1688.com/offer/2.html');
  assert.equal(row[headers.selectionReason], values.manualSelectedReason);
}

async function verifyMultipleManualFailure() {
  const workbookPath = await createWorkbook('multiple-manual');
  await fillOutputRows(workbookPath, [
    candidate({ offerId: '1', offerUrl: 'https://detail.1688.com/offer/1.html', itemPrice: 10, shippingFee: 2, purchaseCost: 12, weightGram: 180, manuallySelected: true }),
    candidate({ offerId: '2', offerUrl: 'https://detail.1688.com/offer/2.html', itemPrice: 15, shippingFee: 2, purchaseCost: 17, weightGram: 280, manuallySelected: true }),
  ]);

  const result = await generateLocalPriceComparisonReviewTable({ workbookPath, weightToleranceGram: 5 });
  const row = await readReviewRow(workbookPath);

  assert.equal(result.generatedCount, 0);
  assert.equal(result.failedCount, 1);
  assert.equal(row[headers.status], values.failed);
  assert.equal(row[headers.failureReason], values.multipleManualReason);
}

async function verifyMissingWeightFailure() {
  const workbookPath = await createWorkbook('missing-weight');
  await fillOutputRows(workbookPath, [
    candidate({ offerId: '1', offerUrl: 'https://detail.1688.com/offer/1.html', itemPrice: 10, shippingFee: 2, purchaseCost: 12, weightGram: '' }),
  ]);

  const result = await generateLocalPriceComparisonReviewTable({ workbookPath, weightToleranceGram: 5 });
  const row = await readReviewRow(workbookPath);

  assert.equal(result.generatedCount, 0);
  assert.equal(result.failedCount, 1);
  assert.equal(row[headers.status], values.failed);
  assert.equal(row[headers.failureReason], values.missingWeightReason);
}

async function verifyMinimumOrderReferenceOnly() {
  const workbookPath = await createWorkbook('minimum-order-reference');
  await fillOutputRows(workbookPath, [
    candidate({
      offerId: '1',
      offerUrl: 'https://detail.1688.com/offer/1.html',
      itemPrice: 10,
      shippingFee: 2,
      purchaseCost: 12,
      weightGram: 180,
      minimumOrderQuantity: 3000,
    }),
  ]);

  const result = await generateLocalPriceComparisonReviewTable({ workbookPath, weightToleranceGram: 5 });
  const row = await readReviewRow(workbookPath);

  assert.equal(result.generatedCount, 1);
  assert.equal(result.failedCount, 0);
  assert.equal(row[headers.status], values.pendingReview);
  assert.equal(row[headers.minimumOrderQuantity], 3000);
  assert.equal(row[headers.failureReason], '');
}

async function createWorkbook(name) {
  const workbookPath = path.join(tempDir, `${name}.xlsx`);
  await writeLocalThreeTableTemplate(workbookPath);
  return workbookPath;
}

async function fillOutputRows(workbookPath, rows) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(workbookPath);
  const worksheet = workbook.getWorksheet(tableNames.output);
  assert.ok(worksheet, 'missing output worksheet');
  const headerMap = buildHeaderMap(worksheet);

  rows.forEach((rowValues) => {
    const row = worksheet.addRow([]);
    Object.entries(rowValues).forEach(([header, value]) => {
      const column = headerMap.get(header);
      assert.ok(column, `missing output header: ${header}`);
      row.getCell(column).value = value;
    });
  });

  await workbook.xlsx.writeFile(workbookPath);
}

async function readReviewRow(workbookPath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(workbookPath);
  const worksheet = workbook.getWorksheet(tableNames.review);
  assert.ok(worksheet, 'missing review worksheet');
  const headerMap = buildHeaderMap(worksheet);
  const row = worksheet.getRow(2);
  return Object.fromEntries([...headerMap.entries()].map(([header, column]) => [header, normalizeCellValue(row.getCell(column).value)]));
}

function candidate(input) {
  return {
    [headers.productId]: '1732014702900643160',
    [headers.groupStatus]: values.verified,
    [headers.candidateStatus]: values.success,
    [headers.purchaseCost]: input.purchaseCost,
    [headers.weightGram]: input.weightGram,
    [headers.dimensions]: '10x10x5cm',
    [headers.manualSelected]: input.manuallySelected ? true : '',
    [headers.site]: 'my',
    [headers.batchId]: 'cmp_20260612_120000_test',
    [headers.inputRecordId]: 'local-input-2',
    [headers.candidateRank]: Number(input.offerId),
    [headers.offerUrl]: input.offerUrl,
    [headers.offerId]: input.offerId,
    [headers.skuName]: 'black',
    [headers.skuImageUrl]: `https://example.com/sku${input.offerId}.jpg`,
    [headers.itemPrice]: input.itemPrice,
    [headers.shippingFee]: input.shippingFee,
    [headers.supplier]: `supplier-${input.offerId}`,
    [headers.minimumOrderQuantity]: input.minimumOrderQuantity ?? 1,
    [headers.riskNote]: '',
  };
}

function buildHeaderMap(worksheet) {
  const headerMap = new Map();
  worksheet.getRow(1).eachCell((cell, column) => {
    const value = normalizeCellValue(cell.value);
    if (value) {
      headerMap.set(value, column);
    }
  });
  return headerMap;
}

function normalizeCellValue(value) {
  if (value == null) return '';
  if (typeof value === 'object' && 'text' in value) return String(value.text ?? '').trim();
  if (typeof value === 'object' && 'result' in value) return normalizeCellValue(value.result);
  return value;
}
