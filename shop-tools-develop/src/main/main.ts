import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow } from 'electron';
import { registerIpcHandlers } from './services/ipc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const preloadPath = path.join(__dirname, '../preload/preload.js');
const rendererIndexPath = path.join(__dirname, '../renderer/index.html');

let mainWindow: BrowserWindow | null = null;

async function loadRenderer(window: BrowserWindow) {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (!devServerUrl) {
    await window.loadFile(rendererIndexPath);
    return;
  }

  try {
    await window.loadURL(devServerUrl);
    window.webContents.openDevTools({ mode: 'detach' });
  } catch (error) {
    console.warn(`Failed to load dev server ${devServerUrl}; falling back to built renderer.`, error);
    await window.loadFile(rendererIndexPath);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1080,
    minHeight: 720,
    title: 'TikTok AI Flow',
    backgroundColor: '#f4efe6',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  void loadRenderer(mainWindow);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
