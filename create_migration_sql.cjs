const fs = require('fs');
const path = require('path');

const entitiesDir = path.join(__dirname, 'sajilo', 'entities');
const outputFile = path.join(__dirname, 'migration_to_multi_tenant.sql');

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
    case 'string': return 'TEXT';
    case 'integer': return 'INTEGER';
    case 'number': return 'NUMERIC';
    case 'boolean': return 'BOOLEAN';
    case 'array':
    case 'object': return 'JSONB';
    default: return 'TEXT';
  }
}

function generateMigration() {
  const files = fs.readdirSync(entitiesDir).filter(f => f.endsWith('.jsonc'));
  let sql = `-- Multi-tenant Migration Script\n\n`;
  sql += `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";\n\n`;

  const globalTables = ['User', 'Company', 'UserCompany'];
  const nonGlobalTables = [];
  const schemas = {};

  for (const file of files) {
    const content = fs.readFileSync(path.join(entitiesDir, file), 'utf-8');
    const schema = parseJsonc(content);
    if (!schema || !schema.name) continue;
    schemas[schema.name] = schema;
    if (!globalTables.includes(schema.name)) {
      nonGlobalTables.push(schema.name);
    }
  }

  // 1. Create Company and UserCompany tables if they don't exist
  for (const tableName of ['Company', 'UserCompany']) {
    const schema = schemas[tableName];
    if (!schema) continue;
    let tableSql = `CREATE TABLE IF NOT EXISTS "${tableName}" (\n`;
    tableSql += `  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),\n`;

    const props = schema.properties || {};
    for (const [propName, propDef] of Object.entries(props)) {
      if (propName === 'id') continue;
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
    tableSql += `  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),\n`;
    tableSql += `  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),\n`;
    tableSql += `  created_by TEXT,\n`;
    tableSql += `  updated_by TEXT\n`;
    tableSql += `);\n\n`;
    tableSql += `ALTER TABLE "${tableName}" ENABLE ROW LEVEL SECURITY;\n\n`;
    tableSql += `DROP POLICY IF EXISTS "Enable all for authenticated users" ON "${tableName}";\n`;
    tableSql += `CREATE POLICY "Enable all for authenticated users" ON "${tableName}" FOR ALL TO authenticated USING (true) WITH CHECK (true);\n\n`;
    sql += tableSql;
  }

  // 2. Add company_id to all non-global tables
  sql += `-- Add company_id to existing tables\n`;
  for (const tableName of nonGlobalTables) {
    sql += `ALTER TABLE "${tableName}" ADD COLUMN IF NOT EXISTS company_id UUID;\n`;
  }
  sql += `\n`;

  // 3. Data Migration (DO block)
  sql += `
-- Migrate Data: Create default company, assign to all users, and update all existing rows
DO $$
DECLARE
    default_company_id UUID;
    usr RECORD;
BEGIN
    -- Check if a company exists, otherwise create one
    SELECT id INTO default_company_id FROM "Company" LIMIT 1;
    IF default_company_id IS NULL THEN
        INSERT INTO "Company" (name) VALUES ('Default Company') RETURNING id INTO default_company_id;
    END IF;

    -- Assign all existing users to this company
    FOR usr IN SELECT id FROM "User" LOOP
        IF NOT EXISTS (SELECT 1 FROM "UserCompany" WHERE user_id = usr.id::text AND company_id = default_company_id::text) THEN
            INSERT INTO "UserCompany" (user_id, company_id, is_default) VALUES (usr.id::text, default_company_id::text, true);
        END IF;
    END LOOP;

    -- Set the company_id for all existing records
`;
  for (const tableName of nonGlobalTables) {
    sql += `    UPDATE "${tableName}" SET company_id = default_company_id WHERE company_id IS NULL;\n`;
  }
  
  sql += `
END $$;
\n\n`;

  // 4. Update RLS policies
  sql += `-- Update RLS Policies\n`;
  const adminCheck = `EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')`;
  const companyCheck = `company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())`;
  const policyCondition = `(${adminCheck}) OR (${companyCheck})`;

  for (const tableName of nonGlobalTables) {
    const actions = ['select', 'insert', 'update', 'delete'];
    for (const action of actions) {
      sql += `DROP POLICY IF EXISTS "${action}_${tableName}" ON "${tableName}";\n`;
    }
    sql += `CREATE POLICY "select_${tableName}" ON "${tableName}" FOR SELECT USING (${policyCondition});\n`;
    sql += `CREATE POLICY "insert_${tableName}" ON "${tableName}" FOR INSERT WITH CHECK (${policyCondition});\n`;
    sql += `CREATE POLICY "update_${tableName}" ON "${tableName}" FOR UPDATE USING (${policyCondition}) WITH CHECK (${policyCondition});\n`;
    sql += `CREATE POLICY "delete_${tableName}" ON "${tableName}" FOR DELETE USING (${policyCondition});\n\n`;
  }

  fs.writeFileSync(outputFile, sql);
  console.log(`Migration script generated at ${outputFile}`);
}

generateMigration();
