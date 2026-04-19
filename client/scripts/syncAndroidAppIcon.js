#!/usr/bin/env node
/**
 * Regenerates Android launcher mipmaps + splash logos from assets/images/icon.png
 * (matches app.json "icon"). Run after changing the source icon.
 */
const fs = require('fs');
const path = require('path');

let sharp;
try {
  sharp = require('sharp');
} catch {
  console.error('Install sharp: npm install sharp --save-dev');
  process.exit(1);
}

const root = path.join(__dirname, '..');
const srcIcon = path.join(root, 'assets', 'images', 'icon.png');
if (!fs.existsSync(srcIcon)) {
  console.error('Missing', srcIcon);
  process.exit(1);
}

/** Legacy launcher / round icon side (dp * density) */
const LAUNCHER = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
/** Adaptive foreground (108dp zone) */
const FOREGROUND = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
/** Expo-style splash logo widths */
const SPLASH = { mdpi: 124, hdpi: 186, xhdpi: 248, xxhdpi: 372, xxxhdpi: 496 };

const densities = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];

async function writeWebp(size, outPath) {
  const buf = await sharp(srcIcon)
    .resize(size, size, { fit: 'cover', position: 'centre' })
    .webp({ quality: 90 })
    .toBuffer();
  fs.writeFileSync(outPath, buf);
}

async function writeSplash(width, outPath) {
  const buf = await sharp(srcIcon)
    .resize(width, width, {
      fit: 'contain',
      position: 'centre',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .png()
    .toBuffer();
  fs.writeFileSync(outPath, buf);
}

async function writeMonochrome(size, outPath) {
  const buf = await sharp(srcIcon)
    .resize(size, size, { fit: 'cover', position: 'centre' })
    .grayscale()
    .webp({ quality: 90 })
    .toBuffer();
  fs.writeFileSync(outPath, buf);
}

async function main() {
  for (const d of densities) {
    const dir = path.join(root, 'android', 'app', 'src', 'main', 'res', `mipmap-${d}`);
    if (!fs.existsSync(dir)) continue;
    const L = LAUNCHER[d];
    const F = FOREGROUND[d];
    await writeWebp(L, path.join(dir, 'ic_launcher.webp'));
    await writeWebp(L, path.join(dir, 'ic_launcher_round.webp'));
    await writeWebp(F, path.join(dir, 'ic_launcher_foreground.webp'));
    await writeMonochrome(F, path.join(dir, 'ic_launcher_monochrome.webp'));
    console.log('mipmap-' + d, 'ok');
  }

  for (const d of densities) {
    const dir = path.join(root, 'android', 'app', 'src', 'main', 'res', `drawable-${d}`);
    if (!fs.existsSync(dir)) continue;
    const w = SPLASH[d];
    await writeSplash(w, path.join(dir, 'splashscreen_logo.png'));
    console.log('drawable-' + d, 'splash ok');
  }

  console.log('\nDone: launcher + splash logos synced from assets/images/icon.png\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
