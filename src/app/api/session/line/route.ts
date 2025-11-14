// src/app/api/session/line/route.ts
import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import type { ShareSession, ReaderLine } from '@/types/share';

export async function POST(request: Request) {
	try {
		const body = await request.json().catch(() => ({}));
		const sessionId: string | undefined = body.sessionId;
		const lineId: string | undefined = body.lineId;
		const audioUrl: string | undefined = body.audioUrl;

		if (!sessionId || !lineId || !audioUrl) {
			return NextResponse.json(
				{ error: 'sessionId, lineId, and audioUrl are required' },
				{ status: 400 }
			);
		}

		const { data, error } = await supabaseServer
			.from('share_sessions')
			.select('*')
			.eq('id', sessionId)
			.single();

		if (error || !data) {
			console.error(error);
			return NextResponse.json({ error: 'Session not found' }, { status: 404 });
		}

		const session = data as ShareSession;
		const updatedReaderLines: ReaderLine[] = (session.reader_lines || []).map((line) =>
			line.lineId === lineId ? { ...line, audioUrl } : line
		);

		const { error: updateError } = await supabaseServer
			.from('share_sessions')
			.update({ reader_lines: updatedReaderLines })
			.eq('id', sessionId);

		if (updateError) {
			console.error(updateError);
			return NextResponse.json({ error: 'Failed to update reader line' }, { status: 500 });
		}

		return NextResponse.json({ ok: true });
	} catch (e) {
		console.error(e);
		return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
	}
}


