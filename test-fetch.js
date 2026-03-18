import { app, session } from 'electron';
app.whenReady().then(async () => {
  try {
    const res = await session.fromPartition('persist:scraper').fetch('https://google.com');
    console.log('Status:', res.status);
    app.quit();
  } catch (e) {
    console.error(e);
    app.quit();
  }
});
