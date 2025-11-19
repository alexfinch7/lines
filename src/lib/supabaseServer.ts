// src/lib/supabaseServer.ts
// src/lib/supabaseServer.ts
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Admin client (for token verification fallback, migrations, etc.)
export const supabaseAdmin = createClient(url, serviceKey, {
	auth: { persistSession: false }
});

// Cookie-aware server client (for web requests using browser sessions)
export function createSupabaseServerClient() {
	const cookieStore = cookies() as any;

	return createServerClient(url, anonKey, {
		cookies: {
			getAll() {
				return cookieStore.getAll();
			},
			setAll(
				cookiesToSet: { name: string; value: string; options: Record<string, unknown> }[]
			) {
				cookiesToSet.forEach(({ name, value, options }) => {
					cookieStore.set(name, value, options);
				});
			}
		}
	});
}

