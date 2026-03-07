import fs from 'fs-extra';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';
import archiver from 'archiver';
import crypto from 'crypto';
import { app, BrowserWindow } from 'electron';

const axiosInstance = axios.create({
  timeout: 15000, // 15 seconds timeout to prevent getting stuck
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Referer': 'https://google.com/'
  }
});

async function fetchHtmlWithElectron(url) {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      show: false,
      width: 800,
      height: 600,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    let resolved = false;
    let cloudflareTime = 0;
    let timeElapsed = 0;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        if (typeof checkInterval !== 'undefined') clearInterval(checkInterval);
        try { win.destroy(); } catch (e) {}
        reject(new Error("Timeout waiting for Cloudflare bypass"));
      }
    }, 45000); // Increased to 45s to give user time to solve captcha

    const checkPage = async () => {
      if (resolved) return;
      timeElapsed += 1;
      try {
        const title = await win.webContents.executeJavaScript('document.title');
        const bodyText = await win.webContents.executeJavaScript('document.body.innerText || ""');
        
        if (title.includes('502 Bad Gateway') || title.includes('504 Gateway Time-out') || title.includes('404 Not Found') || title.includes('Access denied')) {
          if (!resolved) {
            resolved = true;
            clearInterval(checkInterval);
            clearTimeout(timeout);
            try { win.destroy(); } catch (e) {}
            reject(new Error(`Erreur du site: ${title}`));
          }
          return;
        }

        const isCloudflare = title.includes('Just a moment') || 
                             title.includes('Cloudflare') || 
                             bodyText.includes('Cloudflare') || 
                             bodyText.includes('Checking your browser') || 
                             bodyText.includes('Verify you are human') ||
                             await win.webContents.executeJavaScript('document.querySelector("#challenge-stage, .cf-turnstile") !== null');

        if (isCloudflare) {
          cloudflareTime += 1;
        }

        // Show window if we detect Cloudflare OR if it's taking too long (might be an unknown captcha)
        if ((cloudflareTime > 2 || timeElapsed > 5) && !win.isVisible()) {
          win.show();
          win.setTitle("Veuillez patienter ou résoudre le captcha si nécessaire...");
        }

        if (isCloudflare) {
          return; // Wait for next interval
        }
        
        // Ensure page has actually loaded some content (not just a blank page during redirect)
        const imgCount = await win.webContents.executeJavaScript('document.querySelectorAll("img").length');
        if (bodyText.length < 100 || title.trim() === '' || (imgCount === 0 && bodyText.length < 500)) {
          return; // Wait for next interval
        }
        
        const html = await win.webContents.executeJavaScript('document.documentElement.outerHTML');
        if (!resolved) {
          resolved = true;
          clearInterval(checkInterval);
          clearTimeout(timeout);
          try { win.destroy(); } catch (e) {}
          resolve(html);
        }
      } catch (e) {
        // Ignore errors during execution, try again
      }
    };

    const checkInterval = setInterval(checkPage, 1000);

    win.on('closed', () => {
      if (!resolved) {
        resolved = true;
        clearInterval(checkInterval);
        clearTimeout(timeout);
        reject(new Error("Fenêtre Cloudflare fermée par l'utilisateur"));
      }
    });

    win.loadURL(url, {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }).catch(e => {
      if (!resolved) {
        resolved = true;
        if (typeof checkInterval !== 'undefined') clearInterval(checkInterval);
        clearTimeout(timeout);
        try { win.destroy(); } catch (err) {}
        reject(e);
      }
    });
  });
}

