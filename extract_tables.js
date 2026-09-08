const fs = require('fs');

const files = fs.readdirSync('.').filter(f => f.endsWith('.sql'));
const tablesWithCompanyId = [];
const tableDepends = {};

files.forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  // Match CREATE TABLE blocks
  const tableBlocks = content.split(/CREATE\s+TABLE\s+/);
  tableBlocks.forEach(block => {
    const tableNameMatch = /^(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?\"?([a-zA-Z0-9_]+)\"?/.exec(block);
    if (tableNameMatch) {
      const tableName = tableNameMatch[1];
      // Check if block contains company_id
      if (/company_id\s+uuid/i.test(block)) {
        if (!tablesWithCompanyId.includes(tableName)) {
          tablesWithCompanyId.push(tableName);
        }
      }
    }
  });
});

console.log(tablesWithCompanyId.join('\n'));
