const fs = require('fs');
const path = require('path');

function removeDirIfExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return false;
  }

  fs.rmSync(dirPath, { recursive: true, force: true });
  return true;
}

function main() {
  const projectRoot = path.resolve(__dirname, '..');
  const zimFrameworkRoot = path.join(
    projectRoot,
    'node_modules',
    'zego-zim-react-native',
    'ios',
    'libs',
    'ZIM.xcframework'
  );

  if (!fs.existsSync(zimFrameworkRoot)) {
    console.log('[fixZegoIosFramework] ZIM.xcframework not found. Skipping.');
    return;
  }

  const entries = fs.readdirSync(zimFrameworkRoot, { withFileTypes: true });
  let removedCount = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    if (!entry.name.toLowerCase().includes('maccatalyst')) {
      continue;
    }

    const targetPath = path.join(zimFrameworkRoot, entry.name);
    if (removeDirIfExists(targetPath)) {
      removedCount += 1;
      console.log(`[fixZegoIosFramework] Removed ${entry.name}`);
    }
  }

  if (removedCount === 0) {
    console.log('[fixZegoIosFramework] No maccatalyst slices found.');
    return;
  }

  console.log(`[fixZegoIosFramework] Done. Removed ${removedCount} slice(s).`);
}

main();
