// src/app/api/session/commit/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';

type CommitBody = {
	sessionId?: string;
	lineTimestamps?: Record<string, string>;
	updates?: { lineId: string; audioUrl: string }[];
};

export async function POST(request: Request) {
	try {
		const body = (await request.json().catch(() => ({}))) as CommitBody;
		const sessionId = body.sessionId;
		const lineTimestamps = body.lineTimestamps;
		const updates = body.updates ?? [];

		if (!sessionId || !lineTimestamps || updates.length === 0) {
			return NextResponse.json(
				{ error: 'sessionId, lineTimestamps, and at least one update are required' },
				{ status: 400 }
			);
		}

		// 1) Load the share session to discover which scene/script it belongs to.
		const { data: sessionRow, error: sessionError } = await supabaseAdmin
			.from('share_sessions')
			.select('id, scene_id')
			.eq('id', sessionId)
			.single();

		if (sessionError || !sessionRow) {
			return NextResponse.json({ error: 'Session not found' }, { status: 404 });
		}

		const sceneId = sessionRow.scene_id as string;

		// 2) Fetch the current updated_at timestamps for all lines in this scene.
		const { data: lines, error: linesError } = await supabaseAdmin
			.from('lines')
			.select('id, updated_at')
			.eq('script_id', sceneId);

		if (linesError || !lines || lines.length === 0) {
			console.error('Failed to load lines for commit', { sceneId, error: linesError });
			return NextResponse.json(
				{ error: 'Failed to load scene lines from backend' },
				{ status: 500 }
			);
		}

		const currentTimestamps: Record<string, string> = {};
		for (const line of lines as { id: string; updated_at: string | null }[]) {
			if (line.updated_at) {
				currentTimestamps[line.id] = line.updated_at;
			}
		}

		// 3) Compare the full set of timestamps from when the guest loaded the page
		// against the current values in Supabase. If anything differs (including new
		// or deleted lines), we fail with a conflict.
		const initialKeys = Object.keys(lineTimestamps);
		const currentKeys = Object.keys(currentTimestamps);
		const sameLength = initialKeys.length === currentKeys.length;
		let timestampsMatch = sameLength;

		if (timestampsMatch) {
			for (const key of initialKeys) {
				if (!(key in currentTimestamps) || currentTimestamps[key] !== lineTimestamps[key]) {
					timestampsMatch = false;
					break;
				}
			}
		}

		if (!timestampsMatch) {
			return NextResponse.json(
				{
					error:
						'The scene was edited after you opened this link. Please reload the page before submitting.',
					conflict: true
				},
				{ status: 409 }
			);
		}

		// 4) With the global timestamps still matching, apply per-line updates using a
		// conditional updated_at check for each line. This guards against races between
		// the check above and individual updates.
		for (const update of updates) {
			const lastKnown = lineTimestamps[update.lineId];
			if (!lastKnown) {
				return NextResponse.json(
					{ error: `Missing last-known updated_at for line ${update.lineId}` },
					{ status: 400 }
				);
			}

			const newUpdatedAt = new Date().toISOString();

			const { error: updateError, data } = await supabaseAdmin
				.from('lines')
				.update({
					audio_url: update.audioUrl,
					updated_at: newUpdatedAt
				})
				.eq('id', update.lineId)
				.eq('updated_at', lastKnown)
				.select('id')
				.maybeSingle();

			if (updateError || !data) {
				console.error('Conflict while updating line audio', {
					lineId: update.lineId,
					error: updateError
				});
				return NextResponse.json(
					{
						error:
							'The scene was edited while you were submitting. Please reload the page before submitting again.',
						conflict: true
					},
					{ status: 409 }
				);
			}
		}

		return NextResponse.json({ ok: true });
	} catch (e) {
		console.error('Unexpected error in /api/session/commit', e);
		return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
	}
}


