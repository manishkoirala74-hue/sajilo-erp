import fs from 'fs';
import path from 'path';

function walkDir(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walkDir(file));
    } else {
      if (file.endsWith('.jsx') || file.endsWith('.js')) {
        results.push(file);
      }
    }
  });
  return results;
}

try {
  const files = walkDir('src');
  let count = 0;
  for (const file of files) {
    let content = fs.readFileSync(file, 'utf8');
    
    // Check if it already has catch
    if (content.includes('.catch(')) continue;

    let modified = content.replace(/(setLoading\(false\);\n\s*\}\);\n\s*\};)/g, (match) => {
      return 'setLoading(false);\n    }).catch(err => {\n      console.error(err);\n      import("sonner").then(m => m.toast.error(err.message || "Error loading data"));\n      setLoading(false);\n    });\n  };';
    });
    
    if (modified !== content) {
      fs.writeFileSync(file, modified);
      count++;
    }
  }
  console.log('Fixed ' + count + ' files.');
} catch(e) {
  console.error('Error:', e);
}
