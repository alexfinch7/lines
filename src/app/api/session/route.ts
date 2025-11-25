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

	// 2) Try to hydrate actor/reader line text and ordering from the live script lines table.
	// This lets share links always reflect the latest script edits while still preserving
	// any existing recording URLs stored on the share session.
	// Use the admin client here so we bypass RLS and always see the canonical script.
	const { data: liveLines, error: liveLinesError } = await supabaseAdmin
		.from('lines')
		.select('id, raw_text, order_index, is_stage_direction, is_cue_line, audio_url')
		.eq('script_id', baseSession.scene_id);

	if (!liveLinesError && liveLines) {
		const canonicalLines = (liveLines as {
			id: string;
			raw_text: string;
			order_index: number | null;
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

		const hasStoredLines =
			(baseSession.actor_lines && baseSession.actor_lines.length > 0) ||
			(baseSession.reader_lines && baseSession.reader_lines.length > 0);

		let actorLines: ActorLine[] = [];
		let readerLines: ReaderLine[] = [];

		if (hasStoredLines) {
			// Legacy / client-provided share sessions: preserve stored line sets and
			// just refresh text + ordering from the canonical script.
			const byId = new Map<string, { raw_text: string; order_index: number | null }>();
			for (const line of canonicalLines) {
				byId.set(line.id, {
					raw_text: line.raw_text,
					order_index: line.order_index
				});
			}

			actorLines =
				baseSession.actor_lines?.map((l) => {
					const canonical = byId.get(l.lineId);
					return {
						...l,
						text: canonical?.raw_text ?? l.text,
						index: canonical?.order_index ?? l.index
					};
				}) ?? [];

			readerLines =
				baseSession.reader_lines?.map((l) => {
					const canonical = byId.get(l.lineId);
					return {
						...l,
						text: canonical?.raw_text ?? l.text,
						index: canonical?.order_index ?? l.index
					};
				}) ?? [];
		} else {
			// Synced shares: auto-populate both actor and reader lines directly from
			// the canonical scene layout in Supabase.
			for (const line of canonicalLines) {
				if (line.is_stage_direction) continue;
				const index = line.order_index ?? 0;

				if (line.is_cue_line) {
					actorLines.push({
						lineId: line.id,
						index,
						text: line.raw_text,
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
		}

		const hydratedSession: ShareSession = {
			...baseSession,
			actor_lines: actorLines,
			reader_lines: readerLines
		};

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

		return NextResponse.json({ session: hydratedSession, sceneVersion });
	}

	// Fallback: if we couldn't load live lines, just return the stored snapshot with a
	// version derived from the stored actor/reader lines.
	const snapshotSession = baseSession as ShareSession;
	const sceneVersion = crypto
		.createHash('sha1')
		.update(
			JSON.stringify({
				actor:
					snapshotSession.actor_lines?.map((l) => ({
						id: l.lineId,
						idx: l.index,
						text: l.text
					})) ?? [],
				reader:
					snapshotSession.reader_lines?.map((l) => ({
						id: l.lineId,
						idx: l.index,
						text: l.text
					})) ?? []
			})
		)
		.digest('hex');

	return NextResponse.json({ session: snapshotSession, sceneVersion });
}

