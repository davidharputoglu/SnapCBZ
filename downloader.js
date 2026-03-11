import fs from 'fs-extra';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';
import archiver from 'archiver';
import crypto from 'crypto';
import { app, BrowserWindow, session } from 'electron';

const axiosInstance = axios.create({
  timeout: 15000, // 15 seconds timeout to prevent getting stuck
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Referer': 'https://google.com/'
  }
});

const maxConcurrentScrapers = 3;
let activeScrapers = 0;
let scraperQueue = [];

async function fastFetchHtml(url, existingWin = null) {
  try {
    const scraperSession = session.fromPartition('persist:scraper');
    scraperSession.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    
    const fetchPromise = scraperSession.fetch(url, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': 'https://google.com/'
      },
      signal: controller.signal
    });
    
    const res = await Promise.race([
      fetchPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Fetch timeout')), 15000))
    ]);
    
    clearTimeout(timeoutId);
    
    const textPromise = res.text();
    const html = await Promise.race([
      textPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Text parsing timeout')), 15000))
    ]);
    
    if (html.includes('Just a moment') || html.includes('Cloudflare') || html.includes('Verify you are human')) {
      return await fetchHtmlWithElectron(url, existingWin);
    }
    
    return html;
  } catch (err) {
    return await fetchHtmlWithElectron(url, existingWin);
  }
}

async function fetchHtmlWithElectron(url, existingWin = null) {
  const executeFetch = async () => {
    // Quick check if we still need to bypass Cloudflare (maybe another window solved it while we were queued)
    if (!existingWin) {
      try {
        const scraperSession = session.fromPartition('persist:scraper');
        const res = await scraperSession.fetch(url, {
          headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Referer': 'https://google.com/'
          }
        });
        const html = await res.text();
        if (!html.includes('Just a moment') && !html.includes('Cloudflare') && !html.includes('Verify you are human')) {
          return html; // Solved by another window!
        }
      } catch (e) {}
    }

    return new Promise((resolve, reject) => {
      const win = existingWin || new BrowserWindow({
        show: false,
        width: 800,
        height: 600,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          partition: 'persist:scraper'
        }
      });
      if (!existingWin) {
        win.webContents.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
      }

      let resolved = false;
      let cloudflareTime = 0;
      let timeElapsed = 0;

      let lastState = "";
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          if (typeof checkTimeout !== 'undefined') clearTimeout(checkTimeout);
          if (!existingWin) { try { win.destroy(); } catch (e) {} }
          reject(new Error(`Timeout waiting for Cloudflare bypass. Last state: ${lastState}`));
        }
      }, 45000); // Increased to 45s to give user time to solve captcha

      const executeWithTimeout = (script, ms = 2000) => {
        return Promise.race([
          win.webContents.executeJavaScript(script),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Script timeout')), ms))
        ]);
      };

      let checkTimeout;
      const checkPage = async () => {
        if (resolved) return;
        timeElapsed += 1;
        try {
          const title = await executeWithTimeout('document.title');
          const bodyText = await executeWithTimeout('document.body.innerText || ""');
          
          if (title.includes('502 Bad Gateway') || title.includes('504 Gateway Time-out') || title.includes('404 Not Found') || title.includes('Access denied')) {
            if (!resolved) {
              resolved = true;
              clearTimeout(checkTimeout);
              clearTimeout(timeout);
              if (!existingWin) { try { win.destroy(); } catch (e) {} }
              reject(new Error(`Erreur du site: ${title}`));
            }
            return;
          }

          const isCloudflare = title.includes('Just a moment') || 
                               title.includes('Cloudflare') || 
                               bodyText.includes('Checking your browser') || 
                               bodyText.includes('Verify you are human') ||
                               await executeWithTimeout('document.querySelector("#challenge-stage, .cf-turnstile") !== null');

          if (isCloudflare) {
            cloudflareTime += 1;
          }

          // Show window if we detect Cloudflare OR if it's taking too long (might be an unknown captcha)
          if ((cloudflareTime > 2 || timeElapsed > 5) && !win.isVisible()) {
            win.show();
            win.setTitle("Veuillez patienter ou résoudre le captcha si nécessaire...");
          }

          if (isCloudflare) {
            lastState = `Cloudflare detected: title="${title}", bodyText.length=${bodyText.length}`;
            console.log(lastState);
            if (!resolved) checkTimeout = setTimeout(checkPage, 1000);
            return; // Wait for next interval
          }
          
          // Ensure page has actually loaded some content (not just a blank page during redirect)
          const readyState = await executeWithTimeout('document.readyState');
          const imgCount = await executeWithTimeout('document.querySelectorAll("img").length');
          
          if (readyState !== 'complete' || bodyText.length < 100 || title.trim() === '' || (imgCount === 0 && bodyText.length < 500)) {
            lastState = `Waiting for page load: readyState=${readyState}, bodyText.length=${bodyText.length}, title="${title}", imgCount=${imgCount}`;
            console.log(lastState);
            if (!resolved) checkTimeout = setTimeout(checkPage, 1000);
            return; // Wait for next interval
          }
          
          const html = await executeWithTimeout('document.documentElement.outerHTML');
          if (!resolved) {
            resolved = true;
            clearTimeout(checkTimeout);
            clearTimeout(timeout);
            if (!existingWin) { try { win.destroy(); } catch (e) {} }
            resolve(html);
          }
        } catch (e) {
          // Ignore errors during execution, try again
          lastState = `Error in checkPage: ${e.message}`;
          console.error(lastState);
          if (!resolved) checkTimeout = setTimeout(checkPage, 1000);
        }
      };

      if (!existingWin) {
        win.on('closed', () => {
          if (!resolved) {
            resolved = true;
            clearTimeout(checkTimeout);
            clearTimeout(timeout);
            reject(new Error("Fenêtre Cloudflare fermée par l'utilisateur"));
          }
        });
      }

      const startLoad = async () => {
        checkTimeout = setTimeout(checkPage, 1000);
        
        win.loadURL(url, {
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }).catch(e => {
          if (!resolved) {
            resolved = true;
            if (typeof checkTimeout !== 'undefined') clearTimeout(checkTimeout);
            clearTimeout(timeout);
            if (!existingWin) { try { win.destroy(); } catch (err) {} }
            reject(e);
          }
        });
      };
      
      startLoad();
    });
  };

  // If using an existing window (e.g. for fetching gallery links sequentially), bypass the queue to avoid deadlocks
  if (existingWin) {
    return executeFetch();
  }

  return new Promise((resolve, reject) => {
    const task = async () => {
      activeScrapers++;
      try {
        const result = await executeFetch();
        resolve(result);
      } catch (e) {
        reject(e);
      } finally {
        activeScrapers--;
        if (scraperQueue.length > 0) {
          const nextTask = scraperQueue.shift();
          nextTask();
        }
      }
    };

    if (activeScrapers < maxConcurrentScrapers) {
      task();
    } else {
      scraperQueue.push(task);
    }
  });
}

