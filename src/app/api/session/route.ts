// src/app/api/session/route.ts
import crypto from 'crypto';
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
		const actorLines: ActorLine[] = body.actorLines ?? [];
		const readerLines: ReaderLine[] = body.readerLines ?? [];

		if (!sceneId || actorLines.length === 0) {
			return NextResponse.json(
				{ error: 'sceneId and actorLines are required' },
				{ status: 400 }
			);
		}

		const { data, error } = await supabaseAnon
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
	// For convenience: /api/session?id=...
	const { searchParams } = new URL(request.url);
	const id = searchParams.get('id');

	if (!id) {
	return NextResponse.json({ error: 'Missing id' }, { status: 400 });
	}

	// 1) Load the stored share session (includes scene_id and any existing audio URLs)
	const { data, error } = await supabaseAnon
		.from('share_sessions')
		.select('*')
		.eq('id', id)
		.single();

	if (error || !data) {
		return NextResponse.json({ error: 'Not found' }, { status: 404 });
	}

	const baseSession = data as ShareSession & { scene_id: string };

	// 1b) Check if the scene is sharable and get the scene's updated_at timestamp
	const { data: sceneData, error: sceneError } = await supabaseAdmin
		.from('scripts')
		.select('sharable, updated_at')
		.eq('id', baseSession.scene_id)
		.single();

	if (sceneError || !sceneData) {
		console.error('Failed to load scene for share session', {
			sceneId: baseSession.scene_id,
			error: sceneError
		});
		return NextResponse.json(
			{ error: 'Failed to load scene from backend' },
			{ status: 500 }
		);
	}

	const sceneSharable = sceneData.sharable as boolean;
	const sceneUpdatedAt = sceneData.updated_at as string | null;

	if (!sceneSharable) {
		return NextResponse.json(
			{ error: 'This scene is no longer shared. Please contact the scene owner.', notSharable: true },
			{ status: 403 }
		);
	}

	// 2) Always hydrate actor/reader line text, ordering, and default audio from the
	// canonical Supabase `lines` table for this scene. We no longer trust any client-
	// provided scene layout stored on the share session, only per-session recordings.
	// Use the admin client here so we bypass RLS and always see the canonical script.
	const { data: liveLines, error: liveLinesError } = await supabaseAdmin
		.from('lines')
		.select('id, raw_text, order_index, is_stage_direction, is_cue_line, audio_url, updated_at')
		.eq('script_id', baseSession.scene_id);

	if (!liveLinesError && liveLines && liveLines.length > 0) {
		const canonicalLines = (liveLines as {
			id: string;
			raw_text: string;
			order_index: number | null;
			is_stage_direction: boolean | null;
			is_cue_line: boolean | null;
			audio_url: string | null;
			updated_at: string | null;
		}[]).sort((a, b) => {
			if (a.order_index === b.order_index) {
				return a.id.localeCompare(b.id);
			}
			if (a.order_index == null) return 1;
			if (b.order_index == null) return -1;
			return a.order_index - b.order_index;
		});

		let actorLines: ActorLine[] = [];
		let readerLines: ReaderLine[] = [];

		// Build maps of per-session recording overrides (audio only). These may come
		// from reader uploads via /api/session/line or any future per-session actor
		// recordings. Scene structure (which lines exist, their text/order) is always
		// derived from `lines`, never from these arrays.
		const actorAudioOverrides = new Map<string, string>();
		for (const l of baseSession.actor_lines || []) {
			if (l.audioUrl) actorAudioOverrides.set(l.lineId, l.audioUrl);
		}

		const readerAudioOverrides = new Map<string, string>();
		for (const l of baseSession.reader_lines || []) {
			if (l.audioUrl) readerAudioOverrides.set(l.lineId, l.audioUrl);
		}

		// Auto-populate both actor and reader lines directly from the canonical scene
		// layout in Supabase, then layer per-session audio overrides on top.
		for (const line of canonicalLines) {
			if (line.is_stage_direction) continue;
			const index = line.order_index ?? 0;

			if (line.is_cue_line) {
				const override = actorAudioOverrides.get(line.id);
				actorLines.push({
					lineId: line.id,
					index,
					text: line.raw_text,
					audioUrl: override ?? line.audio_url ?? ''
				});
			} else {
				const override = readerAudioOverrides.get(line.id);
				const readerLine: ReaderLine = {
					lineId: line.id,
					index,
					text: line.raw_text
				};
				if (override) {
					readerLine.audioUrl = override;
				}
				readerLines.push(readerLine);
			}
		}

		const hydratedSession: ShareSession = {
			...baseSession,
			actor_lines: actorLines,
			reader_lines: readerLines
		};

		// Capture the per-line updated_at timestamps so the client can perform
		// optimistic concurrency checks on every recording + final submit.
		const lineUpdatedAt: Record<string, string> = {};
		for (const line of canonicalLines) {
			if (line.updated_at) {
				lineUpdatedAt[line.id] = line.updated_at;
			}
		}

		// Scene version is derived from the full canonical line list, so additions/removals
		// of lines (not just text changes) are detected as well.
		const sceneVersion = crypto
			.createHash('sha1')
			.update(
				JSON.stringify(
					canonicalLines.map((l) => ({
						id: l.id,
						idx: l.order_index,
						text: l.raw_text
					}))
				)
			)
			.digest('hex');

		return NextResponse.json({
			session: hydratedSession,
			sceneVersion,
			lineUpdatedAt,
			sceneUpdatedAt,
			sceneSharable
		});
	}

	// If we couldn't load canonical lines for this scene, fail fast instead of
	// falling back to any client-provided snapshot. Canonical Supabase lines are
  	// the single source of truth for scene content.
	console.error('Failed to load canonical lines for share session', {
		sceneId: baseSession.scene_id,
		error: liveLinesError
	});
	return NextResponse.json(
		{ error: 'Failed to load scene lines from backend' },
		{ status: 500 }
	);
}

