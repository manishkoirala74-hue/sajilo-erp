import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const startTime = Date.now();
  const supabaseUrl = process.env.VITE_SAJILO_APP_BASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SAJILO_APP_ID;

  try {
    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({
        error: 'Missing Supabase environment variables'
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Lightweight query that exercises the PostgreSQL engine
    const { data, error } = await supabase
      .from('Company')
      .select('id')
      .limit(1);

    const durationMs = Date.now() - startTime;

    if (error) {
      return res.status(502).json({
        status: 'error',
        message: error.message,
        durationMs
      });
    }

    return res.status(200).json({
      status: 'warm',
      timestamp: new Date().toISOString(),
      durationMs,
      rows: data ? data.length : 0
    });
  } catch (err) {
    return res.status(500).json({
      status: 'fatal',
      error: err.message,
      durationMs: Date.now() - startTime
    });
  }
}
