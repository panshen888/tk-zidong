import { createReal1688ImageSearchAdapter } from '../dist/tools/excelService.js';

const imagePath = process.argv[2];
const imageSearchUrl = process.argv[3] ?? 'https://www.1688.com/';

if (!imagePath) {
  console.error('Usage: npm run probe:1688 -- <imagePath> [imageSearchUrl]');
  process.exit(1);
}

const adapter = createReal1688ImageSearchAdapter({
  chromeMode: 'connect',
  chromeCdpUrl: process.env.CHROME_CDP_URL ?? 'http://127.0.0.1:9222',
  chromeExecutablePath: '',
  chromeUserDataDir: '',
  imageSearchUrl,
  pageTimeoutMs: 30000,
});

const candidates = await adapter.searchByImage({
  item: {
    rowIndex: 1,
    productId: 'PROBE',
    title: 'Probe 商品',
    status: 'success',
    localImagePath: imagePath,
  },
  imagePath,
  candidateLimit: 50,
});

console.log(JSON.stringify(candidates, null, 2));
