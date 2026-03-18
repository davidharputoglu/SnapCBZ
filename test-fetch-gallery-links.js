import { app, BrowserWindow } from 'electron';
import { fetchHtmlWithElectron } from './downloader.js';
import * as cheerio from 'cheerio';

async function test() {
  await app.whenReady();
  const scraperWin = new BrowserWindow({
    show: false,
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      partition: 'persist:scraper'
    }
  });

  try {
    const html = await fetchHtmlWithElectron('https://imhentai.xxx/artist/minamoto/', scraperWin);
    const $ = cheerio.load(html);
    console.log("Title:", $('title').text());
    console.log("Thumbs with .thumb a:", $('.thumb a').length);
    console.log("Thumbs with .inner_thumb a:", $('.inner_thumb a').length);
  } catch (e) {
    console.error("Error:", e.message);
  }
  app.quit();
}
test();
