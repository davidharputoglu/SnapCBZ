import fs from 'fs-extra';
import path from 'path';
import * as cheerio from 'cheerio';
import archiver from 'archiver';
import crypto from 'crypto';
import { app, BrowserWindow, session } from 'electron';

const maxConcurrentScrapers = 3;
let activeScrapers = 0;
let scraperQueue = [];

let activeElectronScrapers = 0;
let electronScraperQueue = [];

export const activeTasks = new Map();

export async function clearScraperCookies() {
  try {
    const scraperSession = session.fromPartition('persist:scraper');
    await scraperSession.clearStorageData({ storages: ['cookies', 'serviceworkers', 'caches'] });
    console.log("Scraper session cookies and cache cleared.");
    return true;
  } catch (e) {
    console.error("Failed to clear scraper session:", e);
    return false;
  }
}

export function cancelTask(taskId) {
  if (activeTasks.has(taskId)) {
    const taskState = activeTasks.get(taskId);
    taskState.isCancelled = true;
    if (taskState.controllers) {
      for (const controller of taskState.controllers) {
        try { controller.abort(); } catch (e) {}
      }
    }
    if (taskState.cancelElectron) {
      try { taskState.cancelElectron(); } catch (e) {}
    }
    if (taskState.scraperWin) {
      try { taskState.scraperWin.destroy(); } catch (e) {}
    }
  }
}

const loggedInSites = new Set();
let loginPromiseMap = new Map();

async function autoLogin(siteUrl, username, password) {
  const urlObj = new URL(siteUrl);
  const siteKey = urlObj.hostname;
  
  if (loggedInSites.has(siteKey)) {
    return true;
  }
  
  if (loginPromiseMap.has(siteKey)) {
    return loginPromiseMap.get(siteKey);
  }

  const loginPromise = new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      show: false,
      width: 800,
      height: 600,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        partition: 'persist:scraper'
      }
    });

    const defaultUserAgent = session.defaultSession.getUserAgent();
    const cleanUserAgent = defaultUserAgent.replace(/SnapCBZ\/[0-9\.]+\s*/, '').replace(/Electron\/[0-9\.]+\s*/, '');
    win.webContents.userAgent = cleanUserAgent;

    let loginTimeout = setTimeout(() => {
      try { if (!win.isDestroyed()) win.destroy(); } catch(e) {}
      loginPromiseMap.delete(siteKey);
      reject(new Error("Auto-login timeout"));
    }, 30000);

    let hasSubmitted = false;

    win.webContents.on('did-finish-load', async () => {
      if (hasSubmitted) return; // Don't try to login again after submitting
      try {
        const executeWithTimeout = (script, ms = 5000) => {
          return Promise.race([
            win.webContents.executeJavaScript(script),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Script timeout')), ms))
          ]);
        };

        const hasLoginForm = await executeWithTimeout(`
          document.querySelector('input[type="password"]') !== null
        `);

        if (!hasLoginForm) {
          // Maybe already logged in, or not a login page
          clearTimeout(loginTimeout);
          try { if (!win.isDestroyed()) win.destroy(); } catch(e) {}
          loggedInSites.add(siteKey);
          loginPromiseMap.delete(siteKey);
          resolve(true);
          return;
        }

        hasSubmitted = true;
        const submitted = await executeWithTimeout(`
          (function() {
            const userInputs = document.querySelectorAll('input[type="text"], input[type="email"], input[name*="user"], input[name*="log"], input[name*="email"]');
            const passInputs = document.querySelectorAll('input[type="password"]');
            
            if (userInputs.length > 0 && passInputs.length > 0) {
              let userField = Array.from(userInputs).find(el => el.offsetWidth > 0 && el.offsetHeight > 0) || userInputs[0];
              let passField = Array.from(passInputs).find(el => el.offsetWidth > 0 && el.offsetHeight > 0) || passInputs[0];
              
              userField.value = '${username.replace(/'/g, "\\'")}';
              passField.value = '${password.replace(/'/g, "\\'")}';
              
              const form = userField.closest('form');
              if (form) {
                const btn = form.querySelector('input[type="submit"], button[type="submit"]');
                if (btn) {
                  btn.click();
                  return true;
                } else {
                  form.submit();
                  return true;
                }
              } else {
                // Try to find a submit button nearby
                const submitBtns = document.querySelectorAll('input[type="submit"], button[type="submit"], button');
                for (let btn of submitBtns) {
                  const text = (btn.innerText || btn.value || '').toLowerCase();
                  if (text.includes('login') || text.includes('log in') || text.includes('sign in') || text.includes('connexion')) {
                    btn.click();
                    return true;
                  }
                }
              }
            }
            return false;
          })();
        `);
        
        if (submitted) {
          win.webContents.once('did-navigate', () => {
            clearTimeout(loginTimeout);
            try { if (!win.isDestroyed()) win.destroy(); } catch(e) {}
            loggedInSites.add(siteKey);
            loginPromiseMap.delete(siteKey);
            resolve(true);
          });
          
          setTimeout(() => {
            clearTimeout(loginTimeout);
            try { if (!win.isDestroyed()) win.destroy(); } catch(e) {}
            loggedInSites.add(siteKey);
            loginPromiseMap.delete(siteKey);
            resolve(true);
          }, 5000);
        } else {
          clearTimeout(loginTimeout);
          try { if (!win.isDestroyed()) win.destroy(); } catch(e) {}
          loginPromiseMap.delete(siteKey);
          resolve(false);
        }

      } catch (e) {
        clearTimeout(loginTimeout);
        try { if (!win.isDestroyed()) win.destroy(); } catch(err) {}
        loginPromiseMap.delete(siteKey);
        reject(e);
      }
    });

    let loginUrl = siteUrl;
    try {
      if (siteUrl.includes('imhentai.xxx')) loginUrl = 'https://imhentai.xxx/login/';
      else if (siteUrl.includes('nhentai.net')) loginUrl = 'https://nhentai.net/login/';
      else if (siteUrl.includes('3hentai.net')) loginUrl = 'https://3hentai.net/login';
      else if (!siteUrl.includes('login')) loginUrl = `${urlObj.origin}/wp-login.php`;
    } catch(e) {}

    win.loadURL(loginUrl);
  });
  
  loginPromiseMap.set(siteKey, loginPromise);
  return loginPromise;
}

export async function fastFetchHtml(url, existingWin = null, taskState = null, onProgress = null) {
  try {
    if (taskState && taskState.isCancelled) throw new Error("Cancelled by user");
    
    if (onProgress) onProgress("Fetching HTML (fast)...");
    
    // Try to fetch using the existing window's context to bypass Cloudflare TLS fingerprinting
    if (existingWin) {
      if (onProgress) onProgress("Fetching HTML via existing window...");
      try {
        const currentUrlPromise = existingWin.webContents.executeJavaScript('window.location.href');
        const currentUrl = await Promise.race([
          currentUrlPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('executeJavaScript timeout')), 5000))
        ]);
        if (currentUrl && currentUrl !== 'about:blank' && new URL(currentUrl).origin === new URL(url).origin) {
          const htmlPromise = existingWin.webContents.executeJavaScript(`
            new Promise((resolve, reject) => {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 15000);
              fetch('${url}', {
                signal: controller.signal
              })
              .then(res => {
                clearTimeout(timeoutId);
                return res.text();
              })
              .then(resolve)
              .catch(err => {
                clearTimeout(timeoutId);
                reject(err);
              });
            })
          `);
          
          const html = await Promise.race([
            htmlPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('executeJavaScript timeout')), 16000))
          ]);
          
          if (html && !html.includes('Just a moment') && !html.includes('Cloudflare') && !html.includes('Verify you are human')) {
            return html;
          }
        }
      } catch (e) {
        // Ignore errors and fallback to scraperSession.fetch
      }
    }

    if (onProgress) onProgress("Fetching HTML (fast)...");

    const defaultUserAgent = session.defaultSession.getUserAgent();
    const cleanUserAgent = defaultUserAgent.replace(/SnapCBZ\/[0-9\.]+\s*/, '').replace(/Electron\/[0-9\.]+\s*/, '');
    
    const scraperSession = session.fromPartition('persist:scraper');
    scraperSession.setUserAgent(cleanUserAgent);
    
    const controller = new AbortController();
    if (taskState && taskState.controllers) taskState.controllers.push(controller);
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    
    const fetchPromise = scraperSession.fetch(url, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'max-age=0',
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'Referer': url
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
    
    if (taskState && taskState.controllers) {
      const idx = taskState.controllers.indexOf(controller);
      if (idx > -1) taskState.controllers.splice(idx, 1);
    }

    const isCloudflareBlock = res.status === 403 || res.status === 503 || 
                              html.includes('Just a moment') || 
                              (html.includes('Cloudflare') && html.includes('Ray ID')) || 
                              html.includes('Verify you are human') ||
                              html.includes('Checking your browser') ||
                              html.includes('cf-browser-verification') ||
                              html.includes('cf-turnstile') ||
                              html.includes('challenge-stage');

    if (isCloudflareBlock) {
      return await fetchHtmlWithElectron(url, existingWin, taskState, onProgress);
    }
    
    return html;
  } catch (err) {
    throw err;
  }
}

