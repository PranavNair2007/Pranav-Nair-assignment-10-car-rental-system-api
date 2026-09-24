const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error(
    '[Supabase] Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env. ' +
    'Copy .env.example to .env and fill in your project credentials.'
  );
}

// anon client — used for auth (signUp/signIn) and any request where we want
// Row Level Security to apply as the calling user.
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// service-role client — used server-side only for privileged DB operations
// (vehicle CRUD, rental collision checks/writes) that don't need to be
// scoped per-user via RLS. NEVER expose the service role key to a client.
const supabaseAdmin = SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : supabase;

module.exports = { supabase, supabaseAdmin };
