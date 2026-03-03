import fs from 'fs-extra';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';
import archiver from 'archiver';
import crypto from 'crypto';
import { app } from 'electron';

const axiosInstance = axios.create({
  timeout: 15000, // 15 seconds timeout to prevent getting stuck
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Referer': 'https://google.com/'
  }
});

export async function fetchGalleryLinks(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    const links = [];

    if (hostname.includes('imhentai.xxx')) {
      // If it's an artist/tag/search page, get all gallery links
      if (url.includes('/artist/') || url.includes('/tag/') || url.includes('/search/')) {
        const res = await axiosInstance.get(url);
        const $ = cheerio.load(res.data);
        $('.thumb a').each((i, el) => {
          const href = $(el).attr('href');
          if (href && href.includes('/gallery/')) {
            links.push(urlObj.origin + href);
          }
        });
      }
    } else if (hostname.includes('3hentai.net')) {
      if (url.includes('/artist/') || url.includes('/tag/') || url.includes('/search/')) {
        const res = await axiosInstance.get(url);
        const $ = cheerio.load(res.data);
        $('.grid-item a').each((i, el) => {
          const href = $(el).attr('href');
          if (href && href.includes('/d/')) {
            links.push(urlObj.origin + href);
          }
        });
      }
    } else if (hostname.includes('nhentai.net')) {
      if (url.includes('/artist/') || url.includes('/tag/') || url.includes('/search/')) {
        const res = await axiosInstance.get(url);
        const $ = cheerio.load(res.data);
        $('.gallery a.cover').each((i, el) => {
          const href = $(el).attr('href');
          if (href && href.includes('/g/')) {
            links.push(urlObj.origin + href);
          }
        });
      }
    }

    // Return unique links
    return [...new Set(links)];
  } catch (error) {
    console.error("Error fetching gallery links:", error.message);
    return [];
  }
}

