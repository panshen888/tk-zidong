import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { writeLocalThreeTableTemplate } from '../src/main/services/excelService';
import type { AppSettings } from '../src/shared/types';

type StoreShape = {
  settings?: Partial<AppSettings>;
};

async function main() {
  const explicitPath = process.argv[2]?.trim();
  const outputExcelPath = explicitPath || await buildDefaultOutputPath();
  await writeLocalThreeTableTemplate(outputExcelPath);
  console.log(JSON.stringify({ outputExcelPath }, null, 2));
}

async function buildDefaultOutputPath() {
  const configPath = path.join(
    process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
    'tiktok-ai-flow',
    'config.json',
  );
  let outputDir = path.join(os.homedir(), 'Documents', 'TikTok AI Flow', 'outputs');
  try {
    const store = JSON.parse(await fs.readFile(configPath, 'utf8')) as StoreShape;
    outputDir = store.settings?.defaultOutputDir || outputDir;
  } catch {
    // Use the default output directory when the app config has not been created yet.
  }

  return path.join(outputDir, `ai-price-three-table-template-${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
