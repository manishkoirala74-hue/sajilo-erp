const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    if (fs.statSync(file).isDirectory()) results = results.concat(walk(file));
    else if (file.endsWith('.jsx') || file.endsWith('.js')) results.push(file);
  });
  return results;
}

const files = walk('./src');
let changedCount = 0;

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  // Replace bg-slate-50
  content = content.replace(/\bbg-slate-50(?!0)\b/g, (match) => {
    if (match.includes('dark:')) return match;
    return `${match} dark:bg-slate-500/10`;
  });

  // Replace bg-slate-100
  content = content.replace(/\bbg-slate-100(?!0)\b/g, (match) => {
    if (match.includes('dark:')) return match;
    return `${match} dark:bg-slate-500/20`;
  });

  // Fix textarea lacking bg in Settings.jsx (or anywhere with w-full h-48 border)
  if (file.includes('Settings.jsx')) {
    content = content.replace(/className="w-full h-48 border/g, 'className="w-full h-48 bg-transparent border');
  }

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    changedCount++;
  }
});

console.log('Modified ' + changedCount + ' files.');
