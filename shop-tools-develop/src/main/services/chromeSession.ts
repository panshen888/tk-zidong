import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { chromium, type Browser, type BrowserContext } from 'playwright-core';

export type AppChromeSessionOptions = {
  chromeExecutablePath: string;
  chromeUserDataDir: string;
  imageSearchUrl: string;
  extraLoginUrls?: string[];
  pageTimeoutMs: number;
  headless?: boolean;
  lowDisturbance?: boolean;
};

const bundledExtensionDirs = [
  path.join(process.env.APPDATA || '', 'tiktok-ai-flow', 'extensions', '1688-extension'),
].filter(Boolean);

const extensionCapableBrowserEnvKey = 'TIKTOK_AI_FLOW_EXTENSION_BROWSER';
const defaultChromeCdpUrl = 'http://127.0.0.1:9222';
const appChromeMarkerArg = '--tiktok-ai-flow-login-browser';
const execFileAsync = promisify(execFile);

let appChromeContextPromise: Promise<BrowserContext> | null = null;
let appChromeContextMode: 'login' | 'headed-task' | 'headless-task' | null = null;
const connectedContextBrowsers = new WeakMap<BrowserContext, Browser>();

export async function getOrCreateAppChromeContext(options: AppChromeSessionOptions) {
  const requestedMode = getSessionMode(options);
  if (appChromeContextPromise && appChromeContextMode !== requestedMode) {
    await closeAppChromeContext();
  }

  if (!appChromeContextPromise) {
    appChromeContextMode = requestedMode;
    appChromeContextPromise = launchAppChromeContext({
      ...options,
      headless: requestedMode === 'headless-task',
      lowDisturbance: requestedMode === 'headed-task',
    }).catch((error) => {
      appChromeContextPromise = null;
      appChromeContextMode = null;
      throw error;
    });
  }

  return appChromeContextPromise;
}

export async function openAppChromeLoginPage(options: AppChromeSessionOptions) {
  const context = await getOrCreateAppChromeContext({ ...options, headless: false, lowDisturbance: false });
  const urls = [options.imageSearchUrl, ...(options.extraLoginUrls ?? [])]
    .map((url) => url.trim())
    .filter(Boolean);
  for (const url of [...new Set(urls)]) {
    const page = await context.newPage();
    page.setDefaultTimeout(options.pageTimeoutMs);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
  }
}

export async function waitForChromeCdp(chromeCdpUrl: string, timeoutMs = 30000) {
  const startedAt = Date.now();
  let lastError = '';

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(new URL('/json/version', chromeCdpUrl), { signal: AbortSignal.timeout(3000) });
      if (response.ok) {
        return;
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await new Promise((resolve) => setTimeout(resolve, 800));
  }

  throw new Error(`Chrome 调试端口未就绪：${chromeCdpUrl}。${lastError ? `最后错误：${lastError}` : ''}`);
}

export async function assertAppChromeCdpOwnership(options: {
  chromeCdpUrl?: string;
  chromeUserDataDir: string;
}) {
  const chromeCdpUrl = options.chromeCdpUrl || defaultChromeCdpUrl;
  await waitForChromeCdp(chromeCdpUrl, 5000);

  if (process.platform !== 'win32') {
    return;
  }

  const port = getCdpPort(chromeCdpUrl);
  const commandLines = await getWindowsCdpProcessCommandLines(port);
  if (commandLines.length === 0) {
    return;
  }

  const expectedUserDataDirs = getExpectedUserDataDirCandidates(options.chromeUserDataDir);
  const matched = commandLines.some((commandLine) => {
    if (commandLine.includes(appChromeMarkerArg)) {
      return true;
    }
    const userDataDir = extractUserDataDirFromCommandLine(commandLine);
    return Boolean(userDataDir && expectedUserDataDirs.some((expected) => isSamePath(expected, userDataDir)));
  });

  if (!matched) {
    throw new Error(
      [
        '当前 9222 端口不是软件自己的登录浏览器，请关闭其他调试浏览器后点击软件里的“打开登录浏览器”。',
        `检测到的调试端口：${chromeCdpUrl}`,
      ].join('\n'),
    );
  }
}