// Helper function to fetch with a strict timeout to prevent hanging
async function safeGet(url, config = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000); // 20 seconds strict timeout
  try {
    const getPromise = axiosInstance.get(url, {
      ...config,
      signal: controller.signal
    });
    
    const res = await Promise.race([
      getPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Axios timeout')), 20000))
    ]);
    
    clearTimeout(timeoutId);
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

export async function fetchGalleryLinks(url, onProgress = null) {
  let scraperWin = null;
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    const links = [];

    if (hostname.includes('imhentai.xxx')) {
      // If it's an artist/tag/search/group/parody/character page, get all gallery links
      if (url.includes('/artist/') || url.includes('/tag/') || url.includes('/search/') || url.includes('/group/') || url.includes('/parody/') || url.includes('/character/')) {
        let currentUrl = url;
        let pagesFetched = 0;
        const visitedUrls = new Set();
        
        scraperWin = new BrowserWindow({
          show: false,
          width: 800,
          height: 600,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            partition: 'persist:scraper'
          }
        });
        scraperWin.webContents.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

        while (currentUrl && pagesFetched < 50) {
          if (visitedUrls.has(currentUrl)) break;
          visitedUrls.add(currentUrl);
          
          if (onProgress) onProgress(`Analyse des liens (page ${pagesFetched + 1})...`);
          const html = await fastFetchHtml(currentUrl, scraperWin);
          const $ = cheerio.load(html);
          let found = 0;
          $('.thumb a, .inner_thumb a').each((i, el) => {
            const href = $(el).attr('href');
            if (href && href.includes('/gallery/')) {
              links.push(new URL(href, currentUrl).href);
              found++;
            }
          });
          
          const nextHref = $('.pagination .next').attr('href') || 
                           $('a[rel="next"]').attr('href') || 
                           $('.pagination .active').next().find('a').attr('href') || 
                           $('.pagination .page-item.active').next().find('a').attr('href') ||
                           $('a.page-link:contains("»")').attr('href');
                           
          if (found > 0 && nextHref && !nextHref.includes('javascript:') && nextHref !== '#') {
            const nextUrl = new URL(nextHref, currentUrl).href;
            if (nextUrl === currentUrl) break; // Prevent infinite loop on same page
            currentUrl = nextUrl;
            pagesFetched++;
          } else {
            if (found === 0 && pagesFetched === 0) {
              const title = $('title').text().trim();
              const bodySnippet = $('body').text().replace(/\s+/g, ' ').trim().substring(0, 100);
              throw new Error(`Aucun lien trouvé. Titre: "${title}". Contenu: "${bodySnippet}"`);
            }
            currentUrl = null;
          }
        }
      }
    } else if (hostname.includes('3hentai.net')) {
      if (url.includes('/artist/') || url.includes('/tag/') || url.includes('/search/') || url.includes('/group/') || url.includes('/parody/') || url.includes('/character/')) {
        let currentUrl = url;
        let pagesFetched = 0;
        const visitedUrls = new Set();
        while (currentUrl && pagesFetched < 50) {
          if (visitedUrls.has(currentUrl)) break;
          visitedUrls.add(currentUrl);
          
          if (onProgress) onProgress(`Analyse des liens (page ${pagesFetched + 1})...`);
          const res = await safeGet(currentUrl);
          const $ = cheerio.load(res.data);
          let found = 0;
          $('.grid-item a').each((i, el) => {
            const href = $(el).attr('href');
            if (href && href.includes('/d/')) {
              links.push(new URL(href, currentUrl).href);
              found++;
            }
          });
          
          const nextHref = $('.pagination .next').attr('href') || 
                           $('a[rel="next"]').attr('href') || 
                           $('.pagination .active').next().find('a').attr('href') || 
                           $('.pagination .page-item.active').next().find('a').attr('href') ||
                           $('a.page-link:contains("»")').attr('href');
                           
          if (found > 0 && nextHref && !nextHref.includes('javascript:') && nextHref !== '#') {
            const nextUrl = new URL(nextHref, currentUrl).href;
            if (nextUrl === currentUrl) break;
            currentUrl = nextUrl;
            pagesFetched++;
          } else {
            if (found === 0 && pagesFetched === 0) {
              const title = $('title').text().trim();
              const bodySnippet = $('body').text().replace(/\s+/g, ' ').trim().substring(0, 100);
              throw new Error(`Aucun lien trouvé. Titre: "${title}". Contenu: "${bodySnippet}"`);
            }
            currentUrl = null;
          }
        }
      }
    } else if (hostname.includes('nhentai.net')) {
      if (url.includes('/artist/') || url.includes('/tag/') || url.includes('/search/') || url.includes('/group/') || url.includes('/parody/') || url.includes('/character/')) {
        let currentUrl = url;
        let pagesFetched = 0;
        const visitedUrls = new Set();
        
        scraperWin = new BrowserWindow({
          show: false,
          width: 800,
          height: 600,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            partition: 'persist:scraper'
          }
        });
        scraperWin.webContents.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

        while (currentUrl && pagesFetched < 50) {
          if (visitedUrls.has(currentUrl)) break;
          visitedUrls.add(currentUrl);
          
          if (onProgress) onProgress(`Analyse des liens (page ${pagesFetched + 1})...`);
          const html = await fastFetchHtml(currentUrl, scraperWin);
          const $ = cheerio.load(html);
          let found = 0;
          $('.gallery a.cover').each((i, el) => {
            const href = $(el).attr('href');
            if (href && href.includes('/g/')) {
              links.push(new URL(href, currentUrl).href);
              found++;
            }
          });
          
          const nextHref = $('.pagination .next').attr('href') || 
                           $('a[rel="next"]').attr('href') || 
                           $('.pagination .active').next().find('a').attr('href') || 
                           $('.pagination .page-item.active').next().find('a').attr('href') ||
                           $('a.page-link:contains("»")').attr('href');
                           
          if (found > 0 && nextHref && !nextHref.includes('javascript:') && nextHref !== '#') {
            const nextUrl = new URL(nextHref, currentUrl).href;
            if (nextUrl === currentUrl) break;
            currentUrl = nextUrl;
            pagesFetched++;
          } else {
            if (found === 0 && pagesFetched === 0) {
              const title = $('title').text().trim();
              const bodySnippet = $('body').text().replace(/\s+/g, ' ').trim().substring(0, 100);
              throw new Error(`Aucun lien trouvé. Titre: "${title}". Contenu: "${bodySnippet}"`);
            }
            currentUrl = null;
          }
        }
      }
    }

    if (scraperWin) {
      try { scraperWin.destroy(); } catch (e) {}
    }

    // Return unique links
    return [...new Set(links)];
  } catch (error) {
    if (scraperWin) {
      try { scraperWin.destroy(); } catch (e) {}
    }
    console.error("Error fetching gallery links:", error.message);
    throw error;
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
            const html = await fastFetchHtml(url);
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
                 else extractedLanguage = 'other';
              } else {
                 extractedLanguage = 'other';
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
              else extractedLanguage = 'other';
              
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
        else extractedLanguage = 'other';

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
        const html = await fastFetchHtml(url);
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
        else extractedLanguage = 'other';

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
        html = await fastFetchHtml(url);
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

    // Get cookies from the scraper session to bypass Cloudflare for image downloads
    let cookieString = '';
    try {
      const cookies = await session.fromPartition('persist:scraper').cookies.get({ url: urlObj.origin });
      cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    } catch (e) {
      console.error("Failed to get cookies:", e);
    }

    const totalImages = uniqueImages.length;
    let saveDir = '';
    let finalFilename = '';
    
    if (type === 'images') {
      const baseDir = settings.imageBoardDirectory || path.join(app.getPath('downloads'), 'SnapCBZ', 'ImageBoards');
      saveDir = path.join(baseDir, copyright || 'Unknown', character || 'Unknown');
      await fs.ensureDir(saveDir);
      
      win.webContents.send('download-progress', { 
        id, 
        status: 'downloading_images', 
        progress: 0, 
        downloadedCount: 0, 
        totalImages,
        filename: title !== 'Gallery' ? title : `Images: ${character || copyright || 'Unknown'}`
      });
      
      let downloadedCount = 0;
      for (let i = 0; i < uniqueImages.length; i++) {
        const imgUrl = uniqueImages[i];
        let controller;
        try {
          controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 seconds strict timeout
          
          const fetchPromise = session.fromPartition('persist:scraper').fetch(imgUrl, { 
            headers: { 'Referer': url },
            signal: controller.signal
          }).catch(() => {});
          
          const imgRes = await Promise.race([
            fetchPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Fetch timeout')), 15000))
          ]);
          
          if (!imgRes.ok) {
            clearTimeout(timeoutId);
            throw new Error(`HTTP error! status: ${imgRes.status}`);
          }
          
          const bufferPromise = imgRes.arrayBuffer().catch(() => {});
          const arrayBuffer = await Promise.race([
            bufferPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Body download timeout')), 15000))
          ]);
          clearTimeout(timeoutId);
          
          const ext = path.extname(new URL(imgUrl).pathname) || '.jpg';
          const fileName = `image_${String(i + 1).padStart(3, '0')}${ext}`;
          const filePath = path.join(saveDir, fileName);
          
          await fs.writeFile(filePath, Buffer.from(arrayBuffer));
          downloadedCount++;
          
          win.webContents.send('download-progress', { 
            id, 
            progress: (downloadedCount / totalImages) * 100, 
            downloadedCount,
            currentFile: fileName
          });
        } catch (err) {
          if (controller) controller.abort();
          console.error(`Failed to download image ${imgUrl}:`, err.message);
        }
      }
      
      if (downloadedCount === 0) {
        throw new Error("Impossible de télécharger les images. Le site bloque l'accès ou nécessite un Referer.");
      }
      
      win.webContents.send('download-progress', { 
        id, 
        status: 'completed', 
        progress: 100, 
        finalPath: saveDir 
      });
      
    } else {
      // CBZ Mode
      
      // Clean up the category/artist name for the folder (replace spaces with hyphens)
      const cleanCategory = (extractedArtist || 'Misc').replace(/[<>:"/\\|?*]+/g, '').trim().replace(/\s+/g, '-');
      title = title.replace(/[<>:"/\\|?*]+/g, '').trim() || 'Gallery';

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
            status: 'ignored_language',
            filename: title,
            category: cleanCategory,
            language: extractedLanguage
          });
          return; // Stop execution
        }
      }

      const baseDir = settings.directories[extractedLanguage] || settings.directories.other || path.join(app.getPath('downloads'), 'SnapCBZ', 'CBZ');
      
      saveDir = path.join(baseDir, cleanCategory);
      await fs.ensureDir(saveDir);
      
      finalFilename = `${title}.cbz`;
      const finalPath = path.join(saveDir, finalFilename);
      
      const tempDir = path.join(app.getPath('temp'), 'snapcbz', crypto.randomBytes(8).toString('hex'));
      await fs.ensureDir(tempDir);
      
      win.webContents.send('download-progress', { 
        id, 
        status: 'downloading_images', 
        progress: 10, 
        downloadedCount: 0,
        totalImages,
        filename: title, // Keep the real title
        category: cleanCategory, // Send back the real artist name to update the UI
        language: extractedLanguage // Send back the real language to update the UI
      });
      
      let downloadedCount = 0;
      for (let i = 0; i < uniqueImages.length; i++) {
        const imgUrl = uniqueImages[i];
        let controller;
        try {
          controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 seconds strict timeout
          
          const fetchPromise = session.fromPartition('persist:scraper').fetch(imgUrl, { 
            headers: { 'Referer': url },
            signal: controller.signal
          }).catch(() => {});
          
          const imgRes = await Promise.race([
            fetchPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Fetch timeout')), 15000))
          ]);
          
          if (!imgRes.ok) {
            clearTimeout(timeoutId);
            throw new Error(`HTTP error! status: ${imgRes.status}`);
          }
          
          const bufferPromise = imgRes.arrayBuffer().catch(() => {});
          const arrayBuffer = await Promise.race([
            bufferPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Body download timeout')), 15000))
          ]);
          clearTimeout(timeoutId);
          
          const ext = path.extname(new URL(imgUrl).pathname) || '.jpg';
          const fileName = `page_${String(i + 1).padStart(3, '0')}${ext}`;
          await fs.writeFile(path.join(tempDir, fileName), Buffer.from(arrayBuffer));
          downloadedCount++;
          
          win.webContents.send('download-progress', { 
            id, 
            status: 'downloading_images',
            downloadedCount,
            totalImages,
            progress: 10 + (((i + 1) / totalImages) * 70)
          });
        } catch (err) {
          if (controller) controller.abort();
          console.error(`Failed to download image ${imgUrl}:`, err.message);
          // Still update progress so the bar doesn't get stuck
          win.webContents.send('download-progress', { 
            id, 
            status: 'downloading_images',
            downloadedCount,
            totalImages,
            progress: 10 + (((i + 1) / totalImages) * 70)
          });
        }
      }
      
      if (downloadedCount === 0) {
        throw new Error("Impossible de télécharger les images. Le site bloque l'accès ou nécessite un Referer.");
      }
      
      win.webContents.send('download-progress', { id, status: 'converting', progress: 80, filename: title });
      
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
        
        output.on('error', (err) => {
          reject(err);
        });
        
        archive.on('error', (err) => {
          reject(err);
        });

        archive.on('progress', (progressData) => {
          // Use downloadedCount as the absolute total since entries.total grows dynamically
          const percent = 80 + ((progressData.entries.processed / downloadedCount) * 20);
          win.webContents.send('download-progress', { 
            id, 
            status: 'converting', 
            progress: isNaN(percent) ? 80 : Math.min(percent, 99) // Cap at 99 until finished
          });
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