async function fetchHtmlWithElectron(url, existingWin = null, taskState = null, onProgress = null) {
  const executeFetch = async () => {
    if (taskState && taskState.isCancelled) throw new Error("Cancelled by user");
    if (onProgress) onProgress("Initializing Cloudflare bypass...");
    // Quick check if we still need to bypass Cloudflare (maybe another window solved it while we were queued)
    if (!existingWin) {
      try {
        const scraperSession = session.fromPartition('persist:scraper');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        
        const fetchPromise = scraperSession.fetch(url, {
          headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'max-age=0',
            'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
            'Referer': url
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
        
        if (!html.includes('Just a moment') && !html.includes('Cloudflare') && !html.includes('Verify you are human')) {
          return html; // Solved by another window!
        }
      } catch (e) {}
    }

    return new Promise((resolve, reject) => {
      if (taskState && taskState.isCancelled) return reject(new Error("Cancelled by user"));
      
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
      const defaultUserAgent = session.defaultSession.getUserAgent();
      const cleanUserAgent = defaultUserAgent.replace(/SnapCBZ\/[0-9\.]+\s*/, '').replace(/Electron\/[0-9\.]+\s*/, '');
      
      if (!existingWin) {
        win.webContents.userAgent = cleanUserAgent;
      }

      let resolved = false;
      let cloudflareTime = 0;
      let timeElapsed = 0;
      let hasClearedCookies = false;

      let lastState = "";
      let checkTimeout;
      
      if (taskState) {
        taskState.cancelElectron = () => {
          if (!resolved) {
            resolved = true;
            if (typeof checkTimeout !== 'undefined') clearTimeout(checkTimeout);
            clearTimeout(timeout);
            if (!existingWin) { try { win.destroy(); } catch (e) {} }
            reject(new Error("Cancelled by user"));
          }
        };
      }

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          if (typeof checkTimeout !== 'undefined') clearTimeout(checkTimeout);
          if (!existingWin) { try { win.destroy(); } catch (e) {} }
          reject(new Error(`Timeout waiting for Cloudflare bypass. Last state: ${lastState}`));
        }
      }, 120000); // Increased to 120s to give user time to solve captcha

      const executeWithTimeout = (script, ms = 2000) => {
        return Promise.race([
          win.webContents.executeJavaScript(script),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Script timeout')), ms))
        ]);
      };

      const checkPage = async () => {
        if (resolved) return;
        timeElapsed += 1;
        try {
          const title = await executeWithTimeout('document.title || ""');
          const bodyText = await executeWithTimeout('document.body ? document.body.innerText : ""');
          
          if (title.includes('502 Bad Gateway') || title.includes('504 Gateway Time-out') || title.includes('404 Not Found') || title.includes('Access denied') || title.includes('403 Forbidden')) {
            if (!hasClearedCookies && (title.includes('Access denied') || title.includes('403 Forbidden'))) {
              hasClearedCookies = true;
              console.log("Access denied/403 detected, clearing cookies and retrying...");
              if (onProgress) onProgress("Access denied. Clearing cookies and retrying...");
              try {
                await session.fromPartition('persist:scraper').clearStorageData({ storages: ['cookies', 'serviceworkers', 'caches'] });
                win.reload();
              } catch(e) {}
              if (!resolved) checkTimeout = setTimeout(checkPage, 2000);
              return;
            }

            if (!resolved) {
              resolved = true;
              clearTimeout(checkTimeout);
              clearTimeout(timeout);
              if (!existingWin) { try { win.destroy(); } catch (e) {} }
              reject(new Error(`Site error: ${title}`));
            }
            return;
          }

          const isCloudflare = title.includes('Just a moment') || 
                               (title.includes('Cloudflare') && bodyText.includes('Ray ID')) || 
                               bodyText.includes('Checking your browser') || 
                               bodyText.includes('Verify you are human') ||
                               await executeWithTimeout('document.querySelector("#challenge-stage, .cf-turnstile") !== null');

          // Auto-click age gates and warnings
          await executeWithTimeout(`
            (function() {
              const buttons = document.querySelectorAll('button, a, input[type="submit"], input[type="button"]');
              for (let btn of buttons) {
                const text = (btn.innerText || btn.value || '').toLowerCase();
                if (text === 'i am 18' || text === 'i am 18+' || text === 'i am over 18' || 
                    text === 'enter' || text === 'accept' || text === 'agree' || 
                    text === 'yes' || text === 'continue' || text.includes('i am 18') || text.includes('18 and older')) {
                  
                  if (text.includes('search') || text.includes('login')) continue;
                  
                  const bodyText = document.body.innerText.toLowerCase();
                  if (bodyText.includes('18+') || bodyText.includes('adult') || bodyText.includes('warning') || bodyText.includes('age')) {
                    btn.click();
                    return true;
                  }
                }
              }
              return false;
            })();
          `);

          if (isCloudflare) {
            cloudflareTime += 1;
            
            // Auto-clear cookies if stuck in Cloudflare loop for 30 seconds
            if (cloudflareTime === 30 && !hasClearedCookies) {
               hasClearedCookies = true;
               console.log("Stuck in Cloudflare loop, clearing cookies...");
               if (onProgress) onProgress("Clearing cookies to bypass block...");
               try {
                 await session.fromPartition('persist:scraper').clearStorageData({ storages: ['cookies', 'serviceworkers', 'caches'] });
                 win.reload();
               } catch(e) {}
               if (!resolved) checkTimeout = setTimeout(checkPage, 2000);
               return;
            }
            
            lastState = `Cloudflare detected: title="${title}", bodyText.length=${bodyText.length}`;
            console.log(lastState);
            if (onProgress) onProgress(`Bypassing Cloudflare (${cloudflareTime}s)...`);
            if (!win.isVisible()) {
              win.show();
              win.focus();
              win.setTitle("Please wait or solve the captcha if necessary...");
            }
            if (!resolved) checkTimeout = setTimeout(checkPage, 1000);
            return; // Wait for next interval
          }
          
          // Ensure page has actually loaded some content (not just a blank page during redirect)
          const readyState = await executeWithTimeout('document.readyState');
          const imgCount = await executeWithTimeout('document.querySelectorAll("img").length');
          
          if (readyState === 'loading' || bodyText.length < 100 || title.trim() === '' || (imgCount === 0 && bodyText.length < 500)) {
            lastState = `Waiting for page load: readyState=${readyState}, bodyText.length=${bodyText.length}, title="${title}", imgCount=${imgCount}`;
            console.log(lastState);
            if (onProgress) onProgress(`Loading page (${timeElapsed}s)...`);
            if (timeElapsed > 5 && !win.isVisible()) {
              win.show();
              win.focus();
              win.setTitle("Loading page, please wait...");
            }
            if (!resolved) checkTimeout = setTimeout(checkPage, 1000);
            return; // Wait for next interval
          }
          
          // Success!
          try {
            if (onProgress) onProgress(`Extracting HTML...`);
            try { win.webContents.stop(); } catch(e) {} // Stop further loading to unblock renderer
            
            let html = '';
            let fetchSuccess = false;
            
            // 1. Try session fetch first (most reliable, immune to renderer freezes)
            try {
              const scraperSession = session.fromPartition('persist:scraper');
              const fetchController = new AbortController();
              const fetchTimeoutId = setTimeout(() => fetchController.abort(), 10000);
              
              const res = await scraperSession.fetch(url, {
                headers: {
                  'User-Agent': cleanUserAgent,
                  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
                },
                signal: fetchController.signal
              });
              
              const fetchTextPromise = res.text();
              const fetchedHtml = await Promise.race([
                fetchTextPromise,
                new Promise((_, reject) => setTimeout(() => reject(new Error('Text parsing timeout')), 5000))
              ]);
              
              clearTimeout(fetchTimeoutId);
              
              if (fetchedHtml && !fetchedHtml.includes('Just a moment') && !fetchedHtml.includes('Cloudflare') && !fetchedHtml.includes('Verify you are human')) {
                html = fetchedHtml;
                fetchSuccess = true;
              }
            } catch (fetchErr) {
              console.log("Primary session fetch failed:", fetchErr.message);
            }
            
            // 2. Fallback to executeJavaScript if fetch failed
            if (!fetchSuccess) {
              if (onProgress) onProgress(`Extracting HTML (fallback)...`);
              html = await executeWithTimeout('document.documentElement.outerHTML', 10000);
            }
            
            if (!resolved) {
              resolved = true;
              clearTimeout(checkTimeout);
              clearTimeout(timeout);
              if (!existingWin) { try { win.destroy(); } catch (e) {} }
              resolve(html);
            }
          } catch (innerError) {
            console.log("Error during HTML extraction:", innerError.message);
            if (onProgress) onProgress(`Retrying HTML extraction (${timeElapsed}s)...`);
            if (!resolved) checkTimeout = setTimeout(checkPage, 1000);
          }
        } catch (e) {
          // Ignore errors during execution, try again
          lastState = `Error in checkPage: ${e.message}`;
          console.error(lastState);
          if (onProgress) onProgress(`Waiting for window response (${timeElapsed}s)...`);
          if (!resolved) checkTimeout = setTimeout(checkPage, 1000);
        }
      };

      if (!existingWin) {
        win.on('closed', () => {
          if (!resolved) {
            resolved = true;
            clearTimeout(checkTimeout);
            clearTimeout(timeout);
            reject(new Error("Cloudflare window closed by user"));
          }
        });
      }

      const startLoad = async () => {
        try {
          checkTimeout = setTimeout(checkPage, 1000);
          
          await win.loadURL(url, {
            userAgent: cleanUserAgent
          });
        } catch (e) {
          if (e.code !== 'ERR_ABORTED' && (!e.message || !e.message.includes('ERR_ABORTED'))) {
            if (!resolved) {
              resolved = true;
              if (typeof checkTimeout !== 'undefined') clearTimeout(checkTimeout);
              clearTimeout(timeout);
              if (!existingWin) { try { win.destroy(); } catch (err) {} }
              reject(e);
            }
          }
        }
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
      activeElectronScrapers++;
      try {
        const result = await executeFetch();
        resolve(result);
      } catch (e) {
        reject(e);
      } finally {
        activeElectronScrapers--;
        if (electronScraperQueue.length > 0) {
          const nextTask = electronScraperQueue.shift();
          nextTask();
        }
      }
    };

    if (activeElectronScrapers < maxConcurrentScrapers) {
      task();
    } else {
      if (onProgress) onProgress("Queued for scraping...");
      electronScraperQueue.push(task);
    }
  });
}