export async function assertChromeCdpPortAvailableOrAppOwned(options: {
  chromeCdpUrl?: string;
  chromeUserDataDir: string;
}) {
  const chromeCdpUrl = options.chromeCdpUrl || defaultChromeCdpUrl;
  try {
    await waitForChromeCdp(chromeCdpUrl, 800);
  } catch {
    return;
  }
  await assertAppChromeCdpOwnership({ ...options, chromeCdpUrl });
}

export async function closeAppChromeContext() {
  const contextPromise = appChromeContextPromise;
  appChromeContextPromise = null;
  appChromeContextMode = null;
  if (!contextPromise) {
    return;
  }

  const context = await contextPromise.catch(() => null);
  if (!context) {
    return;
  }

  const connectedBrowser = connectedContextBrowsers.get(context);
  if (connectedBrowser) {
    disconnectCdpBrowser(connectedBrowser);
    connectedContextBrowsers.delete(context);
    return;
  }

  await context.close().catch(() => undefined);
}

async function launchAppChromeContext(options: AppChromeSessionOptions) {
  if (!options.chromeExecutablePath) {
    throw new Error('未找到 Chrome 可执行程序。请先在 AI比价配置中点击“选择 Chrome 可执行程序”。');
  }

  if (!options.chromeUserDataDir) {
    throw new Error('应用独立 Chrome 缺少内部用户数据目录。');
  }

  await fs.mkdir(options.chromeUserDataDir, { recursive: true });
  const extensionDirs = options.headless ? [] : await getExistingExtensionDirs();
  const browserExecutablePath = await resolveBrowserExecutablePath(options.chromeExecutablePath, extensionDirs);
  const userDataDir = resolveUserDataDir(options.chromeUserDataDir, options.chromeExecutablePath, browserExecutablePath, extensionDirs);
  await fs.mkdir(userDataDir, { recursive: true });

  const existingContext = await tryConnectExistingAppChromeContext(userDataDir, options.pageTimeoutMs);
  if (existingContext) {
    return existingContext;
  }

  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath: browserExecutablePath,
    headless: options.headless ?? false,
    viewport: options.headless ? undefined : null,
    ignoreDefaultArgs: extensionDirs.length > 0 ? ['--disable-extensions'] : undefined,
    args: getChromeArgs(options.headless ?? false, options.lowDisturbance ?? false, extensionDirs),
  });
  context.setDefaultTimeout(options.pageTimeoutMs);
  context.on('close', () => {
    appChromeContextPromise = null;
    appChromeContextMode = null;
  });

  return context;
}

async function tryConnectExistingAppChromeContext(chromeUserDataDir: string, pageTimeoutMs: number) {
  try {
    await assertAppChromeCdpOwnership({
      chromeCdpUrl: defaultChromeCdpUrl,
      chromeUserDataDir,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('Chrome 调试端口未就绪')) {
      return null;
    }
    throw error;
  }

  const browser = await chromium.connectOverCDP(defaultChromeCdpUrl);
  const context = browser.contexts()[0] ?? await browser.newContext();
  context.setDefaultTimeout(pageTimeoutMs);
  connectedContextBrowsers.set(context, browser);
  browser.on('disconnected', () => {
    appChromeContextPromise = null;
    appChromeContextMode = null;
    connectedContextBrowsers.delete(context);
  });
  return context;
}

function getSessionMode(options: AppChromeSessionOptions) {
  if (options.headless) {
    return 'headless-task';
  }

  return options.lowDisturbance ? 'headed-task' : 'login';
}

function getChromeArgs(headless: boolean, lowDisturbance: boolean, extensionDirs: string[]) {
  const args = [
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--remote-debugging-port=9222',
    appChromeMarkerArg,
  ];

  if (extensionDirs.length > 0) {
    const extensionList = extensionDirs.join(',');
    args.push(`--disable-extensions-except=${extensionList}`, `--load-extension=${extensionList}`);
  }

  if (!headless && lowDisturbance) {
    args.push('--start-minimized', '--window-size=1280,900');
  }

  if (!headless && !lowDisturbance) {
    args.push('--start-maximized');
  }

  return args;
}

async function getExistingExtensionDirs() {
  const existing: string[] = [];
  for (const extensionDir of bundledExtensionDirs) {
    try {
      const manifestPath = path.join(extensionDir, 'manifest.json');
      await fs.access(manifestPath);
      existing.push(extensionDir);
    } catch {
      // Extension package is optional. The app can still run without it.
    }
  }
  return existing;
}

async function resolveBrowserExecutablePath(configuredPath: string, extensionDirs: string[]) {
  if (extensionDirs.length === 0) {
    return configuredPath;
  }

  return await findExtensionCapableBrowserExecutable() ?? configuredPath;
}

function resolveUserDataDir(
  configuredUserDataDir: string,
  configuredExecutablePath: string,
  actualExecutablePath: string,
  extensionDirs: string[],
) {
  if (extensionDirs.length === 0 || isSamePath(configuredExecutablePath, actualExecutablePath)) {
    return configuredUserDataDir;
  }

  return `${configuredUserDataDir}-with-extensions`;
}

async function findExtensionCapableBrowserExecutable() {
  const candidates = [
    process.env[extensionCapableBrowserEnvKey],
    ...await getExtensionCapableBrowserCandidates(),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try next candidate.
    }
  }

  return null;
}

