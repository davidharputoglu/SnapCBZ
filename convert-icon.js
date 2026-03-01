import sharp from 'sharp';

async function convert() {
  try {
    await sharp('public/favicon.svg')
      .resize(256, 256)
      .png({ compressionLevel: 9, adaptiveFiltering: true, force: true })
      .toFile('public/icon.png');
    console.log('Successfully generated 256x256 PNG');
  } catch (err) {
    console.error('Error generating PNG:', err);
  }
}

convert();