// Helper function to fetch with a strict timeout to prevent hanging
async function safeGet(url, config = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000); // 20 seconds strict timeout
  try {
    const res = await axiosInstance.get(url, {
      ...config,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

export async function fetchGalleryLinks(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    const links = [];

    if (hostname.includes('imhentai.xxx')) {
      // If it's an artist/tag/search page, get all gallery links
      if (url.includes('/artist/') || url.includes('/tag/') || url.includes('/search/')) {
        let currentUrl = url;
        let pagesFetched = 0;
        while (currentUrl && pagesFetched < 50) {
          const html = await fetchHtmlWithElectron(currentUrl);
          const $ = cheerio.load(html);
          let found = 0;
          $('.thumb a, .inner_thumb a').each((i, el) => {
            const href = $(el).attr('href');
            if (href && href.includes('/gallery/')) {
              links.push(urlObj.origin + href);
              found++;
            }
          });
          
          const nextHref = $('.pagination .next').attr('href') || $('a[rel="next"]').attr('href');
          if (found > 0 && nextHref && !nextHref.includes('javascript:')) {
            currentUrl = new URL(nextHref, urlObj.origin).href;
            pagesFetched++;
          } else {
            currentUrl = null;
          }
        }
      }
    } else if (hostname.includes('3hentai.net')) {
      if (url.includes('/artist/') || url.includes('/tag/') || url.includes('/search/')) {
        let currentUrl = url;
        let pagesFetched = 0;
        while (currentUrl && pagesFetched < 50) {
          const res = await safeGet(currentUrl);
          const $ = cheerio.load(res.data);
          let found = 0;
          $('.grid-item a').each((i, el) => {
            const href = $(el).attr('href');
            if (href && href.includes('/d/')) {
              links.push(urlObj.origin + href);
              found++;
            }
          });
          
          const nextHref = $('.pagination .next').attr('href') || $('a[rel="next"]').attr('href');
          if (found > 0 && nextHref && !nextHref.includes('javascript:')) {
            currentUrl = new URL(nextHref, urlObj.origin).href;
            pagesFetched++;
          } else {
            currentUrl = null;
          }
        }
      }
    } else if (hostname.includes('nhentai.net')) {
      if (url.includes('/artist/') || url.includes('/tag/') || url.includes('/search/')) {
        let currentUrl = url;
        let pagesFetched = 0;
        while (currentUrl && pagesFetched < 50) {
          const html = await fetchHtmlWithElectron(currentUrl);
          const $ = cheerio.load(html);
          let found = 0;
          $('.gallery a.cover').each((i, el) => {
            const href = $(el).attr('href');
            if (href && href.includes('/g/')) {
              links.push(urlObj.origin + href);
              found++;
            }
          });
          
          const nextHref = $('.pagination .next').attr('href') || $('a[rel="next"]').attr('href');
          if (found > 0 && nextHref && !nextHref.includes('javascript:')) {
            currentUrl = new URL(nextHref, urlObj.origin).href;
            pagesFetched++;
          } else {
            currentUrl = null;
          }
        }
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
        const apiRes = await safeGet(`https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&tags=${tags}&json=1&limit=100`);
        if (apiRes.data && Array.isArray(apiRes.data)) {
          imageUrls = apiRes.data.map(p => p.file_url);
        }
      } else if (hostname.includes('gelbooru.com')) {
        const tags = urlObj.searchParams.get('tags') || '';
        const apiRes = await safeGet(`https://gelbooru.com/index.php?page=dapi&s=post&q=index&tags=${tags}&json=1&limit=100`);
        if (apiRes.data && apiRes.data.post) {
          imageUrls = apiRes.data.post.map(p => p.file_url);
        }
      } else if (hostname.includes('rule34.paheal.net')) {
        const res = await safeGet(url);
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
          try {
            const html = await fetchHtmlWithElectron(url);
            const $ = cheerio.load(html);
            
            let galleryData = null;
            $('script').each((i, el) => {
              const text = $(el).html();
              if (text && text.includes('window._gallery')) {
                const match = text.match(/window\._gallery\s*=\s*JSON\.parse\((.*)\);/);
                if (match) {
                  try {
                    galleryData = JSON.parse(JSON.parse(match[1]));
                  } catch(e) {}
                }
              }
            });

            if (galleryData) {
              title = galleryData.title.pretty || galleryData.title.english;
              
              const artistTag = galleryData.tags.find(t => t.type === 'artist');
              if (artistTag) {
                extractedArtist = artistTag.name.replace(/\b\w/g, c => c.toUpperCase());
              }

              const langTag = galleryData.tags.find(t => t.type === 'language' && t.name !== 'translated');
              if (langTag) {
                 if (langTag.name === 'french') extractedLanguage = 'fr';
                 else if (langTag.name === 'english') extractedLanguage = 'en';
                 else if (langTag.name === 'turkish') extractedLanguage = 'tr';
                 else if (langTag.name === 'spanish') extractedLanguage = 'es';
                 else if (langTag.name === 'japanese') extractedLanguage = 'jp';
                 else if (langTag.name === 'korean') extractedLanguage = 'kr';
                 else if (langTag.name === 'chinese') extractedLanguage = 'cn';
                 else if (langTag.name === 'russian') extractedLanguage = 'ru';
                 else if (langTag.name === 'german') extractedLanguage = 'de';
                 else if (langTag.name === 'italian') extractedLanguage = 'it';
              }

              const mediaId = galleryData.media_id;
              imageUrls = galleryData.images.pages.map((p, i) => {
                const ext = p.t === 'p' ? 'png' : (p.t === 'g' ? 'gif' : (p.t === 'w' ? 'webp' : 'jpg'));
                return `https://i.nhentai.net/galleries/${mediaId}/${i + 1}.${ext}`;
              });
            } else {
              // Fallback to HTML scraping
              title = $('#info h1').text().trim() || $('#info h2').text().trim();
              
              const artistTags = [];
              $('.tag-container:contains("Artists") .name, .tags a[href*="/artist/"] .name').each((i, el) => {
                artistTags.push($(el).text().replace(/\b\w/g, c => c.toUpperCase()));
              });
              if (artistTags.length > 0) extractedArtist = artistTags.join(', ');

              const langTags = [];
              $('.tag-container:contains("Languages") .name, .tags a[href*="/language/"] .name').each((i, el) => {
                langTags.push($(el).text().toLowerCase());
              });
              const langText = langTags.join(' ');
              if (langText.includes('french')) extractedLanguage = 'fr';
              else if (langText.includes('english')) extractedLanguage = 'en';
              else if (langText.includes('spanish')) extractedLanguage = 'es';
              else if (langText.includes('japanese')) extractedLanguage = 'jp';
              else if (langText.includes('korean')) extractedLanguage = 'kr';
              else if (langText.includes('chinese')) extractedLanguage = 'cn';
              
              $('.gallerythumb img').each((i, el) => {
                let src = $(el).attr('data-src') || $(el).attr('src');
                if (src) {
                  let realSrc = src.replace(/t([0-9]*)\.nhentai\.net/, 'i$1.nhentai.net');
                  realSrc = realSrc.replace(/([0-9]+)t\.([a-z]+)$/i, '$1.$2');
                  imageUrls.push(realSrc);
                }
              });
            }
          } catch (apiError) {
            console.error("nhentai scraping failed:", apiError.message);
            throw new Error(`Erreur lors de l'analyse de nhentai.net: ${apiError.message}`);
          }
        }
      } else if (hostname.includes('3hentai.net')) {
        const res = await safeGet(url);
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
             src = src.replace(/t([0-9]*)\.3hentai\.net/, 'cdn.3hentai.net').replace(/([0-9]+)t\.([a-z]+)$/i, '$1.$2');
             imageUrls.push(src);
          }
        });
        
        // If it's a gallery page instead of a reading page
        if (imageUrls.length === 0) {
          $('.gallery .item img, .container .gallery img').each((i, el) => {
            let src = $(el).attr('data-src') || $(el).attr('src');
            if (src) {
               let realSrc = src.replace(/t([0-9]*)\.3hentai\.net/, 'cdn.3hentai.net');
               realSrc = realSrc.replace(/([0-9]+)t\.([a-z]+)$/i, '$1.$2');
               imageUrls.push(realSrc);
            }
          });
        }
      } else if (hostname.includes('imhentai.xxx')) {
        const html = await fetchHtmlWithElectron(url);
        const $ = cheerio.load(html);
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

        // Extract base URL from the first thumbnail
        const firstThumb = $('.gthumb img').first().attr('data-src') || $('.gthumb img').first().attr('src');
        let baseUrl = '';
        if (firstThumb) {
          const baseUrlMatch = firstThumb.match(/(https:\/\/[a-z0-9]+\.imhentai\.xxx\/.*)\/[0-9]+t\.[a-z]+$/i);
          if (baseUrlMatch) {
            baseUrl = baseUrlMatch[1];
          }
        }

        // Extract the g_th JSON which contains the extensions for each page
        // Format: {"1":"w,1074,1516", "2":"j,1075,1518", ...}
        // w = .webp, j = .jpg, p = .png, g = .gif
        let gTh = {};
        const htmlContent = $.html();
        const gThMatch = htmlContent.match(/var\s+g_th\s*=\s*\$\.parseJSON\('([^']+)'\)/);
        if (gThMatch) {
          try {
            gTh = JSON.parse(gThMatch[1]);
          } catch (e) {
            console.error("Failed to parse g_th JSON", e);
          }
        }

        const totalPages = Object.keys(gTh).length;
        if (totalPages > 0 && baseUrl) {
          for (let i = 1; i <= totalPages; i++) {
            const extCode = gTh[i] ? gTh[i].split(',')[0] : 'j';
            let imageExt = '.jpg';
            if (extCode === 'w') imageExt = '.webp';
            else if (extCode === 'p') imageExt = '.png';
            else if (extCode === 'g') imageExt = '.gif';
            
            const realSrc = `${baseUrl}/${i}${imageExt}`;
            imageUrls.push(realSrc);
          }
        } else {
          // Fallback if g_th or baseUrl fails
          $('.gthumb img').each((i, el) => {
            let src = $(el).attr('data-src') || $(el).attr('src');
            if (src) {
              // Convert thumbnail URL to full image URL
              // Example: https://m10.imhentai.xxx/029/85nl14c70e/1t.jpg -> https://m10.imhentai.xxx/029/85nl14c70e/1.jpg
              const realSrc = src.replace(/([0-9]+)t\.([a-z]+)$/i, '$1.$2');
              imageUrls.push(realSrc);
            }
          });
          
          // If still no images, try to find them in the gallery container
          if (imageUrls.length === 0) {
            $('.gallery_content img').each((i, el) => {
              let src = $(el).attr('data-src') || $(el).attr('src');
              if (src) {
                const realSrc = src.replace(/([0-9]+)t\.([a-z]+)$/i, '$1.$2');
                imageUrls.push(realSrc);
              }
            });
          }
        }
      }
    } catch (scrapeError) {
      console.error("Scraping specific error:", scrapeError.message);
      if (scrapeError.response && scrapeError.response.status === 403) {
        throw new Error(`Accès refusé (Erreur 403). Le site ${hostname} utilise une protection Cloudflare qui bloque l'application.`);
      }
    }

    // Generic fallback
    if (imageUrls.length === 0) {
      let html = '';
      if (hostname.includes('nhentai.net')) {
        html = await fetchHtmlWithElectron(url);
      } else if (!hostname.includes('imhentai.xxx')) {
        const response = await safeGet(url);
        html = response.data;
      }
      
      if (html) {
        const $ = cheerio.load(html);
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
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 seconds strict timeout
          
          const imgRes = await axiosInstance.get(imgUrl, { 
            responseType: 'arraybuffer',
            headers: { 'Referer': url },
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          
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
        } else if (task.isDirectLink) {
          // Bypass language restriction for direct links
          // Keep the extractedLanguage so it might still go to the right folder if configured
        } else {
          // Abort the download completely and tell the UI to remove the task silently
          win.webContents.send('download-progress', { 
            id, 
            status: 'ignored_language'
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
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 seconds strict timeout
          
          const imgRes = await axiosInstance.get(imgUrl, { 
            responseType: 'arraybuffer',
            headers: { 'Referer': url },
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          
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
      
      await new Promise((resolve, reject) => {
        output.on('close', async () => {
          try {
            await fs.remove(tempDir);
            win.webContents.send('download-progress', { 
              id, 
              status: 'completed', 
              progress: 100, 
              filename: finalFilename,
              finalPath: finalPath 
            });
            resolve();
          } catch (e) {
            reject(e);
          }
        });
        
        archive.on('error', (err) => {
          reject(err);
        });
        
        archive.pipe(output);
        archive.directory(tempDir, false);
        archive.finalize();
      });
    }
    
  } catch (error) {
    console.error('Download error:', error);
    win.webContents.send('download-progress', { id, status: 'error', error: error.message });
  }
}
