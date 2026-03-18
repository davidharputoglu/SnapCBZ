import axios from 'axios';

async function test() {
  try {
    console.log("Fetching nhentai.net API...");
    const res = await axios.get('https://nhentai.net/api/gallery/500000', {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      }
    });
    console.log("Success:", res.status);
  } catch (e) {
    console.log("Error:", e.message);
  }
}
test();
