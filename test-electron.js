import { app, BrowserWindow } from 'electron';

app.whenReady().then(async () => {
  try {
    console.log("Creating hidden window...");
    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        offscreen: true
      }
    });

    console.log("Loading nhentai.net...");
    await win.loadURL('https://nhentai.net/g/500000/');
    
    // Wait a bit for Cloudflare
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const html = await win.webContents.executeJavaScript('document.documentElement.outerHTML');
    console.log("HTML length:", html.length);
    console.log("Title:", html.match(/<title>(.*?)<\/title>/)[1]);
    
  } catch (e) {
    console.log("Error:", e.message);
  }
  app.quit();
});
