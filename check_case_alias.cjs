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
// Convert Windows backslashes to forward slashes for easier comparison
allFiles.forEach(f => filePathsLower.set(f.replace(/\\/g, '/').toLowerCase(), f.replace(/\\/g, '/')));

let hasError = false;

allFiles.forEach(file => {
  if (!file.endsWith('.js') && !file.endsWith('.jsx')) return;
  const content = fs.readFileSync(file, 'utf8');
  const importRegex = /import\s+.*?\s+from\s+['"](.*?)['"]/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1];
    let resolvedPath;

    if (importPath.startsWith('.')) {
      resolvedPath = path.resolve(path.dirname(file), importPath);
    } else if (importPath.startsWith('@/')) {
      resolvedPath = path.join(srcDir, importPath.substring(2));
    } else {
      continue; // Not a local import
    }

    resolvedPath = resolvedPath.replace(/\\/g, '/');
    
    // Try with extensions
    let found = false;
    let actualPath = '';
    const extensions = ['', '.js', '.jsx', '/index.js', '/index.jsx', '.css', '.png', '.svg', '.json'];
    
    let matchedExt = false;
    for (const ext of extensions) {
      const testPath = resolvedPath + ext;
      if (filePathsLower.has(testPath.toLowerCase())) {
        actualPath = filePathsLower.get(testPath.toLowerCase());
        
        // Split paths and compare each segment to catch folder case mismatches accurately
        const testSegments = testPath.split('/');
        const actualSegments = actualPath.split('/');
        let mismatch = false;
        
        for (let i = 0; i < testSegments.length; i++) {
            if (testSegments[i] !== actualSegments[i]) {
                mismatch = true;
                break;
            }
        }

        if (mismatch) {
          console.error(`Case mismatch in ${file}:`);
          console.error(`Imported: ${importPath}`);
          console.error(`Actual File:   ${actualPath}`);
          console.error('---');
          hasError = true;
        }
        matchedExt = true;
        break;
      }
    }
    
    if (!matchedExt && (importPath.startsWith('.') || importPath.startsWith('@/'))) {
        // If we couldn't find the file at all locally, maybe it's just broken entirely
        // But since it built locally, this should only happen if our script is missing an extension
    }
  }
});

if (!hasError) {
  console.log("No case mismatches found!");
}
