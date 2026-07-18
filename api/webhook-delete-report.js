import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const signature = req.headers['x-webhook-secret'];
    
    // Verify secret
    if (signature !== process.env.SUPABASE_WEBHOOK_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const payload = req.body;
    
    // The webhook payload from Supabase for a DELETE event will look like:
    // { type: 'DELETE', table: 'report_archive', schema: 'public', record: null, old_record: { ... } }
    if (payload.type === 'DELETE' && payload.old_record && payload.old_record.bucket_url) {
      const bucketUrl = payload.old_record.bucket_url;
      // Extract the path from the bucket URL (e.g. companyId/reportType/filename.pdf)
      // If it's stored as 'reports/...' we can just split/parse it.
      // Let's assume bucketUrl is the direct path within the bucket 'erp_documents'.
      
      const supabaseUrl = process.env.VITE_SAJILO_APP_BASE_URL || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SAJILO_APP_ID || process.env.VITE_SUPABASE_ANON_KEY;
      
      const supabaseAdmin = createClient(supabaseUrl, supabaseKey);
      
      const { data, error } = await supabaseAdmin
        .storage
        .from('erp_documents')
        .remove([bucketUrl]);
        
      if (error) {
        console.error('Failed to delete physical file:', error);
        return res.status(500).json({ error: 'Failed to delete file' });
      }

      return res.status(200).json({ message: 'File successfully deleted', data });
    }

    return res.status(200).json({ message: 'No action taken' });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
