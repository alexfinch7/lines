// src/app/api/syncedshare/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin, supabaseAnon } from '@/lib/supabaseServer';
import type { ShareSession } from '@/types/share';

async function getUserFromRequest(request: Request) {
	// Mobile / API: Authorization: Bearer <token>
	const authHeader = request.headers.get('authorization');
	if (!authHeader?.startsWith('Bearer ')) return { user: null };

	const token = authHeader.slice('Bearer '.length).trim();
	const { data, error } = await supabaseAdmin.auth.getUser(token);
	if (error || !data?.user) return { user: null };

	return { user: data.user };
}

export async function POST(request: Request) {
	try {
		const { user } = await getUserFromRequest(request);

		if (!user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const body = await request.json().catch(() => ({}));
		const title: string = body.title ?? 'Shared Scene';
		const sceneId: string | null = body.sceneId ?? null;

		if (!sceneId) {
			return NextResponse.json({ error: 'sceneId is required' }, { status: 400 });
		}

		// Insert a minimal share session that points at the canonical script/scene.
		// Line text and ordering are hydrated on-demand via /api/session GET.
		const { data, error } = await supabaseAnon
			.from('share_sessions')
			.insert({
				title,
				status: 'pending',
				scene_id: sceneId,
				actor_lines: [], // will be hydrated from backend canonical lines
				reader_lines: [],
				user_id: user.id
			})
			.select('*')
			.single();

		if (error || !data) {
			console.error('Insert error (syncedshare)', error);
			return NextResponse.json({ error: 'Failed to create synced share session' }, { status: 500 });
		}

		const session = data as ShareSession;

		// Derive base URL from request headers when possible (works on Vercel), fallback to env or localhost
		const forwardedProto = request.headers.get('x-forwarded-proto');
		const host = request.headers.get('host');
		const baseUrl =
			(forwardedProto && host ? `${forwardedProto}://${host}` : undefined) ||
			process.env.NEXT_PUBLIC_BASE_URL ||
			'http://localhost:3000';

		const sessionId = session.id;
		const shareUrl = `${baseUrl}/share/${sessionId}`;

		return NextResponse.json({
			shareUrl,
			sessionId,
			session: {
				id: session.id,
				sceneId: session.scene_id,
				title: session.title
			}
		});
	} catch (e) {
		console.error('Unexpected error in /api/syncedshare', e);
		return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
	}
}


