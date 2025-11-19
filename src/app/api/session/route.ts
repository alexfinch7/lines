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
	const { data: liveLines, error: liveLinesError } = await supabaseAnon
		.from('lines')
		.select('id, raw_text, order_index')
		.eq('script_id', baseSession.scene_id);

	if (!liveLinesError && liveLines) {
		const byId = new Map<string, { raw_text: string; order_index: number | null }>();
		for (const line of liveLines as { id: string; raw_text: string; order_index: number | null }[]) {
			byId.set(line.id, {
				raw_text: line.raw_text,
				order_index: line.order_index
			});
		}

		const mergedActor =
			baseSession.actor_lines?.map((l) => {
				const canonical = byId.get(l.lineId);
				return {
					...l,
					text: canonical?.raw_text ?? l.text,
					index: canonical?.order_index ?? l.index
				};
			}) ?? [];

		const mergedReader =
			baseSession.reader_lines?.map((l) => {
				const canonical = byId.get(l.lineId);
				return {
					...l,
					text: canonical?.raw_text ?? l.text,
					index: canonical?.order_index ?? l.index
				};
			}) ?? [];

		const hydratedSession: ShareSession = {
			...baseSession,
			actor_lines: mergedActor,
			reader_lines: mergedReader
		};

		const sceneVersion = crypto
			.createHash('sha1')
			.update(
				JSON.stringify({
					actor: mergedActor.map((l) => ({
						id: l.lineId,
						idx: l.index,
						text: l.text
					})),
					reader: mergedReader.map((l) => ({
						id: l.lineId,
						idx: l.index,
						text: l.text
					}))
				})
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

