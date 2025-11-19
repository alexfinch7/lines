// src/app/api/upload/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';

export const runtime = 'nodejs';

export async function POST(request: Request) {
	try {
		const formData = await request.formData();
		const file = formData.get('file') as File | null;
		const sessionId = formData.get('sessionId') as string | null;
		const lineId = formData.get('lineId') as string | null;
		const role = ((formData.get('role') as string | null) || 'reader').toLowerCase(); // 'actor' | 'reader'

		if (!file || !sessionId || !lineId) {
			return NextResponse.json(
				{ error: 'file, sessionId, and lineId are required' },
				{ status: 400 }
			);
		}

		const arrayBuffer = await file.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);

		const ext = 'webm';
		const prefix = role === 'actor' ? 'actor' : 'reader';
		const path = `${prefix}/${sessionId}/${lineId}.${ext}`;

		const { error: uploadError } = await supabaseAdmin.storage
			.from('reader-recordings')
			.upload(path, buffer, {
				contentType: file.type || 'audio/webm',
				upsert: true
			});

		if (uploadError) {
			console.error('Storage upload error:', uploadError);
			return NextResponse.json(
				{ error: 'Upload failed', details: uploadError.message ?? String(uploadError) },
				{ status: 500 }
			);
		}

		const {
			data: { publicUrl }
		} = supabaseAdmin.storage.from('reader-recordings').getPublicUrl(path);

		return NextResponse.json({ url: publicUrl });
	} catch (e) {
		console.error(e);
		return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
	}
}

