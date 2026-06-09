const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

function getAllFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      getAllFiles(filePath, fileList);
    } else {
      fileList.push(filePath);
    }
  }
  return fileList;
}

const allFiles = getAllFiles(srcDir);
const filePathsLower = new Map();
allFiles.forEach(f => filePathsLower.set(f.toLowerCase(), f));

let hasError = false;

allFiles.forEach(file => {
  if (!file.endsWith('.js') && !file.endsWith('.jsx')) return;
  const content = fs.readFileSync(file, 'utf8');
  const importRegex = /import\s+.*?\s+from\s+['"](.*?)['"]/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1];
    if (importPath.startsWith('.')) {
      const dir = path.dirname(file);
      let resolvedPath = path.resolve(dir, importPath);
      
      // Try with extensions
      let found = false;
      let actualPath = '';
      const extensions = ['', '.js', '.jsx', '/index.js', '/index.jsx'];
      
      for (const ext of extensions) {
        const testPath = resolvedPath + ext;
        if (filePathsLower.has(testPath.toLowerCase())) {
          actualPath = filePathsLower.get(testPath.toLowerCase());
          if (testPath !== actualPath) {
            console.error(`Case mismatch in ${file}:`);
            console.error(`Imported: ${testPath}`);
            console.error(`Actual:   ${actualPath}`);
            console.error('---');
            hasError = true;
          }
          found = true;
          break;
        }
      }
    }
  }
});

if (!hasError) {
  console.log("No case mismatches found!");
}
