const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.jsx') || file.endsWith('.js')) {
      results.push(file);
    }
  });
  return results;
}

const files = walk('./src');
let changedCount = 0;

const ignoreColors = ['slate', 'gray', 'zinc', 'neutral', 'stone', 'white', 'black', 'transparent', 'current'];

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  // Replace bg-COLOR-50
  content = content.replace(/\bbg-([a-z]+)-50(?!0)\b/g, (match, color) => {
    if (ignoreColors.includes(color)) return match;
    if (match.includes('dark:')) return match;
    return `${match} dark:bg-${color}-500/10`;
  });

  // Replace bg-COLOR-100
  content = content.replace(/\bbg-([a-z]+)-100(?!0)\b/g, (match, color) => {
    if (ignoreColors.includes(color)) return match;
    if (match.includes('dark:')) return match;
    return `${match} dark:bg-${color}-500/20`;
  });

  // Replace border-COLOR-200
  content = content.replace(/\bborder-([a-z]+)-200(?!0)\b/g, (match, color) => {
    if (ignoreColors.includes(color)) return match;
    if (match.includes('dark:')) return match;
    return `${match} dark:border-${color}-500/20`;
  });

  // Replace border-COLOR-300
  content = content.replace(/\bborder-([a-z]+)-300(?!0)\b/g, (match, color) => {
    if (ignoreColors.includes(color)) return match;
    if (match.includes('dark:')) return match;
    return `${match} dark:border-${color}-500/30`;
  });

  // Replace text-COLOR-600
  content = content.replace(/\btext-([a-z]+)-600(?!0)\b/g, (match, color) => {
    if (ignoreColors.includes(color)) return match;
    if (match.includes('dark:')) return match;
    return `${match} dark:text-${color}-400`;
  });

  // Replace text-COLOR-700
  content = content.replace(/\btext-([a-z]+)-700(?!0)\b/g, (match, color) => {
    if (ignoreColors.includes(color)) return match;
    if (match.includes('dark:')) return match;
    return `${match} dark:text-${color}-400`;
  });

  // Replace text-COLOR-800
  content = content.replace(/\btext-([a-z]+)-800(?!0)\b/g, (match, color) => {
    if (ignoreColors.includes(color)) return match;
    if (match.includes('dark:')) return match;
    return `${match} dark:text-${color}-300`;
  });

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    changedCount++;
  }
});

console.log('Modified ' + changedCount + ' files.');
