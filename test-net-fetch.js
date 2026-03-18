import { app, net, session } from 'electron';
app.whenReady().then(async () => {
  try {
    const res = await net.fetch('https://google.com', {
      session: session.fromPartition('persist:scraper')
    });
    console.log('Status:', res.status);
    app.quit();
  } catch (e) {
    console.error(e);
    app.quit();
  }
});
