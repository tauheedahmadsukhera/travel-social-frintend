/**
 * Rasterize Trips SVGs for Expo (icon + splash need PNG).
 * Run: npm run assets:trips-png
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientRoot = path.join(__dirname, '..');
const imagesDir = path.join(clientRoot, 'assets', 'images');
const assetsDir = path.join(clientRoot, 'assets');

const svgApp = path.join(imagesDir, 'logo-trips-app.svg');
const svgWordmark = path.join(imagesDir, 'logo-trips.svg');

const BRAND = { r: 102, g: 126, b: 234, alpha: 1 }; // #667eea

async function main() {
  if (!fs.existsSync(svgApp)) {
    console.error('Missing:', svgApp);
    process.exit(1);
  }
  if (!fs.existsSync(svgWordmark)) {
    console.error('Missing:', svgWordmark);
    process.exit(1);
  }

  // App icon + adaptive foreground (1024)
  await sharp(svgApp)
    .resize(1024, 1024, { fit: 'contain', background: BRAND })
    .png()
    .toFile(path.join(imagesDir, 'icon.png'));
  console.log('Wrote assets/images/icon.png');

  // Splash: centered mark on brand background (common phone aspect)
  const splashW = 1242;
  const splashH = 2688;
  const inner = 1100;
  const markPng = await sharp(svgApp)
    .resize(inner, inner, { fit: 'contain', background: BRAND })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: splashW,
      height: splashH,
      channels: 4,
      background: BRAND,
    },
  })
    .composite([{ input: markPng, gravity: 'center' }])
    .png()
    .toFile(path.join(assetsDir, 'splash.png'));
  console.log('Wrote assets/splash.png');

  // In-app header mark (bundled PNG; avoids huge SVG at runtime)
  await sharp(svgWordmark)
    .resize(512, 512, { fit: 'contain', background: { ...BRAND, alpha: 0 } })
    .png()
    .toFile(path.join(imagesDir, 'logo-trips-mark.png'));
  console.log('Wrote assets/images/logo-trips-mark.png');

  // Web favicon
  await sharp(svgApp)
    .resize(48, 48, { fit: 'contain', background: BRAND })
    .png()
    .toFile(path.join(imagesDir, 'favicon.png'));
  console.log('Wrote assets/images/favicon.png');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
