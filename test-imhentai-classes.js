import axios from 'axios';
import * as cheerio from 'cheerio';

async function test() {
  try {
    const res = await axios.get('https://imhentai.xxx/artist/minamoto/');
    const $ = cheerio.load(res.data);
    
    console.log("Thumbs with .thumb a:", $('.thumb a').length);
    console.log("Thumbs with .inner_thumb a:", $('.inner_thumb a').length);
    
    // Find all links containing /gallery/
    let count = 0;
    $('a').each((i, el) => {
      const href = $(el).attr('href');
      if (href && href.includes('/gallery/') && count < 5) {
        console.log("Found gallery link:", href);
        console.log("Parent classes:", $(el).parent().attr('class'));
        console.log("Element classes:", $(el).attr('class'));
        count++;
      }
    });
  } catch (e) {
    console.error("Error:", e.message);
  }
}
test();
