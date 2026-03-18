import axios from 'axios';
async function test() {
  try {
    const res = await axios.get('https://imhentai.xxx/artist/minamoto/');
    console.log(res.data.substring(0, 500));
  } catch (e) {
    console.error(e.message);
  }
}
test();
