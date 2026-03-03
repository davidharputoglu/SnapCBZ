import axios from 'axios';
import * as cheerio from 'cheerio';

async function test3Hentai() {
  try {
    console.log("--- Testing 3hentai.net ---");
    const galRes = await axios.get('https://3hentai.net/d/12345/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    const $ = cheerio.load(galRes.data);
    
    const title = $('#info h1').text().trim();
    console.log("Title:", title);
    
    const thumbs = [];
    $('.gallery .item img').each((i, el) => {
      thumbs.push($(el).attr('data-src') || $(el).attr('src'));
    });
    console.log("Thumbs:", thumbs.slice(0, 3));
    
  } catch (e) {
    console.error("3Hentai Error:", e.message);
  }
}

test3Hentai();
