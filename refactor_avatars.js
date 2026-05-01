const fs = require('fs');
const path = require('path');

const filesToRefactor = [
  'client/app/create-post.tsx',
  'client/app/location/[placeId].tsx',
  'client/app/watch-live.tsx',
  'client/app/watch-live-zeegocloud-full.tsx',
  'client/src/_hooks/useUserProfile.tsx',
  'client/src/_components/StoriesViewer.tsx',
  'client/src/_components/StoriesRow.tsx',
  'client/src/_components/LiveStreamsRow.tsx',
  'client/src/_components/CommentAvatar.tsx',
  'client/src/_components/CommentSection.tsx',
  'client/app/search-modal.tsx',
  'client/app/notifications.tsx',
  'client/app/map.tsx',
  'client/app/go-live.tsx',
  'client/app/edit-profile.tsx',
  'client/app/go-live-zeegocloud-full.tsx',
  'client/app/(tabs)/post.tsx',
  'client/app/(tabs)/home.tsx'
];

const rootDir = 'C:/Users/Tauheed/Desktop/final';

filesToRefactor.forEach(relPath => {
  const absPath = path.join(rootDir, relPath);
  if (!fs.existsSync(absPath)) {
    console.log(`File not found: ${absPath}`);
    return;
  }

  let content = fs.readFileSync(absPath, 'utf8');

  // 1. Remove local DEFAULT_AVATAR_URL definitions
  // Matches: const DEFAULT_AVATAR_URL = '...'; or let DEFAULT_AVATAR_URL = '...'; or const DEFAULT_AVATAR_URL = "...";
  const regex = /const\s+DEFAULT_AVATAR_URL\s*=\s*['"][^'"]*['"];?/g;
  const regex2 = /let\s+DEFAULT_AVATAR_URL\s*=\s*['"][^'"]*['"];?/g;
  
  content = content.replace(regex, '');
  content = content.replace(regex2, '');

  // 2. Add import at the top
  // Calculate relative path to lib/api.ts
  const fileDir = path.dirname(relPath);
  let depth = fileDir.split(path.sep).length;
  if (fileDir === '.' || fileDir === '') depth = 0;
  
  // Actually, let's just use a simpler way to calculate the relative path from common roots
  let importPath = '';
  if (relPath.startsWith('client/app/(tabs)')) importPath = '../../lib/api';
  else if (relPath.startsWith('client/app/location')) importPath = '../../lib/api';
  else if (relPath.startsWith('client/app')) importPath = '../lib/api';
  else if (relPath.startsWith('client/src/_components')) importPath = '../../lib/api';
  else if (relPath.startsWith('client/src/_hooks')) importPath = '../../lib/api';
  else importPath = '../lib/api';

  const importLine = `import { DEFAULT_AVATAR_URL } from '${importPath}';\n`;
  
  if (!content.includes(`from '${importPath}'`) && !content.includes(`from "${importPath}"`)) {
     content = importLine + content;
  } else if (!content.includes('DEFAULT_AVATAR_URL')) {
     // If the import exists but doesn't include the constant, add it (complex to do with regex, but let's try)
     content = content.replace(/import\s*\{([^}]*)\}\s*from\s*['"](\.+\/lib\/api)['"]/g, (match, p1, p2) => {
        if (!p1.includes('DEFAULT_AVATAR_URL')) {
           return `import { ${p1.trim()}, DEFAULT_AVATAR_URL } from '${p2}'`;
        }
        return match;
     });
  }

  fs.writeFileSync(absPath, content);
  console.log(`Refactored: ${relPath}`);
});
