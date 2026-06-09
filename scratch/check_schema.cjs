const fs = require('fs');
const path = require('path');

const schema = fs.readFileSync('supabase_schema.sql', 'utf8');
const tables = {};
let currentTable = null;

const lines = schema.split('\n');
for (let line of lines) {
  line = line.trim();
  const tableMatch = line.match(/CREATE TABLE IF NOT EXISTS "?([a-zA-Z0-9_]+)"?/i);
  if (tableMatch) {
    currentTable = tableMatch[1];
    tables[currentTable] = new Set();
  } else if (currentTable && line.startsWith(');')) {
    currentTable = null;
  } else if (currentTable) {
    const colMatch = line.match(/^"?([a-zA-Z0-9_]+)"?\s+[A-Z]+/i);
    if (colMatch) {
      tables[currentTable].add(colMatch[1]);
    }
  }
}

// Ensure `id`, `created_at`, `updated_at`, `company_id` are on all tables conceptually
for (const tbl in tables) {
  tables[tbl].add('id');
  tables[tbl].add('created_at');
  tables[tbl].add('updated_at');
  tables[tbl].add('company_id');
}

console.log('Tables parsed:', Object.keys(tables).length);

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(full));
    } else if (full.endsWith('.jsx') || full.endsWith('.js')) {
      results.push(full);
    }
  });
  return results;
}

const files = walk('src');
for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  // simplistic regex to find sajilo.entities.TableName.create({ ... })
  const regex = /sajilo\.entities\.([a-zA-Z0-9_]+)\.(create|update)\s*\(\s*(?:[^,{]+,)?\s*\{([^}]+)\}/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const tbl = match[1];
    const payloadStr = match[3];
    
    if (!tables[tbl]) {
      console.log(`[WARN] Table ${tbl} not found in schema, but used in ${file}`);
      continue;
    }
    
    // extract keys
    const keyRegex = /([a-zA-Z0-9_]+)\s*:/g;
    let keyMatch;
    while ((keyMatch = keyRegex.exec(payloadStr)) !== null) {
      const key = keyMatch[1];
      if (!tables[tbl].has(key)) {
        console.log(`[ERROR] File: ${file} -> Table: ${tbl} -> Missing Column: ${key}`);
      }
    }
  }
}