// Helper function to fetch with a strict timeout to prevent hanging, using Electron session for cookies
async function safeGet(url, config = {}, taskState = null, onProgress = null, existingWin = null) {
  if (taskState && taskState.isCancelled) throw new Error("Cancelled by user");
  if (onProgress) onProgress("Fetching HTML (safe fallback)...");
  
  const controller = new AbortController();
  if (taskState && taskState.controllers) taskState.controllers.push(controller);
  const timeoutId = setTimeout(() => controller.abort(), 20000); // 20 seconds strict timeout
  
  try {
    const scraperSession = session.fromPartition('persist:scraper');
    const defaultUserAgent = session.defaultSession.getUserAgent();
    const cleanUserAgent = defaultUserAgent.replace(/SnapCBZ\/[0-9\.]+\s*/, '').replace(/Electron\/[0-9\.]+\s*/, '');
    
    const fetchOptions = {
      headers: {
        'User-Agent': cleanUserAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'max-age=0',
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        ...(config.headers || {})
      },
      signal: controller.signal
    };

    const fetchPromise = scraperSession.fetch(url, fetchOptions);
    
    const res = await Promise.race([
      fetchPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Fetch timeout')), 20000))
    ]);
    
    if (taskState && taskState.controllers) {
      const idx = taskState.controllers.indexOf(controller);
      if (idx > -1) taskState.controllers.splice(idx, 1);
    }
    
    clearTimeout(timeoutId);
    
    if (!res.ok) {
      const error = new Error(`HTTP error! status: ${res.status}`);
      error.response = { status: res.status };
      throw error;
    }
    
    const contentType = res.headers.get('content-type') || '';
    let data;
    
    const parsePromise = contentType.includes('application/json') ? res.json() : res.text();
    data = await Promise.race([
      parsePromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Data parsing timeout')), 20000))
    ]);
    
    // Check for Cloudflare block in the response
    const isCloudflareBlock = res.status === 403 || res.status === 503 || 
                              (typeof data === 'string' && (
                                data.includes('Just a moment') || 
                                (data.includes('Cloudflare') && data.includes('Ray ID')) || 
                                data.includes('Verify you are human') ||
                                data.includes('Checking your browser') ||
                                data.includes('cf-browser-verification') ||
                                data.includes('cf-turnstile') ||
                                data.includes('challenge-stage')
                              ));

    if (isCloudflareBlock) {
      const html = await fetchHtmlWithElectron(url, existingWin, taskState, onProgress);
      return { data: html, status: 200, headers: res.headers };
    }

    return { data, status: res.status, headers: res.headers };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.response && (err.response.status === 403 || err.response.status === 503)) {
      try {
        const html = await fetchHtmlWithElectron(url, existingWin, taskState, onProgress);
        return { data: html, status: 200, headers: new Headers() };
      } catch (cfError) {
        throw cfError;
      }
    }
    throw err;
  }
}

