const fs = require('fs');
const path = require('path');

const entitiesDir = path.join(__dirname, 'sajilo', 'entities');
const outputFile = path.join(__dirname, 'supabase_schema.sql');

// Basic JSONC parser that removes comments
function parseJsonc(content) {
  try {
    const withoutComments = content
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    return JSON.parse(withoutComments);
  } catch (err) {
    console.error(`Failed to parse jsonc:`, err);
    return null;
  }
}

function mapType(propName, propDef) {
  if (propDef.format === 'date' || propDef.format === 'date-time') {
    return 'TIMESTAMP WITH TIME ZONE';
  }
  switch (propDef.type) {
    case 'string':
      return 'TEXT';
    case 'integer':
      return 'INTEGER';
    case 'number':
      return 'NUMERIC';
    case 'boolean':
      return 'BOOLEAN';
    case 'array':
    case 'object':
      return 'JSONB';
    default:
      return 'TEXT';
  }
}

function generateSql() {
  const files = fs.readdirSync(entitiesDir).filter(f => f.endsWith('.jsonc'));
  let sql = `-- Supabase Schema Generated from sajilo entities\n\n`;

  // Enable uuid-ossp extension
  sql += `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";\n\n`;

  const tables = [];
  const globalTables = ['User', 'Company', 'UserCompany'];

  for (const file of files) {
    const content = fs.readFileSync(path.join(entitiesDir, file), 'utf-8');
    const schema = parseJsonc(content);
    if (!schema || !schema.name) continue;

    const tableName = schema.name;
    tables.push(tableName);
    let tableSql = `CREATE TABLE IF NOT EXISTS "${tableName}" (\n`;
    tableSql += `  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),\n`;
    
    if (!globalTables.includes(tableName)) {
      tableSql += `  company_id UUID,\n`;
    }

    const props = schema.properties || {};
    for (const [propName, propDef] of Object.entries(props)) {
      if (propName === 'id') continue; // Handled
      const sqlType = mapType(propName, propDef);
      const isRequired = (schema.required || []).includes(propName) ? ' NOT NULL' : '';
      let defaultClause = '';
      if (propDef.default !== undefined) {
        if (typeof propDef.default === 'string') {
          defaultClause = ` DEFAULT '${propDef.default}'`;
        } else if (typeof propDef.default === 'boolean' || typeof propDef.default === 'number') {
          defaultClause = ` DEFAULT ${propDef.default}`;
        }
      }
      tableSql += `  "${propName}" ${sqlType}${isRequired}${defaultClause},\n`;
    }

    // Default metadata columns
    tableSql += `  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),\n`;
    tableSql += `  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),\n`;
    tableSql += `  created_by TEXT,\n`;
    tableSql += `  updated_by TEXT\n`;
    
    tableSql += `);\n\n`;

    // Enable RLS
    tableSql += `ALTER TABLE "${tableName}" ENABLE ROW LEVEL SECURITY;\n\n`;
    
    if (!globalTables.includes(tableName)) {
      // Multi-tenant RLS policies
      const adminCheck = `EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')`;
      const companyCheck = `company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())`;
      const policyCondition = `(${adminCheck}) OR (${companyCheck})`;

      tableSql += `CREATE POLICY "select_${tableName}" ON "${tableName}" FOR SELECT USING (${policyCondition});\n`;
      tableSql += `CREATE POLICY "insert_${tableName}" ON "${tableName}" FOR INSERT WITH CHECK (${policyCondition});\n`;
      tableSql += `CREATE POLICY "update_${tableName}" ON "${tableName}" FOR UPDATE USING (${policyCondition}) WITH CHECK (${policyCondition});\n`;
      tableSql += `CREATE POLICY "delete_${tableName}" ON "${tableName}" FOR DELETE USING (${policyCondition});\n`;
    } else {
      // For global tables, keep it simple for now
      if (schema.rls) {
        // ... handled manually if needed ...
        tableSql += `CREATE POLICY "Enable all for authenticated users" ON "${tableName}" FOR ALL TO authenticated USING (true) WITH CHECK (true);\n`;
      } else {
        tableSql += `CREATE POLICY "Enable all for authenticated users" ON "${tableName}" FOR ALL TO authenticated USING (true) WITH CHECK (true);\n`;
      }
    }

    tableSql += `\n`;
    sql += tableSql;
  }

  // Create updated_at trigger function
  sql += `
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';
`;

  // Apply trigger to all tables
  for (const tableName of tables) {
    sql += `
CREATE TRIGGER update_${tableName}_updated_at
BEFORE UPDATE ON "${tableName}"
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
`;
  }

  fs.writeFileSync(outputFile, sql);
  console.log(`Schema generated successfully at ${outputFile}`);
}

generateSql();
