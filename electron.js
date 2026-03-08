import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from 'electron-updater';
import { startDownload, fetchGalleryLinks } from './downloader.js';
const { autoUpdater } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV === 'development';

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    icon: isDev ? path.join(__dirname, 'public', 'icon.png') : path.join(__dirname, 'dist', 'icon.png'),
    autoHideMenuBar: true,
  });

  if (isDev) {
    win.loadURL('http://localhost:3000');
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  // Auto Updater Events
  autoUpdater.on('update-available', () => {
    win.webContents.send('update_available');
  });
  autoUpdater.on('update-not-available', () => {
    win.webContents.send('update_not_available');
  });
  autoUpdater.on('update-downloaded', () => {
    win.webContents.send('update_downloaded');
  });
  autoUpdater.on('download-progress', (progressObj) => {
    win.webContents.send('download_progress', progressObj.percent);
  });
  autoUpdater.on('error', (err) => {
    win.webContents.send('update_error', err.message);
  });
}

// IPC Listeners for manual update check
ipcMain.on('check_for_updates', () => {
  autoUpdater.checkForUpdatesAndNotify();
});

ipcMain.handle('dialog:openDirectory', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  if (canceled) {
    return null;
  } else {
    return filePaths[0];
  }
});

ipcMain.on('restart_app', () => {
  autoUpdater.quitAndInstall();
});

const downloadQueue = [];
const MAX_CONCURRENT = 3;
let activeDownloads = 0;

function processQueue() {
  if (activeDownloads >= MAX_CONCURRENT || downloadQueue.length === 0) return;
  
  while (activeDownloads < MAX_CONCURRENT && downloadQueue.length > 0) {
    activeDownloads++;
    const { task, win, settings } = downloadQueue.shift();
    
    startDownload(task, win, settings)
      .catch(e => console.error("Queue process error:", e))
      .finally(() => {
        activeDownloads--;
        processQueue();
      });
  }
}

ipcMain.on('start-download', async (event, { task, settings }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    downloadQueue.push({ task, win, settings });
    processQueue();
  }
});

ipcMain.handle('fetch-gallery-links', async (event, url) => {
  try {
    return await fetchGalleryLinks(url);
  } catch (error) {
    console.error('Failed to fetch gallery links:', error);
    throw error;
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
