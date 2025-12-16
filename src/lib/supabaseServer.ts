// src/lib/supabaseServer.ts
// src/lib/supabaseServer.ts
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
// Prefer secret key (new format) but fallback to service role key (legacy)
const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Admin client (for token verification fallback, migrations, etc.)
export const supabaseAdmin = createClient(url, serviceKey, {
	auth: { persistSession: false }
});

// Anonymous server-side client (no cookies; used for public reads and writes that
// don't rely on browser sessions)
export const supabaseAnon = createClient(url, anonKey, {
	auth: { persistSession: false }
});

