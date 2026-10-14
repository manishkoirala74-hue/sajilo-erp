import fs from 'fs';
import path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SAJILO_APP_BASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const client = createClient(supabaseUrl, serviceKey);

const backupDir = path.resolve('scripts/benchmarks');
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}
const backupPath = path.join(backupDir, 'logo_backups.json');

async function migrateLogos() {
  console.log('=== Base64 Logo Eradication to Supabase Storage ===\n');

  // 1. Fetch all companies
  const { data: companies, error: fetchErr } = await client.from('Company').select('id, name, logo_url');
  if (fetchErr) {
    console.error('Failed to fetch companies:', fetchErr);
    process.exit(1);
  }

  // 2. Save immutable backup before modifying anything
  const backupData = {
    capturedAt: new Date().toISOString(),
    companies: companies.map(c => ({
      id: c.id,
      name: c.name,
      original_logo_url: c.logo_url
    }))
  };
  fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2), 'utf8');
  console.log(`[BACKUP] Saved rollback backup to ${backupPath}`);

  // 3. Process each company
  let migratedCount = 0;
  for (const company of companies) {
    if (!company.logo_url || !company.logo_url.startsWith('data:image/')) {
      console.log(`[SKIP] Company "${company.name}" does not have a base64 logo.`);
      continue;
    }

    console.log(`\nProcessing Company: "${company.name}" (ID: ${company.id})`);
    const originalLen = company.logo_url.length;
    console.log(`  Current Base64 Length: ${originalLen} chars (~${(originalLen / 1024).toFixed(1)} KB)`);

    // Parse data URL: data:image/jpeg;base64,...
    const matches = company.logo_url.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/s);
    if (!matches) {
      console.warn(`  [WARN] Failed to parse base64 header for company ${company.id}`);
      continue;
    }

    const mimeType = matches[1];
    const base64Data = matches[2];
    const ext = mimeType.split('/')[1] || 'jpeg';
    const buffer = Buffer.from(base64Data, 'base64');
    const storagePath = `logos/${company.id}_logo_${Date.now()}.${ext}`;

    console.log(`  Uploading ${buffer.length} bytes to storage bucket 'erp_documents' at '${storagePath}'...`);

    const { data: uploadData, error: uploadErr } = await client.storage
      .from('erp_documents')
      .upload(storagePath, buffer, {
        contentType: mimeType,
        upsert: true
      });

    if (uploadErr) {
      console.error(`  [ERROR] Upload failed for ${company.name}:`, uploadErr);
      continue;
    }

    // Get public URL
    const { data: publicUrlData } = client.storage
      .from('erp_documents')
      .getPublicUrl(storagePath);

    const publicUrl = publicUrlData.publicUrl;
    console.log(`  Uploaded successfully! Public URL: ${publicUrl}`);

    // Update Company record
    const { error: updateErr } = await client
      .from('Company')
      .update({ logo_url: publicUrl })
      .eq('id', company.id);

    if (updateErr) {
      console.error(`  [ERROR] Failed to update Company.logo_url:`, updateErr);
    } else {
      console.log(`  [UPDATED] Company table updated with lightweight CDN URL.`);
      migratedCount++;
    }
  }

  // 4. Measure new payload size
  console.log(`\n=== Verification ===`);
  const { data: updatedCompanies } = await client.from('Company').select('*');
  const newPayload = JSON.stringify(updatedCompanies);
  const newBytes = Buffer.byteLength(newPayload, 'utf8');

  console.log(`Migrated ${migratedCount} company logos.`);
  console.log(`New Company.select('*') payload: ${(newBytes / 1024).toFixed(2)} KB (${newBytes} bytes)`);
  console.log(`Done!`);
}

migrateLogos();
