import { app, net, session } from 'electron';
app.whenReady().then(async () => {
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 100);
    console.log('Fetching...');
    const res = await net.fetch('https://httpbin.org/delay/5', {
      signal: controller.signal
    });
    console.log('Status:', res.status);
    app.quit();
  } catch (e) {
    console.error('Caught:', e.message);
    app.quit();
  }
});
