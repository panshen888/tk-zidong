const path = require('node:path');
const ExcelJS = require('exceljs');

const inputExcelPath = path.join(process.cwd(), 'mock-data', 'mock-selection.xlsx');
const outputExcelPath = path.join(process.cwd(), 'mock-data', 'task-assets', 'output', 'result.xlsx');

function getHeaderMap(sheet) {
  const headers = new Map();
  sheet.getRow(1).eachCell((cell, columnNumber) => {
    headers.set(String(cell.value), columnNumber);
  });
  return headers;
}

function getCell(sheet, headers, rowNumber, header) {
  const column = headers.get(header);
  return column ? sheet.getRow(rowNumber).getCell(column).value : undefined;
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} 期望 ${expected}，实际 ${actual}`);
  }
}

function assertBlank(actual, label) {
  if (actual !== undefined && actual !== null && actual !== '') {
    throw new Error(`${label} 期望为空，实际 ${actual}`);
  }
}

function normalizeCellValue(value) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'object') {
    const normalized = {};
    for (const key of Object.keys(value).sort()) {
      const entry = value[key];
      if (typeof entry === 'function') {
        continue;
      }

      if (Array.isArray(entry)) {
        normalized[key] = entry.map((item) => normalizeCellValue(item));
        continue;
      }

      normalized[key] = normalizeCellValue(entry);
    }
    return normalized;
  }

  return String(value);
}

function assertCellSame(actual, expected, label) {
  const actualNormalized = normalizeCellValue(actual);
  const expectedNormalized = normalizeCellValue(expected);
  if (JSON.stringify(actualNormalized) !== JSON.stringify(expectedNormalized)) {
    throw new Error(
      `${label} 期望与原 Excel 保持一致，实际 ${JSON.stringify(actualNormalized)}，原值 ${JSON.stringify(expectedNormalized)}`,
    );
  }
}

async function main() {
  const inputWorkbook = new ExcelJS.Workbook();
  const workbook = new ExcelJS.Workbook();
  await inputWorkbook.xlsx.readFile(inputExcelPath);
  await workbook.xlsx.readFile(outputExcelPath);

  const inputSelectionSheet = inputWorkbook.getWorksheet('选品表');
  const selectionSheet = workbook.getWorksheet('选品表');
  const candidateSheet = workbook.getWorksheet('1688候选供应商');
  const skuMatchSheet = workbook.getWorksheet('SKU匹配结果');
  if (!inputSelectionSheet || !selectionSheet || !candidateSheet || !skuMatchSheet) {
    throw new Error('输出 Excel 缺少必要 Sheet');
  }

  const inputHeaders = getHeaderMap(inputSelectionSheet);
  const headers = getHeaderMap(selectionSheet);
  const summary = {
    row2Status: getCell(selectionSheet, headers, 2, '搜图状态'),
    row2ImageUrl: getCell(selectionSheet, headers, 2, '原商品主图URL'),
    row2LocalImagePath: getCell(selectionSheet, headers, 2, '原商品主图本地路径'),
    row2CandidateCount: getCell(selectionSheet, headers, 2, '1688候选数'),
    row2Offer1: getCell(selectionSheet, headers, 2, '推荐1688链接1'),
    row2MatchedSku: getCell(selectionSheet, headers, 2, '匹配SKU'),
    row2PurchaseCost: getCell(selectionSheet, headers, 2, '采购成本价'),
    row2ShippingFee: getCell(selectionSheet, headers, 2, '运费'),
    row3Status: getCell(selectionSheet, headers, 3, '搜图状态'),
    row3ImageUrl: getCell(selectionSheet, headers, 3, '原商品主图URL'),
    row3LocalImagePath: getCell(selectionSheet, headers, 3, '原商品主图本地路径'),
    row3CandidateCount: getCell(selectionSheet, headers, 3, '1688候选数'),
    row4Status: getCell(selectionSheet, headers, 4, '搜图状态'),
    row4ImageUrl: getCell(selectionSheet, headers, 4, '原商品主图URL'),
    row4LocalImagePath: getCell(selectionSheet, headers, 4, '原商品主图本地路径'),
    row5Status: getCell(selectionSheet, headers, 5, '搜图状态'),
    row5ImageUrl: getCell(selectionSheet, headers, 5, '原商品主图URL'),
    row5LocalImagePath: getCell(selectionSheet, headers, 5, '原商品主图本地路径'),
    row6Status: getCell(selectionSheet, headers, 6, '搜图状态'),
    row6ImageUrl: getCell(selectionSheet, headers, 6, '原商品主图URL'),
    row6LocalImagePath: getCell(selectionSheet, headers, 6, '原商品主图本地路径'),
    row8Status: getCell(selectionSheet, headers, 8, '搜图状态'),
    top3Rows: candidateSheet.rowCount - 1,
    bestRows: skuMatchSheet.rowCount - 1,
    firstTop3Rank: candidateSheet.getRow(2).getCell(2).value,
    firstTop3Cost: candidateSheet.getRow(2).getCell(10).value,
    firstBestCost: skuMatchSheet.getRow(2).getCell(11).value,
  };

  assertEqual(summary.row2Status, '成功', '第 2 行 URL 主图');
  assertEqual(summary.row3Status, '成功', '第 3 行内嵌图片');
  assertEqual(summary.row4Status, '成功', '第 4 行单元格图片主图');
  assertEqual(summary.row5Status, '成功', '第 5 行超链接对象主图');
  assertEqual(summary.row6Status, '成功', '第 6 行主图列图片');
  for (const [label, value] of [
    ['第 2 行主图本地路径', summary.row2LocalImagePath],
    ['第 3 行主图本地路径', summary.row3LocalImagePath],
    ['第 4 行主图本地路径', summary.row4LocalImagePath],
    ['第 5 行主图本地路径', summary.row5LocalImagePath],
    ['第 6 行主图本地路径', summary.row6LocalImagePath],
  ]) {
    if (typeof value !== 'string' || !value.includes('mock-data/task-assets/images/')) {
      throw new Error(`${label} 期望写入缓存图片路径，实际 ${value}`);
    }
  }
  assertCellSame(summary.row2ImageUrl, getCell(inputSelectionSheet, inputHeaders, 2, '原商品主图URL'), '第 2 行主图列');
  assertCellSame(summary.row3ImageUrl, getCell(inputSelectionSheet, inputHeaders, 3, '原商品主图URL'), '第 3 行主图列');
  assertCellSame(summary.row4ImageUrl, getCell(inputSelectionSheet, inputHeaders, 4, '原商品主图URL'), '第 4 行主图列');
  assertCellSame(summary.row5ImageUrl, getCell(inputSelectionSheet, inputHeaders, 5, '原商品主图URL'), '第 5 行主图列');
  assertCellSame(summary.row6ImageUrl, getCell(inputSelectionSheet, inputHeaders, 6, '原商品主图URL'), '第 6 行主图列');
  assertBlank(summary.row8Status, '空行后的第 8 行不应被处理');
  assertEqual(summary.row2CandidateCount, 50, '第 2 行候选数量');
  assertEqual(summary.row3CandidateCount, 50, '第 3 行候选数量');
  assertEqual(summary.top3Rows, 15, '1688候选供应商 Sheet Top3 低价结果行数');
  assertEqual(summary.bestRows, 5, 'SKU匹配结果 Sheet 最优结果行数');
  assertEqual(summary.firstTop3Rank, 1, 'Top3 Sheet 第一行排名');
  assertEqual(summary.firstTop3Cost, summary.firstBestCost, 'Top3 第一名与最优结果成本一致');

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
