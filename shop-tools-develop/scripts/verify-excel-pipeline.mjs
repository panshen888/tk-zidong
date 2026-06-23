import fs from 'node:fs/promises';
import path from 'node:path';
import {
  createMockDetailPageAdapter,
  createMockImageSearchAdapter,
  processExcelTask,
} from '../dist/tools/excelService.js';

const inputExcelPath = path.join(process.cwd(), 'mock-data', 'mock-selection.xlsx');
const assetDir = path.join(process.cwd(), 'mock-data', 'task-assets');
const outputExcelPath = path.join(assetDir, 'output', 'result.xlsx');
const logs = [];

await fs.rm(assetDir, { recursive: true, force: true });
await fs.mkdir(path.join(assetDir, 'logs'), { recursive: true });

const result = await processExcelTask({
  taskId: 'verify-task',
  inputExcelPath,
  assetDir,
  outputExcelPath,
  candidateLimit: 50,
  acceptedCandidateLimit: 10,
  excelRowConcurrency: 3,
  detailPageConcurrency: 3,
  searchAdapter: createMockImageSearchAdapter(),
  detailAdapter: createMockDetailPageAdapter(),
  appendLog: (level, message) => logs.push({ level, message }),
});

await fs.writeFile(path.join(assetDir, 'logs', 'verify.json'), JSON.stringify({ result, logs }, null, 2));

console.log(JSON.stringify({ result, outputExcelPath, logs }, null, 2));
