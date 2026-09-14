import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // CORS Preflight Interception
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { target_user_id, temp_password, company_id } = await req.json()

    if (!target_user_id || !temp_password || !company_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: target_user_id, temp_password, company_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Dual-Client Pattern:
    // 1. User Client (uses caller JWT to evaluate auth.uid() in RPC permission check)
    const supabaseUserClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: hasPerm, error: permError } = await supabaseUserClient.rpc(
      'current_user_has_company_permission',
      { p_company_id: company_id, p_permission_key: 'users.edit' }
    )

    if (permError) {
      console.error('[reset-user-password] RPC Permission Check Error:', permError)
    }

    if (permError || !hasPerm) {
      const errorMessage = permError
        ? `Database Error: ${permError.message}`
        : '403 Forbidden: Insufficient permission to reset user password'
        
      return new Response(
        JSON.stringify({ error: errorMessage }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Admin Client (uses Service Role Key for auth.users password update and User table metadata)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(
      target_user_id,
      { password: temp_password }
    )

    if (updateAuthError) {
      console.error('[reset-user-password] Admin auth updateUserById Error:', updateAuthError)
      return new Response(
        JSON.stringify({ error: updateAuthError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Set must_change_password = true, clear temp_password in public."User" so no plaintext password exists in DB
    const { error: updateUserError } = await supabaseAdmin
      .from('User')
      .update({ temp_password: null, must_change_password: true })
      .eq('id', target_user_id)

    if (updateUserError) {
      console.error('Error updating public User table:', updateUserError)
    }

    // Revoke active sessions via dedicated revoke_user_sessions RPC using Admin client
    const { error: revokeError } = await supabaseAdmin.rpc('revoke_user_sessions', {
      p_company_id: company_id,
      p_target_user_id: target_user_id,
      p_reason: 'Admin issued temporary password reset'
    })

    if (revokeError) {
      console.error('[reset-user-password] Revoke sessions Error:', revokeError)
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Password reset successfully' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    console.error('[reset-user-password] Unhandled exception:', err)
    return new Response(
      JSON.stringify({ error: err.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