export async function fetchGalleryLinks(url, taskId = null, settings = {}, onProgress = null) {
  let scraperWin = null;
  const taskState = { isCancelled: false, controllers: [], scraperWin: null };
  if (taskId) activeTasks.set(taskId, taskState);

  try {
    const checkCancelled = () => {
      if (taskState.isCancelled) throw new Error("Scraping cancelled by user");
    };

    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    const links = [];

    // Auto-login if credentials exist
    if (settings && settings.accounts && settings.accounts.length > 0) {
      const account = settings.accounts.find(acc => {
        try { return hostname.includes(new URL(acc.url).hostname); } catch(e) { return false; }
      });
      if (account) {
        try {
          if (onProgress) onProgress("Logging in...");
          await autoLogin(account.url, account.username, account.password);
        } catch (e) {
          console.error("Auto-login failed:", e);
        }
      }
    }

    if (hostname.includes('imhentai.xxx')) {
      // If it's an artist/tag/search/group/parody/character page, get all gallery links
      if (url.includes('/artist/') || url.includes('/tag/') || url.includes('/search/') || url.includes('/group/') || url.includes('/parody/') || url.includes('/character/')) {
        let currentUrl = url;
        let pagesFetched = 0;
        const visitedUrls = new Set();
        
        const defaultUserAgent = session.defaultSession.getUserAgent();
        const cleanUserAgent = defaultUserAgent.replace(/SnapCBZ\/[0-9\.]+\s*/, '').replace(/Electron\/[0-9\.]+\s*/, '');
        
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
        taskState.scraperWin = scraperWin;
        scraperWin.webContents.userAgent = cleanUserAgent;

        while (currentUrl && pagesFetched < 50) {
          checkCancelled();
          if (visitedUrls.has(currentUrl)) break;
          visitedUrls.add(currentUrl);
          
          if (onProgress) onProgress(`Scraping links (page ${pagesFetched + 1})...`);
          let html = '';
          try {
            html = await fetchHtmlWithElectron(currentUrl, scraperWin, taskState, onProgress);
          } catch (e) {
            console.log(`fetchHtmlWithElectron failed for ${currentUrl}, falling back to safeGet:`, e.message);
            const res = await safeGet(currentUrl, {}, taskState, onProgress, scraperWin);
            html = res.data;
          }
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
                           $('a.page-link:contains("»")').attr('href') ||
                           $('a.page-link:contains("Next")').attr('href');
                           
          if (found > 0 && nextHref && !nextHref.includes('javascript:') && nextHref !== '#') {
            const nextUrl = new URL(nextHref, currentUrl).href;
            if (nextUrl === currentUrl) break; // Prevent infinite loop on same page
            currentUrl = nextUrl;
            pagesFetched++;
          } else {
            if (found === 0 && pagesFetched === 0) {
              const title = $('title').text().trim();
              const bodySnippet = $('body').text().replace(/\s+/g, ' ').trim().substring(0, 100);
              throw new Error(`No links found. Title: "${title}". Content: "${bodySnippet}"`);
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
          
          if (onProgress) onProgress(`Scraping links (page ${pagesFetched + 1})...`);
          let html = '';
          try {
            html = await fastFetchHtml(currentUrl, null, taskState, onProgress);
          } catch (e) {
            const res = await safeGet(currentUrl, {}, taskState, onProgress, null);
            html = res.data;
          }
          const $ = cheerio.load(html);
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
              throw new Error(`No links found. Title: "${title}". Content: "${bodySnippet}"`);
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
        
        const defaultUserAgent = session.defaultSession.getUserAgent();
        const cleanUserAgent = defaultUserAgent.replace(/SnapCBZ\/[0-9\.]+\s*/, '').replace(/Electron\/[0-9\.]+\s*/, '');
        
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
        taskState.scraperWin = scraperWin;
        scraperWin.webContents.userAgent = cleanUserAgent;

        while (currentUrl && pagesFetched < 50) {
          checkCancelled();
          if (visitedUrls.has(currentUrl)) break;
          visitedUrls.add(currentUrl);
          
          if (onProgress) onProgress(`Scraping links (page ${pagesFetched + 1})...`);
          let html = '';
          try {
            html = await fastFetchHtml(currentUrl, scraperWin, taskState, onProgress);
          } catch (e) {
            console.log(`fastFetchHtml failed for ${currentUrl}, falling back to safeGet:`, e.message);
            if (e.message.includes('Cloudflare bypass')) throw e;
            const res = await safeGet(currentUrl, {}, taskState, onProgress, scraperWin);
            html = res.data;
          }
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
              throw new Error(`No links found. Title: "${title}". Content: "${bodySnippet}"`);
            }
            currentUrl = null;
          }
        }
      }
    } else if (settings.enableManhwa !== false) {
      // Generic Manhwa/Webtoon chapter extraction
      try {
        let html = '';
        try {
          html = await fastFetchHtml(url, null, taskState, onProgress);
        } catch (e) {
          console.log(`fastFetchHtml failed for ${url}, falling back to safeGet:`, e.message);
          if (e.message.includes('Cloudflare bypass')) throw e;
          const res = await safeGet(url, {}, taskState, onProgress, null);
          html = res.data;
        }
        const $ = cheerio.load(html);
        
        // Check if it's already a chapter page (has images in common reader containers)
        const isChapterPage = $('.reading-content img, .page-break img, #vungdoc img, .vung_doc img, .container-chapter img, #readerarea img, .chapter-video-frame img, .chapter-content img, .entry-content img').length > 0;
        
        if (!isChapterPage) {
          // Common selectors for chapter links on Manhwa sites
          const chapterSelectors = [
            '.wp-manga-chapter a',
            'li.wp-manga-chapter a',
            '.chapter-list a',
            '.listing-chapters_wrap a',
            '.chbox a',
            '.chapter-title-rtl a',
            'div.chapter-list a',
            'ul.main.version-chap li a',
            '.eplister ul li a',
            '#chapterlist .eph-num a',
            '.clstyle li a',
            '.lchx a',
            '.chapter-link',
            '.list-chapters a',
            'ul.chapters li a',
            '.episodelist ul li a',
            '#chapter-list a',
            '.chapters-list a',
            '.chapters-wrapper a',
            '.chapter-item a',
            '.chap-list a',
            'ul.chap_list li a',
            '.list-chap a',
            '.chapter-wrap a',
            '.chapter-class a',
            '.chapter-name a',
            'a.chapter',
            'a[href*="chapter-"]',
            'a[href*="/chapter/"]',
            'a[href*="/chapitre-"]',
            'a[href*="/ch-"]',
            'a[href*="/c-"]',
            '.version-chap a'
          ];
          
          let foundChapters = [];
          for (const selector of chapterSelectors) {
            $(selector).each((i, el) => {
              const href = $(el).attr('href');
              if (href && !href.includes('javascript:') && href !== '#') {
                const lowerHref = href.toLowerCase();
                const lowerText = $(el).text().toLowerCase();
                
                // Filter out obvious non-chapter links that might be in the list
                if (lowerHref.includes('/download') || lowerHref.includes('/report') || lowerHref.includes('discord.gg') || lowerHref.includes('facebook.com') || lowerHref.includes('twitter.com')) {
                  return; // Skip
                }
                
                // If the selector is very generic, ensure the text or href looks like a chapter
                if (selector.includes('href*=')) {
                  if (!lowerText.includes('chap') && !lowerText.includes('ch.') && !lowerText.match(/\d+/) && !lowerHref.match(/chap(ter|itre)?[-_]?\d+/)) {
                    return; // Skip if it doesn't look like a chapter
                  }
                }
                
                foundChapters.push(new URL(href, url).href);
              }
            });
          }
          
          // If no chapters found, try with Electron to execute JS
          if (foundChapters.length === 0 && !isChapterPage) {
            if (onProgress) onProgress("Executing JavaScript to find chapters...");
            try {
              const jsHtml = await fetchHtmlWithElectron(url, null, taskState, onProgress);
              const $js = cheerio.load(jsHtml);
              for (const selector of chapterSelectors) {
                $js(selector).each((i, el) => {
                  const href = $js(el).attr('href');
                  if (href && !href.includes('javascript:') && href !== '#') {
                    const lowerHref = href.toLowerCase();
                    const lowerText = $js(el).text().toLowerCase();
                    if (lowerHref.includes('/download') || lowerHref.includes('/report') || lowerHref.includes('discord.gg') || lowerHref.includes('facebook.com') || lowerHref.includes('twitter.com')) {
                      return; // Skip
                    }
                    if (selector.includes('href*=')) {
                      if (!lowerText.includes('chap') && !lowerText.includes('ch.') && !lowerText.match(/\d+/) && !lowerHref.match(/chap(ter|itre)?[-_]?\d+/)) {
                        return; // Skip if it doesn't look like a chapter
                      }
                    }
                    foundChapters.push(new URL(href, url).href);
                  }
                });
              }
            } catch (e) {
              console.log("Failed to extract chapters with Electron:", e);
            }
          }

          if (foundChapters.length > 0) {
            foundChapters = [...new Set(foundChapters)];
            // Usually chapters are listed from newest to oldest, so we reverse them to download in order
            foundChapters.reverse();
            links.push(...foundChapters);
            // Remove the main page URL from the links list if we found chapters
            if (links[0] === url) {
              links.shift();
            }
          }
        }
      } catch (e) {
        console.error("Generic Manhwa chapter extraction failed:", e);
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
  } finally {
    if (taskState && taskState.scraperWin && !taskState.scraperWin.isDestroyed()) {
      try { taskState.scraperWin.destroy(); } catch (e) {}
    }
    if (taskId) activeTasks.delete(taskId);
  }
}

export async function startDownload(task, win, settings) {
  const defaultUserAgent = session.defaultSession.getUserAgent();
  const cleanUserAgent = defaultUserAgent.replace(/SnapCBZ\/[0-9\.]+\s*/, '').replace(/Electron\/[0-9\.]+\s*/, '');
  
  const taskState = { isCancelled: false, controllers: [] };
  activeTasks.set(task.id, taskState);

  try {
    const checkCancelled = () => {
      if (taskState.isCancelled) throw new Error("Download cancelled by user");
    };

    const { id, url, type, category, language, copyright, character } = task;
    
    win.webContents.send('download-progress', { id, status: 'scraping', progress: 0, filename: "Scraping site..." });
    
    let imageUrls = [];
    let title = 'Gallery';
    let extractedArtist = category; // Start with what we got from the URL
    let extractedLanguage = language; // Start with what we got from the URL
    let isManhwa = false;
    
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;

    let scraperWin = null;
    if (hostname.includes('imhentai.xxx') || hostname.includes('3hentai.net')) {
      scraperWin = new BrowserWindow({
        show: false,
        width: 800,
        height: 600,
        webPreferences: {
          partition: 'persist:scraper',
          nodeIntegration: false,
          contextIsolation: true,
          webSecurity: true
        }
      });
      taskState.scraperWin = scraperWin;
      scraperWin.webContents.userAgent = cleanUserAgent;
    }

    // Auto-login if credentials exist
    if (settings.accounts && settings.accounts.length > 0) {
      const account = settings.accounts.find(acc => {
        try { return hostname.includes(new URL(acc.url).hostname); } catch(e) { return false; }
      });
      if (account) {
        try {
          win.webContents.send('download-progress', { id, status: 'scraping', progress: 0, filename: "Logging in..." });
          await autoLogin(account.url, account.username, account.password);
        } catch (e) {
          console.error("Auto-login failed:", e);
        }
        win.webContents.send('download-progress', { id, status: 'scraping', progress: 0, filename: "Scraping site..." });
      }
    }

    try {
      checkCancelled();
      if (hostname.includes('rule34.xxx')) {
        const tags = urlObj.searchParams.get('tags') || '';
        const apiRes = await safeGet(`https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&tags=${tags}&json=1&limit=100`, {}, taskState, (msg) => win.webContents.send('download-progress', { id, status: 'scraping', progress: 0, filename: msg }), null);
        if (apiRes.data && Array.isArray(apiRes.data)) {
          imageUrls = apiRes.data.map(p => p.file_url);
        }
      } else if (hostname.includes('gelbooru.com')) {
        const tags = urlObj.searchParams.get('tags') || '';
        const apiRes = await safeGet(`https://gelbooru.com/index.php?page=dapi&s=post&q=index&tags=${tags}&json=1&limit=100`, {}, taskState, (msg) => win.webContents.send('download-progress', { id, status: 'scraping', progress: 0, filename: msg }), null);
        if (apiRes.data && apiRes.data.post) {
          imageUrls = apiRes.data.post.map(p => p.file_url);
        }
      } else if (hostname.includes('rule34.paheal.net')) {
        const res = await safeGet(url, {}, taskState, (msg) => win.webContents.send('download-progress', { id, status: 'scraping', progress: 0, filename: msg }), null);
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
            const html = await fastFetchHtml(url, null, taskState, (msg) => win.webContents.send('download-progress', { id, status: 'scraping', progress: 0, filename: msg }));
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
            throw new Error(`Error parsing nhentai.net: ${apiError.message}`);
          }
        }
      } else if (hostname.includes('3hentai.net')) {
        let html = '';
        try {
          html = await fastFetchHtml(url, null, taskState, (msg) => win.webContents.send('download-progress', { id, status: 'scraping', progress: 0, filename: msg }));
        } catch (e) {
          const res = await safeGet(url, {}, taskState, (msg) => win.webContents.send('download-progress', { id, status: 'scraping', progress: 0, filename: msg }), null);
          html = res.data;
        }
        const $ = cheerio.load(html);
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
        if (!url.includes('/gallery/')) {
          throw new Error("This looks like an artist or tag page. Please use the 'Fetch Gallery Links' button to download multiple galleries.");
        }
        
        let html = '';
        try {
          // For imhentai, directly use Electron window to ensure we bypass any advanced protections
          html = await fetchHtmlWithElectron(url, scraperWin, taskState, (msg) => win.webContents.send('download-progress', { id, status: 'scraping', progress: 0, filename: msg }));
        } catch (e) {
          console.log(`fetchHtmlWithElectron failed for ${url}, falling back to safeGet:`, e.message);
          const res = await safeGet(url, {}, taskState, (msg) => win.webContents.send('download-progress', { id, status: 'scraping', progress: 0, filename: msg }), scraperWin);
          html = res.data;
        }
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

        // Extract base URL from hidden inputs first (most reliable)
        const loadServer = $('#load_server').val() || $('#server').val() || $('#image_server').val();
        const loadDir = $('#load_dir').val() || $('#dir').val() || $('#image_dir').val();
        
        const loadPages = parseInt($('#load_pages').val() || $('#pages').val() || '0', 10);
        
        let baseUrl = '';
        if (loadServer && loadDir) {
          // e.g. server="m3", dir="123456" -> https://m3.imhentai.xxx/123456
          // Wait, sometimes dir includes the subfolder, sometimes it's just the ID.
          // Let's check the thumbnail to be sure about the path structure.
        }

        // Extract base URL from the first thumbnail
        const firstThumb = $('.gthumb img').first().attr('data-src') || $('.gthumb img').first().attr('src');
        if (firstThumb) {
          const baseUrlMatch = firstThumb.match(/(https?:)?(\/\/[a-z0-9]+\.imhentai\.xxx\/.*)\/[0-9]+t?\.[a-z]+$/i);
          if (baseUrlMatch) {
            baseUrl = (baseUrlMatch[1] || 'https:') + baseUrlMatch[2];
            // IMHentai uses t1, t2 for thumbnails and m1, m2 for images
            baseUrl = baseUrl.replace(/\/\/t([0-9]*)\.imhentai\.xxx/, '//m$1.imhentai.xxx');
          }
        }
        
        // If we still don't have a baseUrl but we have loadServer and loadDir
        if (!baseUrl && loadServer && loadDir) {
           baseUrl = `https://${loadServer}.imhentai.xxx/${loadDir}`;
        }

        // Extract the g_th JSON which contains the extensions for each page
        // Format: {"1":"w,1074,1516", "2":"j,1075,1518", ...}
        // w = .webp, j = .jpg, p = .png, g = .gif
        let gTh = {};
        const htmlContent = $.html();
        const gThMatch = htmlContent.match(/var\s+g_th\s*=\s*\$\.parseJSON\(['"](.*?)['"]\)/);
        if (gThMatch) {
          try {
            // IMHentai escapes quotes in the JSON string: '{\"1\":[\"j\",1074,1516]}'
            const unescapedJson = gThMatch[1].replace(/\\"/g, '"');
            gTh = JSON.parse(unescapedJson);
          } catch (e) {
            console.error("Failed to parse g_th JSON", e);
          }
        } else {
          // Try alternative format if they stopped using $.parseJSON
          const gThDirectMatch = htmlContent.match(/var\s+g_th\s*=\s*(\{[\s\S]*?\});/);
          if (gThDirectMatch) {
            try {
              gTh = JSON.parse(gThDirectMatch[1]);
            } catch (e) {
              console.error("Failed to parse direct g_th JSON", e);
            }
          }
        }

        const totalPages = Object.keys(gTh).length || loadPages;
        if (totalPages > 0 && baseUrl) {
          for (let i = 1; i <= totalPages; i++) {
            let extCode = 'j';
            if (gTh[i]) {
              if (Array.isArray(gTh[i])) {
                extCode = gTh[i][0];
              } else if (typeof gTh[i] === 'string') {
                extCode = gTh[i].split(',')[0];
              }
            }
            
            let imageExt = '.jpg';
            if (extCode === 'w') imageExt = '.webp';
            else if (extCode === 'p') imageExt = '.png';
            else if (extCode === 'g') imageExt = '.gif';
            
            const realSrc = `${baseUrl}/${i}${imageExt}`;
            imageUrls.push(realSrc);
          }
        } else {
          // Fallback if g_th or baseUrl fails
          $('.gthumb img, .thumb img, .gallery_thumb img').each((i, el) => {
            let src = $(el).attr('data-src') || $(el).attr('src');
            if (src) {
              // Convert thumbnail URL to full image URL
              let realSrc = src.replace(/([0-9]+)t\.([a-z]+)$/i, '$1.$2');
              realSrc = realSrc.replace(/\/\/t([0-9]*)\.imhentai\.xxx/, '//m$1.imhentai.xxx');
              imageUrls.push(realSrc);
            }
          });
          
          // If still no images, try to find them in the gallery container
          if (imageUrls.length === 0) {
            $('.gallery_content img, #append_image img, .image-container img').each((i, el) => {
              let src = $(el).attr('data-src') || $(el).attr('src');
              if (src) {
                const realSrc = src.replace(/([0-9]+)t\.([a-z]+)$/i, '$1.$2');
                imageUrls.push(realSrc);
              }
            });
          }
        }
      } else {
        // Generic Fallback for Manhwa / Manga / Webtoon sites
        if (settings.enableManhwa === false) {
          throw new Error("Manhwa/Webtoon support is disabled in settings.");
        }
        
        isManhwa = true;
        
        try {
          let html = '';
          try {
            html = await fastFetchHtml(url, null, taskState, (msg) => win.webContents.send('download-progress', { id, status: 'scraping', progress: 0, filename: msg }));
          } catch (e) {
            console.log(`fastFetchHtml failed for ${url}, falling back to safeGet:`, e.message);
            if (e.message.includes('Cloudflare bypass')) throw e;
            const res = await safeGet(url, {}, taskState, (msg) => win.webContents.send('download-progress', { id, status: 'scraping', progress: 0, filename: msg }), scraperWin);
            html = res.data;
          }
          const $ = cheerio.load(html);
          
          title = $('title').text().trim() || 'Chapter';
          
          // Try to extract manga name from title (usually "Manga Name - Chapter X")
          let titleParts = title.split('-');
          let separator = '-';
          if (titleParts.length === 1) {
            titleParts = title.split('|');
            separator = '|';
          }
          
          if (titleParts.length > 1) {
            extractedArtist = titleParts[0].trim();
            // Try to find the part containing "Chapter" or "Chapitre"
            const chapterPart = titleParts.slice(1).find(part => part.toLowerCase().includes('chapter') || part.toLowerCase().includes('chapitre') || part.toLowerCase().includes('chap'));
            if (chapterPart) {
              title = chapterPart.trim();
            } else {
              title = titleParts.slice(1).join(separator).trim();
            }
          }
          
          // Pad chapter numbers with zeros so they sort correctly (e.g., "Chapter 1" -> "Chapter 001")
          title = title.replace(/\b(\d+)\b/g, (match) => match.padStart(3, '0'));
          
          // Common manhwa/manga reader image selectors (Madara theme, etc.)
          const selectors = [
            '.reading-content img',
            '.page-break img',
            '#vungdoc img',
            '.vung_doc img',
            '.container-chapter img',
            '#readerarea img',
            '.chapter-video-frame img',
            '.chapter-content img',
            '.entry-content img'
          ];
          
          for (const selector of selectors) {
            $(selector).each((i, el) => {
              let src = $(el).attr('data-src') || $(el).attr('data-lazy-src') || $(el).attr('src') || $(el).attr('data-original');
              if (src && !src.includes('data:image/gif') && !src.includes('blank.gif') && !src.includes('logo')) {
                // Handle relative URLs
                if (src.startsWith('//')) src = 'https:' + src;
                else if (src.startsWith('/')) src = urlObj.origin + src;
                imageUrls.push(src.trim());
              }
            });
            if (imageUrls.length > 0) break;
          }
          
          if (imageUrls.length === 0) {
            throw new Error("No chapter images found. This might be a main page instead of a chapter, or the site is not supported.");
          }
        } catch (e) {
          console.error("Generic scraper failed, might need Cloudflare bypass", e);
          throw e; // Re-throw to prevent generic fallback
        }
      }
    } catch (scrapeError) {
      console.error("Scraping specific error:", scrapeError.message);
      if (scrapeError.response && scrapeError.response.status === 403) {
        throw new Error(`Access denied (Error 403). The site ${hostname} uses Cloudflare protection which blocks the application.`);
      }
      throw scrapeError;
    }

    // Generic fallback
    if (imageUrls.length === 0) {
      let html = '';
      if (hostname.includes('nhentai.net')) {
        html = await fastFetchHtml(url, null, taskState, (msg) => win.webContents.send('download-progress', { id, status: 'scraping', progress: 0, filename: msg }));
      } else if (!hostname.includes('imhentai.xxx')) {
        try {
          html = await fastFetchHtml(url, null, taskState, (msg) => win.webContents.send('download-progress', { id, status: 'scraping', progress: 0, filename: msg }));
        } catch (e) {
          console.log(`fastFetchHtml failed for ${url}, falling back to safeGet:`, e.message);
          if (e.message.includes('Cloudflare bypass')) throw e;
          const response = await safeGet(url, {}, taskState, (msg) => win.webContents.send('download-progress', { id, status: 'scraping', progress: 0, filename: msg }), scraperWin);
          html = response.data;
        }
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
      if (html && (html.includes('captcha') || html.includes('Cloudflare') || html.includes('DDoS') || html.includes('Just a moment'))) {
        throw new Error("Cannot download images. The site blocks access or requires a Referer.");
      }
      throw new Error("No images found on this page.");
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
      let processedCount = 0;
      
      const downloadImage = async (imgUrl, i) => {
        checkCancelled();
        let success = false;
        let retries = 3;
        let fileName = "Initializing...";
        
        while (retries >= 0 && !success && !taskState.isCancelled) {
          let controller;
          try {
            let nameWithoutExt = '';
            let originalBaseFileName = '';
            
            if (!imgUrl.startsWith('data:image/')) {
              const urlPath = new URL(imgUrl).pathname;
              originalBaseFileName = path.basename(urlPath);
              
              // Fallback if no proper filename in URL
              if (!originalBaseFileName || !originalBaseFileName.includes('.')) {
                nameWithoutExt = `image_${String(i + 1).padStart(3, '0')}`;
              } else {
                const ext = path.extname(originalBaseFileName);
                nameWithoutExt = path.basename(originalBaseFileName, ext);
              }
            } else {
              nameWithoutExt = `image_${String(i + 1).padStart(3, '0')}`;
            }
            
            // Resume support: check if file already exists with any valid image extension
            if (retries === 3) {
              const files = await fs.readdir(saveDir).catch(() => []);
              const existingFile = files.find(f => {
                const fExt = path.extname(f);
                const fName = path.basename(f, fExt);
                return fName === nameWithoutExt && ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'].includes(fExt.toLowerCase());
              });
              
              if (existingFile) {
                const stats = await fs.stat(path.join(saveDir, existingFile));
                if (stats.size > 0) {
                  downloadedCount++;
                  success = true;
                  break;
                }
              }
            }

            if (imgUrl.startsWith('data:image/')) {
              const matches = imgUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
              if (matches && matches.length === 3) {
                let ext = '.' + matches[1].replace('jpeg', 'jpg');
                const finalBaseFileName = `${nameWithoutExt}${ext}`;
                const filePath = path.join(saveDir, finalBaseFileName);
                await fs.writeFile(filePath, Buffer.from(matches[2], 'base64'));
                downloadedCount++;
                success = true;
                break;
              } else {
                throw new Error('Invalid base64 image data');
              }
            }

            let currentExt = path.extname(originalBaseFileName) || '.jpg';
            if (currentExt.toLowerCase() === '.html' || currentExt.toLowerCase() === '.htm') {
              currentExt = '.jpg';
            }

            if (retries < 3) {
              fileName = `${nameWithoutExt} (Retry ${3 - retries}/3)${currentExt}`;
            } else {
              fileName = `${nameWithoutExt}${currentExt}`;
            }
            
            // Send progress update to show which file is currently being downloaded/retried
            win.webContents.send('download-progress', { 
              id, 
              status: 'downloading_images',
              progress: (processedCount / totalImages) * 100, 
              downloadedCount,
              currentFile: fileName
            });

            controller = new AbortController();
            taskState.controllers.push(controller);
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 seconds strict timeout
            
            const headers = { 
              'Referer': url,
              'User-Agent': cleanUserAgent,
              'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9',
              'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
              'Sec-Ch-Ua-Mobile': '?0',
              'Sec-Ch-Ua-Platform': '"Windows"',
              'Sec-Fetch-Dest': 'image',
              'Sec-Fetch-Mode': 'no-cors',
              'Sec-Fetch-Site': 'cross-site'
            };
            if (cookieString) {
              headers['Cookie'] = cookieString;
            }
            
            const fetchPromise = session.fromPartition('persist:scraper').fetch(imgUrl, { 
              headers,
              signal: controller.signal
            }).catch(() => {});
            
            const imgRes = await Promise.race([
              fetchPromise,
              new Promise((_, reject) => setTimeout(() => reject(new Error('Fetch timeout')), 10000))
            ]);
            
            if (!imgRes || !imgRes.ok) {
              clearTimeout(timeoutId);
              throw new Error(`HTTP error! status: ${imgRes ? imgRes.status : 'unknown'}`);
            }
            
            const contentType = (imgRes.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('text/html')) {
              clearTimeout(timeoutId);
              throw new Error('Server returned HTML instead of an image (possible Cloudflare block or invalid link)');
            }
            
            let finalExt = currentExt;
            if (contentType.includes('image/jpeg')) finalExt = '.jpg';
            else if (contentType.includes('image/png')) finalExt = '.png';
            else if (contentType.includes('image/webp')) finalExt = '.webp';
            else if (contentType.includes('image/avif')) finalExt = '.avif';
            else if (contentType.includes('image/gif')) finalExt = '.gif';
            
            const finalBaseFileName = `${nameWithoutExt}${finalExt}`;
            const filePath = path.join(saveDir, finalBaseFileName);
            
            const bufferPromise = imgRes.arrayBuffer().catch(() => {});
            const arrayBuffer = await Promise.race([
              bufferPromise,
              new Promise((_, reject) => setTimeout(() => reject(new Error('Body download timeout')), 10000))
            ]);
            clearTimeout(timeoutId);
            
            if (!arrayBuffer) throw new Error('Empty buffer');
            
            await fs.writeFile(filePath, Buffer.from(arrayBuffer));
            downloadedCount++;
            success = true;
          } catch (err) {
            if (controller) controller.abort();
            console.error(`Failed to download image ${imgUrl}:`, err.message);
            if (retries > 0 && !taskState.isCancelled) {
              console.log(`Retrying download for ${imgUrl} (${retries} retries left)...`);
              await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s before retry
            }
          } finally {
            if (controller) {
              const idx = taskState.controllers.indexOf(controller);
              if (idx > -1) taskState.controllers.splice(idx, 1);
            }
          }
          retries--;
        }
        
        // After all retries or success, increment processedCount
        processedCount++;
        
        const now = Date.now();
        if (!taskState.lastProgressTime) taskState.lastProgressTime = 0;
        
        if (now - taskState.lastProgressTime > 100 || processedCount === totalImages) {
          taskState.lastProgressTime = now;
          win.webContents.send('download-progress', { 
            id, 
            status: 'downloading_images',
            progress: (processedCount / totalImages) * 100, 
            downloadedCount,
            currentFile: fileName
          });
        }
      };

      const workers = [];
      let index = 0;
      const worker = async () => {
        while (index < uniqueImages.length) {
          const currentIndex = index++;
          await downloadImage(uniqueImages[currentIndex], currentIndex);
        }
      };
      
      for (let i = 0; i < Math.min(5, uniqueImages.length); i++) {
        workers.push(worker());
      }
      
      await Promise.all(workers);
      
      if (downloadedCount === 0) {
        throw new Error("Cannot download images. The site blocks access or requires a Referer.");
      }
      
      win.webContents.send('download-progress', { 
        id, 
        status: 'completed', 
        progress: 100, 
        finalPath: saveDir 
      });
      
    } else {
      // CBZ Mode
      
      // Clean up the category/artist name for the folder
      const cleanCategory = (extractedArtist || 'Misc').replace(/[<>:"/\\|?*]+/g, '').trim();
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

      let baseDir = settings.directories[extractedLanguage] || settings.directories.other || path.join(app.getPath('downloads'), 'SnapCBZ', 'CBZ');
      
      if (isManhwa && settings.manhwaDirectory) {
        baseDir = settings.manhwaDirectory;
      }
      
      saveDir = path.join(baseDir, cleanCategory);
      await fs.ensureDir(saveDir);
      
      finalFilename = `${title}.cbz`;
      const finalPath = path.join(saveDir, finalFilename);
      
      const tempDir = path.join(app.getPath('temp'), 'snapcbz', id);
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
      let processedCount = 0;
      
      const downloadImage = async (imgUrl, i) => {
        checkCancelled();
        let success = false;
        let retries = 3;
        let fileName = `page_${String(i + 1).padStart(3, '0')}.jpg`;
        
        while (retries >= 0 && !success && !taskState.isCancelled) {
          let controller;
          try {
            const nameWithoutExt = `page_${String(i + 1).padStart(3, '0')}`;
            
            // Resume support: check if file already exists in temp directory
            if (retries === 3) {
              const files = await fs.readdir(tempDir).catch(() => []);
              const existingFile = files.find(f => {
                const fExt = path.extname(f);
                const fName = path.basename(f, fExt);
                return fName === nameWithoutExt && ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'].includes(fExt.toLowerCase());
              });
              
              if (existingFile) {
                const stats = await fs.stat(path.join(tempDir, existingFile));
                if (stats.size > 0) {
                  downloadedCount++;
                  success = true;
                  break;
                }
              }
            }

            if (imgUrl.startsWith('data:image/')) {
              const matches = imgUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
              if (matches && matches.length === 3) {
                let ext = '.' + matches[1].replace('jpeg', 'jpg');
                const finalBaseFileName = `${nameWithoutExt}${ext}`;
                const filePath = path.join(tempDir, finalBaseFileName);
                await fs.writeFile(filePath, Buffer.from(matches[2], 'base64'));
                downloadedCount++;
                success = true;
                break;
              } else {
                throw new Error('Invalid base64 image data');
              }
            }

            let currentExt = path.extname(new URL(imgUrl).pathname) || '.jpg';
            if (currentExt.toLowerCase() === '.html' || currentExt.toLowerCase() === '.htm') {
              currentExt = '.jpg';
            }

            if (retries < 3) {
              fileName = `${nameWithoutExt} (Retry ${3 - retries}/3)${currentExt}`;
            } else {
              fileName = `${nameWithoutExt}${currentExt}`;
            }
            
            // Send progress update to show which file is currently being downloaded/retried
            win.webContents.send('download-progress', { 
              id, 
              status: 'downloading_images',
              downloadedCount,
              totalImages,
              progress: 10 + ((processedCount / totalImages) * 70),
              currentFile: fileName
            });

            controller = new AbortController();
            taskState.controllers.push(controller);
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 seconds strict timeout
            
            const headers = { 
              'Referer': new URL(url).origin + '/',
              'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9',
              'User-Agent': cleanUserAgent,
              'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
              'Sec-Ch-Ua-Mobile': '?0',
              'Sec-Ch-Ua-Platform': '"Windows"',
              'Sec-Fetch-Dest': 'image',
              'Sec-Fetch-Mode': 'no-cors',
              'Sec-Fetch-Site': 'cross-site'
            };
            if (cookieString) {
              headers['Cookie'] = cookieString;
            }
            
            const fetchPromise = session.fromPartition('persist:scraper').fetch(imgUrl, { 
              headers,
              signal: controller.signal
            }).catch(() => {});
            
            const imgRes = await Promise.race([
              fetchPromise,
              new Promise((_, reject) => setTimeout(() => reject(new Error('Fetch timeout')), 10000))
            ]);
            
            if (!imgRes || !imgRes.ok) {
              clearTimeout(timeoutId);
              throw new Error(`HTTP error! status: ${imgRes ? imgRes.status : 'unknown'}`);
            }
            
            const contentType = (imgRes.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('text/html')) {
              clearTimeout(timeoutId);
              throw new Error('Server returned HTML instead of an image (possible Cloudflare block or invalid link)');
            }
            
            let finalExt = currentExt;
            if (contentType.includes('image/jpeg')) finalExt = '.jpg';
            else if (contentType.includes('image/png')) finalExt = '.png';
            else if (contentType.includes('image/webp')) finalExt = '.webp';
            else if (contentType.includes('image/avif')) finalExt = '.avif';
            else if (contentType.includes('image/gif')) finalExt = '.gif';
            
            const finalBaseFileName = `${nameWithoutExt}${finalExt}`;
            const filePath = path.join(tempDir, finalBaseFileName);
            
            const bufferPromise = imgRes.arrayBuffer().catch(() => {});
            const arrayBuffer = await Promise.race([
              bufferPromise,
              new Promise((_, reject) => setTimeout(() => reject(new Error('Body download timeout')), 10000))
            ]);
            clearTimeout(timeoutId);
            
            if (!arrayBuffer) throw new Error('Empty buffer');
            
            await fs.writeFile(filePath, Buffer.from(arrayBuffer));
            downloadedCount++;
            success = true;
          } catch (err) {
            if (controller) controller.abort();
            console.error(`Failed to download image ${imgUrl}:`, err.message);
            if (retries > 0 && !taskState.isCancelled) {
              console.log(`Retrying download for ${imgUrl} (${retries} retries left)...`);
              await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s before retry
            }
          } finally {
            if (controller) {
              const idx = taskState.controllers.indexOf(controller);
              if (idx > -1) taskState.controllers.splice(idx, 1);
            }
          }
          retries--;
        }
        
        // Only increment processedCount after all retries or success
        processedCount++;
        
        const now = Date.now();
        if (!taskState.lastProgressTime) taskState.lastProgressTime = 0;
        
        if (now - taskState.lastProgressTime > 100 || processedCount === totalImages) {
          taskState.lastProgressTime = now;
          win.webContents.send('download-progress', { 
            id, 
            status: 'downloading_images',
            downloadedCount,
            totalImages,
            progress: 10 + ((processedCount / totalImages) * 70),
            currentFile: fileName
          });
        }
      };

      const workers = [];
      let index = 0;
      const worker = async () => {
        while (index < uniqueImages.length) {
          const currentIndex = index++;
          await downloadImage(uniqueImages[currentIndex], currentIndex);
        }
      };
      
      for (let i = 0; i < Math.min(5, uniqueImages.length); i++) {
        workers.push(worker());
      }
      
      await Promise.all(workers);
      
      if (downloadedCount === 0) {
        throw new Error("Cannot download images. The site blocks access or requires a Referer.");
      }
      
      if (isManhwa && settings.manhwaFormat === 'images') {
        win.webContents.send('download-progress', { id, status: 'converting', progress: 80, filename: title });
        
        const finalImageDir = path.join(saveDir, title);
        await fs.ensureDir(finalImageDir);
        await fs.copy(tempDir, finalImageDir);
        fs.remove(tempDir).catch(() => {});
        
        win.webContents.send('download-progress', { 
          id, 
          status: 'completed', 
          progress: 100, 
          filename: title,
          finalPath: finalImageDir 
        });
      } else {
        win.webContents.send('download-progress', { id, status: 'converting', progress: 80, filename: title });
        
        const output = fs.createWriteStream(finalPath);
        const archive = archiver('zip', { zlib: { level: 0 } });
        
        await new Promise((resolve, reject) => {
          let isDone = false;
          
          const archiveTimeout = setTimeout(() => {
            if (!isDone) {
              isDone = true;
              reject(new Error("La création de l'archive a pris trop de temps (timeout)."));
            }
          }, 10 * 60 * 1000); // 10 minutes timeout

          // Add cancellation handler for archiving phase
          const cancelInterval = setInterval(() => {
            if (taskState.isCancelled && !isDone) {
              isDone = true;
              clearTimeout(archiveTimeout);
              clearInterval(cancelInterval);
              archive.abort();
              output.destroy();
              fs.remove(tempDir).catch(() => {});
              fs.remove(finalPath).catch(() => {});
              reject(new Error("Download cancelled by user"));
            }
          }, 1000);

          const onComplete = () => {
            if (isDone) return;
            isDone = true;
            clearTimeout(archiveTimeout);
            clearInterval(cancelInterval);
            
            // Fire and forget the cleanup to prevent hanging the download process
            // if files are still locked by the OS or antivirus
            fs.remove(tempDir).catch(e => console.warn('Failed to remove temp dir (non-critical):', e.message));
            
            win.webContents.send('download-progress', { 
              id, 
              status: 'completed', 
              progress: 100, 
              filename: finalFilename,
              finalPath: finalPath 
            });
            resolve();
          };
          
          output.on('close', onComplete);
          output.on('finish', onComplete);
          
          output.on('error', (err) => {
            if (!isDone) {
              isDone = true;
              clearTimeout(archiveTimeout);
              clearInterval(cancelInterval);
              reject(err);
            }
          });
          
          archive.on('error', (err) => {
            if (!isDone) {
              isDone = true;
              clearTimeout(archiveTimeout);
              clearInterval(cancelInterval);
              reject(err);
            }
          });

          archive.on('warning', (err) => {
            if (err.code === 'ENOENT') {
              console.warn('Archiver warning:', err);
            } else {
              if (!isDone) {
                isDone = true;
                clearTimeout(archiveTimeout);
                clearInterval(cancelInterval);
                reject(err);
              }
            }
          });

          let lastArchiveProgressTime = 0;
          archive.on('progress', (progressData) => {
            try {
              const now = Date.now();
              if (now - lastArchiveProgressTime > 100 || (progressData.entries && progressData.entries.processed === downloadedCount)) {
                lastArchiveProgressTime = now;
                // Use downloadedCount as the absolute total since entries.total grows dynamically
                let processed = 0;
                if (progressData && progressData.entries && typeof progressData.entries.processed === 'number') {
                  processed = progressData.entries.processed;
                }
                const percent = 80 + ((processed / downloadedCount) * 20);
                win.webContents.send('download-progress', { 
                  id, 
                  status: 'converting', 
                  progress: isNaN(percent) ? 80 : Math.min(percent, 99) // Cap at 99 until finished
                });
              }
            } catch (e) {
              console.error('Error in archive progress:', e);
            }
          });
          
          try {
            archive.pipe(output);
            archive.directory(tempDir, false);
            archive.finalize().catch(err => {
              if (!isDone) {
                isDone = true;
                clearTimeout(archiveTimeout);
                clearInterval(cancelInterval);
                reject(err);
              }
            });
          } catch (err) {
            if (!isDone) {
              isDone = true;
              clearTimeout(archiveTimeout);
              clearInterval(cancelInterval);
              reject(err);
            }
          }
        });
      }
    }
    
  } catch (error) {
    console.error('Download error:', error);
    win.webContents.send('download-progress', { id, status: 'error', error: error.message, filename: title || url });
  } finally {
    if (taskState && taskState.scraperWin && !taskState.scraperWin.isDestroyed()) {
      try { taskState.scraperWin.destroy(); } catch (e) {}
    }
    activeTasks.delete(task.id);
  }
}
