// src/app/api/session/commit/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';

type CommitBody = {
	sessionId?: string;
	lineTimestamps?: Record<string, string>;
	sceneUpdatedAt?: string;
	updates?: { lineId: string; audioUrl: string }[];
};

export async function POST(request: Request) {
	try {
		const body = (await request.json().catch(() => ({}))) as CommitBody;
		const sessionId = body.sessionId;
		const lineTimestamps = body.lineTimestamps;
		const sceneUpdatedAt = body.sceneUpdatedAt;
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

		// 1b) Check if the scene is still sharable and verify the scene's updated_at
		// Also get the user_id (owner) for storage path
		const { data: sceneData, error: sceneError } = await supabaseAdmin
			.from('scripts')
			.select('sharable, updated_at, user_id')
			.eq('id', sceneId)
			.single();

		if (sceneError || !sceneData) {
			console.error('Failed to load scene for commit', { sceneId, error: sceneError });
			return NextResponse.json(
				{ error: 'Failed to load scene from backend' },
				{ status: 500 }
			);
		}

		const sceneOwnerId = sceneData.user_id as string;

		// Check if scene is still sharable
		if (!sceneData.sharable) {
			return NextResponse.json(
				{
					error: 'This scene is no longer being shared. Please contact the scene owner.',
					notSharable: true
				},
				{ status: 403 }
			);
		}

		// Check if scene's updated_at has changed since the guest loaded the page
		if (sceneUpdatedAt && sceneData.updated_at && sceneUpdatedAt !== sceneData.updated_at) {
			return NextResponse.json(
				{
					error: 'The scene was edited after you opened this link. Please reload the page before submitting.',
					conflict: true
				},
				{ status: 409 }
			);
		}

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

		// 4) Upload recordings from reader-recordings to lines bucket and update DB
		const newUpdatedAt = new Date().toISOString();

		for (const update of updates) {
			const lastKnown = lineTimestamps[update.lineId];
			if (!lastKnown) {
				return NextResponse.json(
					{ error: `Missing last-known updated_at for line ${update.lineId}` },
					{ status: 400 }
				);
			}

			// Download the recording from reader-recordings bucket
			// The URL is like: https://xxx.supabase.co/storage/v1/object/public/reader-recordings/reader/{sessionId}/{lineId}.wav
			// Extract the path from the URL
			const url = new URL(update.audioUrl);
			const pathMatch = url.pathname.match(/\/storage\/v1\/object\/public\/reader-recordings\/(.+)$/);
			if (!pathMatch) {
				console.error('Invalid audio URL format', { audioUrl: update.audioUrl });
				return NextResponse.json(
					{ error: 'Invalid audio URL format' },
					{ status: 400 }
				);
			}
			const sourcePath = pathMatch[1];

			// Download the file from reader-recordings
			const { data: fileData, error: downloadError } = await supabaseAdmin.storage
				.from('reader-recordings')
				.download(sourcePath);

			if (downloadError || !fileData) {
				console.error('Failed to download recording', {
					sourcePath,
					error: downloadError
				});
				return NextResponse.json(
					{ error: 'Failed to download recording' },
					{ status: 500 }
				);
			}

			// Upload to lines bucket with structure: {user_id}/{script_id}/{line_id}.wav
			const destPath = `${sceneOwnerId}/${sceneId}/${update.lineId}.wav`;
			const arrayBuffer = await fileData.arrayBuffer();
			const buffer = Buffer.from(arrayBuffer);

			const { error: uploadError } = await supabaseAdmin.storage
				.from('lines')
				.upload(destPath, buffer, {
					contentType: 'audio/wav',
					upsert: true
				});

			if (uploadError) {
				console.error('Failed to upload to lines bucket', {
					destPath,
					error: uploadError
				});
				return NextResponse.json(
					{ error: 'Failed to upload recording' },
					{ status: 500 }
				);
			}

			// Get the public URL for the uploaded file
			const { data: { publicUrl } } = supabaseAdmin.storage
				.from('lines')
				.getPublicUrl(destPath);

			// Update the line in the database with new audio URL and timestamp
			const { error: updateError, data } = await supabaseAdmin
				.from('lines')
				.update({
					audio_url: publicUrl,
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

		// 5) Update the scene's updated_at, set sharable to false, and need_trim to true
		const { error: sceneUpdateError } = await supabaseAdmin
			.from('scripts')
			.update({
				updated_at: newUpdatedAt,
				sharable: false,
				need_trim: true
			})
			.eq('id', sceneId);

		if (sceneUpdateError) {
			console.error('Failed to update scene', { sceneId, error: sceneUpdateError });
			return NextResponse.json(
				{ error: 'Failed to update scene' },
				{ status: 500 }
			);
		}

		return NextResponse.json({ ok: true });
	} catch (e) {
		console.error('Unexpected error in /api/session/commit', e);
		return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
	}
}
