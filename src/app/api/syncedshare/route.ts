// src/app/api/syncedshare/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin, supabaseAnon } from '@/lib/supabaseServer';
import type { ActorLine, ReaderLine, ShareSession } from '@/types/share';

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

		// First, check if a share session already exists for this scene. We keep a single
		// share link per scene so the same URL is reused instead of creating duplicates.
		const { data: existing, error: existingError } = await supabaseAnon
			.from('share_sessions')
			.select('id, title, scene_id')
			.eq('scene_id', sceneId)
			.order('created_at', { ascending: false })
			.limit(1)
			.maybeSingle();

		// Derive base URL from request headers when possible (works on Vercel), fallback to env or localhost
		const forwardedProto = request.headers.get('x-forwarded-proto');
		const host = request.headers.get('host');
		const baseUrl =
			(forwardedProto && host ? `${forwardedProto}://${host}` : undefined) ||
			process.env.NEXT_PUBLIC_BASE_URL ||
			'http://localhost:3000';

		if (!existingError && existing) {
			const existingId = existing.id as string;
			const shareUrl = `${baseUrl}/share/${existingId}`;

			return NextResponse.json({
				shareUrl,
				sessionId: existingId,
				session: {
					id: existingId,
					sceneId: existing.scene_id,
					title: existing.title
				}
			});
		}

		// Load canonical scene lines + audio from Supabase so we can
		// auto-populate the share session from the backend, not the client.
		const { data: liveLines, error: liveLinesError } = await supabaseAdmin
			.from('lines')
			.select('id, order_index, raw_text, is_stage_direction, is_cue_line, audio_url')
			.eq('script_id', sceneId);

		if (liveLinesError || !liveLines || liveLines.length === 0) {
			console.error('No canonical lines found for scene', sceneId, liveLinesError);
			return NextResponse.json(
				{ error: 'No lines found for the provided sceneId' },
				{ status: 404 }
			);
		}

		const canonicalLines = (liveLines as {
			id: string;
			order_index: number | null;
			raw_text: string;
			is_stage_direction: boolean | null;
			is_cue_line: boolean | null;
			audio_url: string | null;
		}[]).sort((a, b) => {
			if (a.order_index === b.order_index) {
				return a.id.localeCompare(b.id);
			}
			if (a.order_index == null) return 1;
			if (b.order_index == null) return -1;
			return a.order_index - b.order_index;
		});

		// Convention from the mobile app:
		// - Non-cue lines are the READER's lines to record.
		// - Cue lines are the ACTOR's lines; their audio comes from the scene.
		const readerLines: ReaderLine[] = [];
		const actorLines: ActorLine[] = [];

		for (const line of canonicalLines) {
			if (line.is_stage_direction) continue;
			const index = line.order_index ?? 0;

			if (line.is_cue_line) {
				actorLines.push({
					lineId: line.id,
					index,
					text: line.raw_text,
					// Use the canonical scene audio if present; the share flow will still
					// update audio per-session when new recordings are made.
					audioUrl: line.audio_url ?? ''
				});
			} else {
				readerLines.push({
					lineId: line.id,
					index,
					text: line.raw_text
				});
			}
		}

		// Insert a share session that is fully populated from the canonical scene.
		const { data, error } = await supabaseAdmin
			.from('share_sessions')
			.insert({
				title,
				status: 'pending',
				scene_id: sceneId,
				actor_lines: actorLines,
				reader_lines: readerLines,
				user_id: user.id
			})
			.select('*')
			.single();

		if (error || !data) {
			console.error('Insert error (syncedshare)', error);
			return NextResponse.json({ error: 'Failed to create synced share session' }, { status: 500 });
		}

		const session = data as ShareSession;
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