export async function startDownload(task, win, settings) {
  try {
    const { id, url, type, category, language, copyright, character } = task;
    
    win.webContents.send('download-progress', { id, status: 'scraping', progress: 0, filename: 'Analyse du site...' });
    
    let imageUrls = [];
    let title = 'Gallery';
    let extractedArtist = category; // Start with what we got from the URL
    let extractedLanguage = language; // Start with what we got from the URL
    
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;

    try {
      if (hostname.includes('rule34.xxx')) {
        const tags = urlObj.searchParams.get('tags') || '';
        const apiRes = await axiosInstance.get(`https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&tags=${tags}&json=1&limit=100`);
        if (apiRes.data && Array.isArray(apiRes.data)) {
          imageUrls = apiRes.data.map(p => p.file_url);
        }
      } else if (hostname.includes('gelbooru.com')) {
        const tags = urlObj.searchParams.get('tags') || '';
        const apiRes = await axiosInstance.get(`https://gelbooru.com/index.php?page=dapi&s=post&q=index&tags=${tags}&json=1&limit=100`);
        if (apiRes.data && apiRes.data.post) {
          imageUrls = apiRes.data.post.map(p => p.file_url);
        }
      } else if (hostname.includes('rule34.paheal.net')) {
        const res = await axiosInstance.get(url);
        const $ = cheerio.load(res.data);
        $('.shm-thumb').each((i, el) => {
          let src = $(el).find('img').attr('src');
          if (src) {
            src = src.replace('thumbs', 'images').replace('thumbs', 'images');
            imageUrls.push(src);
          }
        });
      } else if (hostname.includes('nhentai.net')) {
        const match = url.match(/\/g\/([0-9]+)/);
        if (match) {
          const galleryId = match[1];
          const apiRes = await axiosInstance.get(`https://nhentai.net/api/gallery/${galleryId}`);
          title = apiRes.data.title.pretty || apiRes.data.title.english;
          
          // Extract artist from tags
          const artistTag = apiRes.data.tags.find(t => t.type === 'artist');
          if (artistTag) {
            extractedArtist = artistTag.name.replace(/\b\w/g, c => c.toUpperCase());
          }

          // Extract language from tags
          const langTag = apiRes.data.tags.find(t => t.type === 'language' && t.name !== 'translated');
          if (langTag) {
             if (langTag.name === 'french') extractedLanguage = 'fr';
             else if (langTag.name === 'english') extractedLanguage = 'en';
             else if (langTag.name === 'turkish') extractedLanguage = 'tr';
          }

          const mediaId = apiRes.data.media_id;
          imageUrls = apiRes.data.images.pages.map((p, i) => {
            const ext = p.t === 'p' ? 'png' : (p.t === 'g' ? 'gif' : 'jpg');
            return `https://i.nhentai.net/galleries/${mediaId}/${i + 1}.${ext}`;
          });
        }
      } else if (hostname.includes('3hentai.net')) {
        const res = await axiosInstance.get(url);
        const $ = cheerio.load(res.data);
        title = $('title').text().replace(' - 3hentai', '').trim();
        
        // Extract artist
        const artistTags = [];
        $('a[href*="/artist/"]').each((i, el) => {
          let text = $(el).clone().children().remove().end().text(); // Remove child spans (like badges)
          text = text.replace(/[\n\r\t]/g, '').trim().replace(/\b\w/g, c => c.toUpperCase());
          if (text) artistTags.push(text);
        });
        if (artistTags.length > 0) {
          extractedArtist = artistTags.join(', ');
        }

        // Extract language
        const langTags = [];
        $('a[href*="/language/"]').each((i, el) => {
          langTags.push($(el).text().toLowerCase());
        });
        const langText = langTags.join(' ');
        if (langText.includes('french') || langText.includes('français')) extractedLanguage = 'fr';
        else if (langText.includes('english')) extractedLanguage = 'en';
        else if (langText.includes('turkish') || langText.includes('türkçe')) extractedLanguage = 'tr';
        else if (langText.includes('spanish') || langText.includes('español')) extractedLanguage = 'es';
        else if (langText.includes('japanese') || langText.includes('日本語')) extractedLanguage = 'jp';
        else if (langText.includes('korean') || langText.includes('한국어')) extractedLanguage = 'kr';
        else if (langText.includes('chinese') || langText.includes('中文')) extractedLanguage = 'cn';
        else if (langText.includes('russian') || langText.includes('русский')) extractedLanguage = 'ru';
        else if (langText.includes('german') || langText.includes('deutsch')) extractedLanguage = 'de';
        else if (langText.includes('italian') || langText.includes('italiano')) extractedLanguage = 'it';

        $('.page-container img').each((i, el) => {
          let src = $(el).attr('data-src') || $(el).attr('src');
          if (src) {
             src = src.replace('t.3hentai.net', 'cdn.3hentai.net').replace('t.jpg', '.jpg').replace('t.png', '.png');
             imageUrls.push(src);
          }
        });
      } else if (hostname.includes('imhentai.xxx')) {
        const res = await axiosInstance.get(url);
        const $ = cheerio.load(res.data);
        title = $('h1').text().trim();
        
        // Extract artist
        const artistTags = [];
        $('a[href*="/artist/"]').each((i, el) => {
          let text = $(el).clone().children().remove().end().text(); // Remove child spans (like badges)
          text = text.replace(/[\n\r\t]/g, '').trim().replace(/\b\w/g, c => c.toUpperCase());
          if (text) artistTags.push(text);
        });
        if (artistTags.length > 0) {
          extractedArtist = artistTags.join(', ');
        }

        // Extract language
        const langTags = [];
        $('a[href*="/language/"]').each((i, el) => {
          langTags.push($(el).text().toLowerCase());
        });
        const langText = langTags.join(' ');
        if (langText.includes('french') || langText.includes('français')) extractedLanguage = 'fr';
        else if (langText.includes('english')) extractedLanguage = 'en';
        else if (langText.includes('turkish') || langText.includes('türkçe')) extractedLanguage = 'tr';
        else if (langText.includes('spanish') || langText.includes('español')) extractedLanguage = 'es';
        else if (langText.includes('japanese') || langText.includes('日本語')) extractedLanguage = 'jp';
        else if (langText.includes('korean') || langText.includes('한국어')) extractedLanguage = 'kr';
        else if (langText.includes('chinese') || langText.includes('中文')) extractedLanguage = 'cn';
        else if (langText.includes('russian') || langText.includes('русский')) extractedLanguage = 'ru';
        else if (langText.includes('german') || langText.includes('deutsch')) extractedLanguage = 'de';
        else if (langText.includes('italian') || langText.includes('italiano')) extractedLanguage = 'it';

        $('.gthumb img').each((i, el) => {
          let src = $(el).attr('data-src') || $(el).attr('src');
          if (src) {
            if (src.startsWith('//')) src = 'https:' + src;
            src = src.replace('t.jpg', '.jpg').replace('t.png', '.png');
            imageUrls.push(src);
          }
        });
      }
    } catch (scrapeError) {
      console.error("Scraping specific error:", scrapeError.message);
      if (scrapeError.response && scrapeError.response.status === 403) {
        throw new Error(`Accès refusé (Erreur 403). Le site ${hostname} utilise une protection Cloudflare qui bloque l'application.`);
      }
    }

    // Generic fallback
    if (imageUrls.length === 0) {
      const response = await axiosInstance.get(url);
      const $ = cheerio.load(response.data);
      title = $('title').text().replace(/[<>:"/\\|?*]+/g, '').trim() || 'Gallery';
      
      $('img').each((i, el) => {
        let src = $(el).attr('src') || $(el).attr('data-src');
        if (src) {
          if (src.startsWith('//')) src = 'https:' + src;
          else if (src.startsWith('/')) src = urlObj.origin + src;
          if (src.startsWith('http')) imageUrls.push(src);
        }
      });
    }

    const uniqueImages = [...new Set(imageUrls)];
    
    if (uniqueImages.length === 0) {
      throw new Error('Aucune image trouvée sur cette page.');
    }

    const totalImages = uniqueImages.length;
    let saveDir = '';
    let finalFilename = '';
    
    if (type === 'images') {
      const baseDir = settings.imageBoardDirectory || path.join(app.getPath('downloads'), 'SnapCBZ', 'ImageBoards');
      saveDir = path.join(baseDir, copyright || 'Unknown', character || 'Unknown');
      await fs.ensureDir(saveDir);
      
      win.webContents.send('download-progress', { id, status: 'downloading_images', progress: 0, downloadedCount: 0, totalImages });
      
      let downloadedCount = 0;
      for (let i = 0; i < uniqueImages.length; i++) {
        const imgUrl = uniqueImages[i];
        try {
          const imgRes = await axiosInstance.get(imgUrl, { 
            responseType: 'arraybuffer',
            headers: { 'Referer': url }
          });
          const ext = path.extname(new URL(imgUrl).pathname) || '.jpg';
          const fileName = `image_${String(i + 1).padStart(3, '0')}${ext}`;
          const filePath = path.join(saveDir, fileName);
          
          await fs.writeFile(filePath, imgRes.data);
          downloadedCount++;
          
          win.webContents.send('download-progress', { 
            id, 
            progress: (downloadedCount / totalImages) * 100, 
            downloadedCount,
            currentFile: fileName
          });
        } catch (err) {
          console.error(`Failed to download image ${imgUrl}:`, err.message);
        }
      }
      
      win.webContents.send('download-progress', { 
        id, 
        status: 'completed', 
        progress: 100, 
        finalPath: saveDir 
      });
      
    } else {
      // CBZ Mode
      
      // Ensure the language matches one of the user's configured languages
      const configuredLangs = settings.languages || [];
      const availableLangIds = configuredLangs.map(l => l.id);
      
      // If the extracted language is not in the user's configured languages
      if (!availableLangIds.includes(extractedLanguage)) {
        if (availableLangIds.includes('other')) {
          extractedLanguage = 'other';
        } else {
          // Abort the download completely if the language is not wanted
          win.webContents.send('download-progress', { 
            id, 
            status: 'error', 
            error: `Langue ignorée (${extractedLanguage}). Configurez cette langue pour la télécharger.` 
          });
          return; // Stop execution
        }
      }

      const baseDir = settings.directories[extractedLanguage] || settings.directories.other || path.join(app.getPath('downloads'), 'SnapCBZ', 'CBZ');
      
      // Clean up the category/artist name for the folder (replace spaces with hyphens)
      const cleanCategory = (extractedArtist || 'Misc').replace(/[<>:"/\\|?*]+/g, '').trim().replace(/\s+/g, '-');
      saveDir = path.join(baseDir, cleanCategory);
      await fs.ensureDir(saveDir);
      
      title = title.replace(/[<>:"/\\|?*]+/g, '').trim() || 'Gallery';
      finalFilename = `${title}.cbz`;
      const finalPath = path.join(saveDir, finalFilename);
      
      const tempDir = path.join(app.getPath('temp'), 'snapcbz', crypto.randomBytes(8).toString('hex'));
      await fs.ensureDir(tempDir);
      
      win.webContents.send('download-progress', { 
        id, 
        status: 'downloading', 
        progress: 10, 
        filename: `Downloading ${totalImages} images...`,
        category: cleanCategory, // Send back the real artist name to update the UI
        language: extractedLanguage // Send back the real language to update the UI
      });
      
      let downloadedCount = 0;
      for (let i = 0; i < uniqueImages.length; i++) {
        const imgUrl = uniqueImages[i];
        try {
          const imgRes = await axiosInstance.get(imgUrl, { 
            responseType: 'arraybuffer',
            headers: { 'Referer': url }
          });
          const ext = path.extname(new URL(imgUrl).pathname) || '.jpg';
          const fileName = `page_${String(i + 1).padStart(3, '0')}${ext}`;
          await fs.writeFile(path.join(tempDir, fileName), imgRes.data);
          downloadedCount++;
          
          win.webContents.send('download-progress', { 
            id, 
            progress: 10 + (((i + 1) / totalImages) * 60)
          });
        } catch (err) {
          console.error(`Failed to download image ${imgUrl}:`, err.message);
          // Still update progress so the bar doesn't get stuck
          win.webContents.send('download-progress', { 
            id, 
            progress: 10 + (((i + 1) / totalImages) * 60)
          });
        }
      }
      
      if (downloadedCount === 0) {
        throw new Error("Impossible de télécharger les images. Le site bloque l'accès ou nécessite un Referer.");
      }
      
      win.webContents.send('download-progress', { id, status: 'converting', progress: 80, filename: 'Creating CBZ archive...' });
      
      const output = fs.createWriteStream(finalPath);
      const archive = archiver('zip', { zlib: { level: 9 } });
      
      output.on('close', async () => {
        await fs.remove(tempDir);
        win.webContents.send('download-progress', { 
          id, 
          status: 'completed', 
          progress: 100, 
          finalPath: finalPath 
        });
      });
      
      archive.on('error', (err) => {
        throw err;
      });
      
      archive.pipe(output);
      archive.directory(tempDir, false);
      await archive.finalize();
    }
    
  } catch (error) {
    console.error('Download error:', error);
    win.webContents.send('download-progress', { id, status: 'error', error: error.message });
  }
}
