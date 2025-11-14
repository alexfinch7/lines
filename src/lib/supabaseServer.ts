// src/lib/supabaseServer.ts
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Server-side client with full privileges (API routes and server components ONLY)
export const supabaseServer = createClient(url, serviceKey, {
	auth: { persistSession: false }
});