async function getExtensionCapableBrowserCandidates() {
  if (process.platform !== 'win32') {
    return [];
  }

  const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local');
  const programFiles = process.env.PROGRAMFILES ?? 'C:\\Program Files';
  const playwrightRoot = path.join(localAppData, 'ms-playwright');
  const playwrightChromiumCandidates: string[] = [];
  try {
    const entries = await fs.readdir(playwrightRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith('chromium-')) {
        playwrightChromiumCandidates.push(path.join(playwrightRoot, entry.name, 'chrome-win', 'chrome.exe'));
      }
    }
  } catch {
    // Playwright browser binaries are optional in packaged installs.
  }

  return [
    ...playwrightChromiumCandidates.sort().reverse(),
    path.join(programFiles, 'Google', 'Chrome for Testing', 'Application', 'chrome.exe'),
    path.join(programFiles, 'Chrome for Testing', 'chrome.exe'),
    path.join(programFiles, 'Chromium', 'Application', 'chrome.exe'),
  ];
}

function isSamePath(left: string, right: string) {
  return path.normalize(left).toLowerCase() === path.normalize(right).toLowerCase();
}

function disconnectCdpBrowser(browser: Browser) {
  const maybeDisconnect = (browser as unknown as { disconnect?: () => void }).disconnect;
  if (typeof maybeDisconnect === 'function') {
    maybeDisconnect.call(browser);
    return;
  }
  void browser.close({ reason: 'app chrome context closed' }).catch(() => undefined);
}

function getCdpPort(chromeCdpUrl: string) {
  try {
    const parsed = new URL(chromeCdpUrl);
    return parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
  } catch {
    return '9222';
  }
}

async function getWindowsCdpProcessCommandLines(port: string) {
  const escapedPort = port.replace(/'/g, "''");
  const script = [
    '$ErrorActionPreference = "SilentlyContinue"',
    'Get-CimInstance Win32_Process |',
    `Where-Object { $_.CommandLine -match '--remote-debugging-port(=|\\s+)${escapedPort}(\\s|$)' } |`,
    'Select-Object -ExpandProperty CommandLine |',
    'ConvertTo-Json -Compress',
  ].join(' ');

  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { timeout: 5000, windowsHide: true },
    );
    const text = stdout.trim();
    if (!text) {
      return [];
    }
    const parsed = JSON.parse(text) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map(String).filter(Boolean);
    }
    return [String(parsed)].filter(Boolean);
  } catch {
    return [];
  }
}

function getExpectedUserDataDirCandidates(chromeUserDataDir: string) {
  const trimmed = chromeUserDataDir.trim();
  if (!trimmed) {
    return [];
  }
  const withoutExtensionSuffix = trimmed.endsWith('-with-extensions')
    ? trimmed.slice(0, -'-with-extensions'.length)
    : '';
  return [...new Set([
    trimmed,
    `${trimmed}-with-extensions`,
    withoutExtensionSuffix,
    withoutExtensionSuffix ? `${withoutExtensionSuffix}-with-extensions` : '',
  ].filter(Boolean).map((value) => path.normalize(value)))];
}

function extractUserDataDirFromCommandLine(commandLine: string) {
  const match = commandLine.match(/"?--user-data-dir=(?:"([^"]+)"|(.+?))(?=\s--|$)/i);
  const value = (match?.[1] ?? match?.[2] ?? '').trim().replace(/^"|"$/g, '');
  return value || '';
}
