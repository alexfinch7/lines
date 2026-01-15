// src/app/api/session/done/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { messaging } from '@/lib/firebase-admin';
import type { ShareSession, ReaderLine } from '@/types/share';

export async function POST(request: Request) {
	try {
		const contentType = request.headers.get('content-type') || '';
		let id: string | null = null;

		if (contentType.includes('application/json')) {
			const body = await request.json().catch(() => ({}));
			id = body.id ?? null;
		} else if (contentType.includes('application/x-www-form-urlencoded')) {
			const formData = await request.formData();
			id = (formData.get('id') as string) ?? null;
		} else {
			const body = await request.json().catch(() => ({}));
			id = body.id ?? null;
		}

		if (!id) {
			return NextResponse.json({ error: 'Missing id' }, { status: 400 });
		}

		const { data, error } = await supabaseAdmin
			.from('share_sessions')
			.select('*')
			.eq('id', id)
			.single();

		if (error || !data) {
			return NextResponse.json({ error: 'Not found' }, { status: 404 });
		}

		const session = data as ShareSession & { user_id?: string };
		const allReaders = (session.reader_lines || []) as ReaderLine[];
		const allHaveAudio = allReaders.every((l) => !!l.audioUrl);
		if (!allHaveAudio) {
			console.warn('Marking done even though some lines may not have audio');
			// For stricter behavior, return 400 here instead.
		}

		const { error: updateError } = await supabaseAdmin
			.from('share_sessions')
			.update({ status: 'completed' })
			.eq('id', id);

		if (updateError) {
			return NextResponse.json({ error: 'Failed to mark as completed' }, { status: 500 });
		}

		// Send push notification to scene owner (fire-and-forget)
		if (session.user_id && messaging) {
			// Fetch owner's FCM token from profiles table
			const { data: profile } = await supabaseAdmin
				.from('profiles')
				.select('fcm_token')
				.eq('user_id', session.user_id)
				.single();

			if (profile?.fcm_token) {
				messaging
					.send({
						token: profile.fcm_token,
						notification: {
							title: 'Lines Received! 🎬',
							body: `Someone submitted reader lines for "${session.title}"`,
						},
						data: {
							type: 'lines_received',
							sessionId: session.id,
							sceneId: session.scene_id,
						},
						android: {
							priority: 'high',
							notification: {
								sound: 'default',
							},
						},
						apns: {
							payload: {
								aps: {
									sound: 'default',
									badge: 1,
									contentAvailable: true,
								},
							},
						},
					})
					.then(() => {
						console.log('Push notification sent for session:', session.id);
					})
					.catch((err) => {
						console.error('Failed to send push notification:', err);
					});
			} else {
				console.log('No FCM token for user, skipping push notification');
			}
		}

		return NextResponse.json({ ok: true });
	} catch (e) {
		console.error(e);
		return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
	}
}

