const fs = require('node:fs/promises');
const path = require('node:path');
const ExcelJS = require('exceljs');

const outputDir = path.join(process.cwd(), 'mock-data');
const outputPath = path.join(outputDir, 'mock-selection.xlsx');

const pngBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAXUlEQVR4nO3PQQ0AIBDAMMC/5+ONAvZoFSzZnTPgndk9wJ8GtA1oG9A2oG1A24C2AW0D2ga0DWgb0DagbUDbgLYBbQPaBrQNaBvQNqBtQNuAtgFtA9oGtA1oG9A2MNEDgQABWpKVuQAAAABJRU5ErkJggg==';
const pngDataUrl = `data:image/png;base64,${pngBase64}`;

async function main() {
  await fs.mkdir(outputDir, { recursive: true });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('选品表');

  sheet.columns = [
    { header: '原商品ID', key: 'productId', width: 16 },
    { header: '原商品链接', key: 'sourceUrl', width: 34 },
    { header: '原商品主图URL', key: 'imageUrl', width: 42 },
    { header: '商品标题', key: 'title', width: 28 },
    { header: '国家', key: 'country', width: 12 },
    { header: '类目', key: 'category', width: 16 },
  ];

  sheet.addRow({
    productId: 'MOCK-URL-001',
    sourceUrl: 'https://example.com/products/001',
    imageUrl: pngDataUrl,
    title: 'URL 主图测试商品',
    country: 'US',
    category: 'Kitchen',
  });

  sheet.addRow({
    productId: 'MOCK-EMBED-002',
    sourceUrl: 'https://example.com/products/002',
    imageUrl: '',
    title: '内嵌图片测试商品',
    country: 'TH',
    category: 'Beauty',
  });

  sheet.addRow({
    productId: 'MOCK-MISSING-003',
    sourceUrl: 'https://example.com/products/003',
    imageUrl: '',
    title: '缺少图片测试商品',
    country: 'MY',
    category: 'Home',
  });

  sheet.addRow({
    productId: 'MOCK-HYPERLINK-004',
    sourceUrl: 'https://example.com/products/004',
    imageUrl: {
      text: '点击查看主图',
      hyperlink: pngDataUrl,
    },
    title: '超链接对象主图测试商品',
    country: 'VN',
    category: 'Pets',
  });

  sheet.addRow({
    productId: 'MOCK-IMAGE-CELL-005',
    sourceUrl: 'https://example.com/products/005',
    imageUrl: '',
    title: '主图列图片测试商品',
    country: 'PH',
    category: 'Tools',
  });

  sheet.addRow({});

  sheet.addRow({
    productId: 'MOCK-AFTER-EMPTY-006',
    sourceUrl: 'https://example.com/products/006',
    imageUrl: pngDataUrl,
    title: '空行后的商品不应被读取',
    country: 'ID',
    category: 'Ignored',
  });

  const imageId = workbook.addImage({
    base64: pngBase64,
    extension: 'png',
  });
  sheet.addImage(imageId, {
    tl: { col: 2, row: 2 },
    ext: { width: 72, height: 72 },
  });

  const imageCellId = workbook.addImage({
    base64: pngBase64,
    extension: 'png',
  });
  sheet.addImage(imageCellId, {
    tl: { col: 2, row: 5 },
    ext: { width: 72, height: 72 },
  });
  sheet.getRow(3).height = 58;
  sheet.getRow(6).height = 58;

  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1F1A14' },
  };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  await workbook.xlsx.writeFile(outputPath);
  console.log(outputPath);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
