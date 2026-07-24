const fs = require('fs');
const path = require('path');

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      walkDir(filePath);
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      let content = fs.readFileSync(filePath, 'utf8');
      const original = content;
      
      // Replace imports from components to components
      content = content.replace(/from ['"]\.\.\/components\//g, "from '../components/");
      content = content.replace(/from ['"]\.\.\/hooks\//g, "from '../_hooks/");
      content = content.replace(/from ['"]\.\.\/services\//g, "from '../services/");
      
      if (content !== original) {
        fs.writeFileSync(filePath, content);
        console.log('Updated: ' + filePath);
      }
    }
  });
}

walkDir('app');
console.log('Done!');
