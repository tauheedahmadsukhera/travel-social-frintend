const fs = require('fs');
const path = require('path');

const DIRECTORIES_TO_SCAN = [
  'client/app',
  'client/src/_components',
  'client/components',
  'client/lib/firebaseHelpers',
  'client/services',
  'client/config'
];

const TARGET_STRINGS = [
  "'https://res.cloudinary.com/dinwxxnzm/image/upload/v1/default/default-pic.jpg'",
  "\"https://res.cloudinary.com/dinwxxnzm/image/upload/v1/default/default-pic.jpg\"",
  "'https://firebasestorage.googleapis.com/v0/b/travel-app-3da72.firebasestorage.app/o/default%2Fdefault-pic.jpg?alt=media&token=7177f487-a345-4e45-9a56-732f03dbf65d'",
  "\"https://firebasestorage.googleapis.com/v0/b/travel-app-3da72.firebasestorage.app/o/default%2Fdefault-pic.jpg?alt=media&token=7177f487-a345-4e45-9a56-732f03dbf65d\"",
  "'https://via.placeholder.com/200x200.png?text=Profile'",
  "'https://via.placeholder.com/50x50.png?text=User'",
  "'https://via.placeholder.com/120x120.png?text=User'",
  "'https://via.placeholder.com/150'",
  "'https://via.placeholder.com/200x200.png?text=Profile'",
  "'https://via.placeholder.com/32'"
];

const REPLACEMENT = "DEFAULT_AVATAR_URL";

function processDirectory(dir) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      processDirectory(fullPath);
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx') || fullPath.endsWith('.js')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let originalContent = content;

      let changed = false;
      for (const target of TARGET_STRINGS) {
        if (content.includes(target)) {
          content = content.split(target).join(REPLACEMENT);
          changed = true;
        }
      }

      if (changed) {
        // Add import if not present
        if (!content.includes('DEFAULT_AVATAR_URL')) {
           // We just replaced it, so it will contain it. We need to check if it has the import
        }
        
        // Let's check if the import statement for DEFAULT_AVATAR_URL exists
        if (!content.includes("from '@/lib/api'") && !content.includes("from '../lib/api'") && !content.includes("from '../../lib/api'") && !content.includes("DEFAULT_AVATAR_URL")) {
          // just a heuristic
        }

        const importStatement = `import { DEFAULT_AVATAR_URL } from '@/lib/api';\n`;
        if (!content.includes('import { DEFAULT_AVATAR_URL }')) {
            // insert after last import
            const lines = content.split('\n');
            let lastImportIndex = -1;
            for(let i=0; i<lines.length; i++){
                if(lines[i].startsWith('import ')) {
                    lastImportIndex = i;
                }
            }
            if(lastImportIndex !== -1) {
                lines.splice(lastImportIndex + 1, 0, importStatement);
                content = lines.join('\n');
            } else {
                content = importStatement + content;
            }
        }

        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`Updated: ${fullPath}`);
      }
    }
  }
}

for (const dir of DIRECTORIES_TO_SCAN) {
  const fullPath = path.join(__dirname, dir);
  if (fs.existsSync(fullPath)) {
    processDirectory(fullPath);
  }
}

console.log("Done");
