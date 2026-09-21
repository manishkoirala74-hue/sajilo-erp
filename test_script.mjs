import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

async function run() {
  await client.connect();
  
  const manishId = 'f91f19b3-0e4b-41e9-8422-80d8b47dc1ee';
  const companyId = '8acefe6e-fc5c-4951-b719-decf990d8b24';
  
  try {
    await client.query(`
      set local role authenticated;
      set local request.jwt.claims = '{"sub": "${manishId}"}';
    `);
    
    const { rows } = await client.query(`
      SELECT public.current_user_has_company_permission('${companyId}'::uuid, 'users.edit');
    `);
    console.log('Result for uuid signature:', rows);
    
    const { rows: rows2 } = await client.query(`
      SELECT public.current_user_has_company_permission('${companyId}'::text, 'users.edit');
    `);
    console.log('Result for text signature:', rows2);
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await client.end();
  }
}

run();
