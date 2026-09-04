import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // We expect this to be called via pg_cron or an authenticated sweeper mechanism, 
    // but we still ensure we use the service_role key to bypass RLS.
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // 1. Fetch companies that are PENDING_DELETION and whose scheduled time has passed
    const { data: companies, error: fetchError } = await supabaseAdmin
      .from('Company')
      .select('id')
      .eq('status', 'PENDING_DELETION')
      .lte('deletion_scheduled_at', new Date().toISOString())

    if (fetchError) throw fetchError

    if (!companies || companies.length === 0) {
      return new Response(JSON.stringify({ message: "No companies ready for deletion" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    const results = [];

    for (const company of companies) {
      const companyId = company.id;
      
      try {
        // --- STORAGE CLEANUP ---
        
        // 1. Clean erp_documents (entire folder)
        const { data: documents, error: docListError } = await supabaseAdmin
          .storage
          .from('erp_documents')
          .list(companyId, { limit: 1000 })
        
        // If there are files/folders, we need to delete them recursively
        // Note: Supabase storage .list() only returns one level.
        // For a robust sweeper, you might need to query the DocumentAttachment table to get exact paths
        const { data: attachmentRecords, error: attachmentError } = await supabaseAdmin
          .from('DocumentAttachment')
          .select('file_path')
          .eq('company_id', companyId)

        if (!attachmentError && attachmentRecords && attachmentRecords.length > 0) {
          const filePaths = attachmentRecords.map(a => a.file_path);
          // Delete in batches of 100
          for (let i = 0; i < filePaths.length; i += 100) {
            const batch = filePaths.slice(i, i + 100);
            await supabaseAdmin.storage.from('erp_documents').remove(batch);
          }
        }

        // 2. Clean avatars (find URLs in BusinessPartner)
        const { data: partners, error: partnerError } = await supabaseAdmin
          .from('BusinessPartner')
          .select('profile_picture_url')
          .eq('company_id', companyId)
          .not('profile_picture_url', 'is', null)

        if (!partnerError && partners && partners.length > 0) {
          const avatarPaths = partners
            .map(p => p.profile_picture_url.split('/avatars/')[1])
            .filter(Boolean);
          
          for (let i = 0; i < avatarPaths.length; i += 100) {
            const batch = avatarPaths.slice(i, i + 100);
            await supabaseAdmin.storage.from('avatars').remove(batch);
          }
        }

        // --- SQL DATABASE CLEANUP ---
        
        // Call the highly-secured backend RPC to trigger the ON DELETE CASCADE wipe
        const { error: rpcError } = await supabaseAdmin.rpc('delete_company_data', { p_company_id: companyId });
        
        if (rpcError) throw rpcError;

        results.push({ company_id: companyId, status: 'success' });

      } catch (err) {
        console.error(`Failed to delete company ${companyId}:`, err);
        results.push({ company_id: companyId, status: 'error', error: err.message });
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
