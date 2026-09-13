import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Server environment variables missing')
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Get the JWT from the request header to verify the caller is authenticated
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: 'Unauthorized caller' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { email, full_name, role, company_id, temp_password, is_tenant_admin } = await req.json()

    if (!email || !temp_password) {
      return new Response(JSON.stringify({ error: 'Missing email or temp_password' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 1. Create the user with a temporary password and auto-confirm
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: temp_password,
      email_confirm: true,
      user_metadata: {
        full_name: full_name,
      }
    })

    if (createError) {
      console.error('Error creating user:', createError)
      return new Response(JSON.stringify({ error: createError.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const userId = newUser.user.id

    // 2. Upsert into public.User (atomic, avoids race condition with trigger)
    const { error: upsertError } = await supabaseAdmin
      .from('User')
      .upsert({
        id: userId,
        email: email,
        full_name: full_name,
        role: role || 'user',
        must_change_password: true
      }, { onConflict: 'id' })

    if (upsertError) {
      console.error('Error upserting public.User:', upsertError)
      return new Response(JSON.stringify({ error: 'Failed to create user profile: ' + upsertError.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 3. Link to UserCompany
    if (company_id) {
      const { error: linkError } = await supabaseAdmin
        .from('UserCompany')
        .insert({
          user_id: userId,
          company_id: company_id,
          is_default: true,
          is_tenant_admin: is_tenant_admin === true
        })

      if (linkError) {
        console.error('Error linking UserCompany:', linkError)
        return new Response(JSON.stringify({ error: 'Failed to link user to company' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    }

    return new Response(JSON.stringify({ success: true, user: newUser.user }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('Edge Function Error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
