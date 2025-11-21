'use client';

// src/lib/supabaseClient.ts
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Browser-side client with persisted auth session for phone OTP login
export const supabaseClient = createClient(url, anonKey, {
	auth: {
		persistSession: true,
		autoRefreshToken: true
	}
});


