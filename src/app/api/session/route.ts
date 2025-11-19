// src/app/api/session/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient, supabaseAdmin } from '@/lib/supabaseServer';
import type { ActorLine, ReaderLine, ShareSession } from '@/types/share';

async function getUserFromRequest(request: Request) {
	// 1) Try cookie-based (web)
	const supabase = createSupabaseServerClient();
	const {
		data: { user }
	} = await supabase.auth.getUser();

	if (user) return { user };

	// 2) Fallback: Authorization: Bearer <token> (mobile)
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
		const actorLines: ActorLine[] = body.actorLines ?? [];
		const readerLines: ReaderLine[] = body.readerLines ?? [];

		if (!sceneId || actorLines.length === 0) {
			return NextResponse.json(
				{ error: 'sceneId and actorLines are required' },
				{ status: 400 }
			);
		}

		const supabase = createSupabaseServerClient();

		const { data, error } = await supabase
			.from('share_sessions')
			.insert({
				title,
				status: 'pending',
				scene_id: sceneId,
				actor_lines: actorLines,
				reader_lines: readerLines,
				user_id: user.id
			})
			.select('id')
			.single();

		if (error || !data) {
			console.error('Insert error', error);
			return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
		}

		// Derive base URL from request headers when possible (works on Vercel), fallback to env or localhost
		const forwardedProto = request.headers.get('x-forwarded-proto');
		const host = request.headers.get('host');
		const baseUrl =
			(forwardedProto && host ? `${forwardedProto}://${host}` : undefined) ||
			process.env.NEXT_PUBLIC_BASE_URL ||
			'http://localhost:3000';
		const shareUrl = `${baseUrl}/share/${data.id}`;
		return NextResponse.json({ id: data.id, shareUrl });
	} catch (e) {
		console.error(e);
		return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
	}
}

export async function GET(request: Request) {
	const supabase = createSupabaseServerClient();

	// For convenience: /api/session?id=...
	const { searchParams } = new URL(request.url);
	const id = searchParams.get('id');

	if (!id) {
		return NextResponse.json({ error: 'Missing id' }, { status: 400 });
	}

	const { data, error } = await supabase
		.from('share_sessions')
		.select('*')
		.eq('id', id)
		.single();

	if (error || !data) {
		return NextResponse.json({ error: 'Not found' }, { status: 404 });
	}

	const session = data as ShareSession;
	return NextResponse.json({ session });
}

