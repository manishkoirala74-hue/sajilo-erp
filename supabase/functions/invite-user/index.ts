import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Server misconfiguration')
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing Authorization header')
    const token = authHeader.replace('Bearer ', '')
    
    const { data: { user: callingUser }, error: userError } = await supabaseAdmin.auth.getUser(token)
    if (userError || !callingUser) {
      throw new Error('Unauthorized')
    }

    const { data: callerProfile, error: callerError } = await supabaseAdmin
      .from('User')
      .select('role, account_status')
      .eq('id', callingUser.id)
      .single()

    if (callerError || !callerProfile || callerProfile.account_status !== 'active' || (callerProfile.role !== 'admin' && callerProfile.role !== 'tenant_admin')) {
      throw new Error('Forbidden: You must be an active admin to invite users.')
    }

    const { email, role, company_id, company_role_id } = await req.json()
    if (!email) {
      throw new Error('Email is required')
    }

    const { data: authData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email)
    
    if (inviteError) {
      throw inviteError
    }

    const newUserId = authData.user.id

    const { error: profileError } = await supabaseAdmin
      .from('User')
      .upsert({ 
        id: newUserId,
        email: email,
        role: role === 'admin' ? 'tenant_admin' : role,
        company_scope: 'SELECTED',
        account_status: 'active'
      }, {
        onConflict: 'id'
      })

    if (profileError) {
      throw profileError
    }

    if (company_id) {
       const { error: ucError } = await supabaseAdmin
         .from('UserCompany')
         .insert({
           user_id: newUserId,
           company_id: company_id,
           is_tenant_admin: role === 'admin' || role === 'tenant_admin',
           company_role_id: company_role_id || null,
           membership_status: 'active',
           is_default: true
         })
         
       if (ucError) {
         throw ucError
       }
    }

    return new Response(JSON.stringify({ success: true, user: authData.user }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
