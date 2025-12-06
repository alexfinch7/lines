import { NextResponse } from 'next/server';
import { extractDialogueFromPdf } from '@/lib/extractDialogue';
import { uploadToStorageAndGetUrl, deleteFromTempStorage } from '@/lib/uploadToStorage';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Cue = ['myself' | 'reader', string];
type ParsedLines = { lines: Cue[] };

export async function POST(request: Request) {
	let pdfPath: string | null = null;

	try {
		const formData = await request.formData();
		const file = formData.get('file') as File | null;
		const characterName = (formData.get('characterName') as string | null)?.trim();

		if (!file || !characterName) {
			return NextResponse.json(
				{ error: 'Missing file or characterName' },
				{ status: 400 }
			);
		}

		// Optional soft check: if a type is provided and it's clearly not a PDF, reject.
		if (file.type && !file.type.toLowerCase().includes('pdf')) {
			return NextResponse.json(
				{ error: `Unexpected file type: ${file.type}` },
				{ status: 400 }
			);
		}

		if (!process.env.MISTRAL_API_KEY) {
			return NextResponse.json({ error: 'Missing MISTRAL_API_KEY' }, { status: 500 });
		}

		// 1) Upload PDF to storage and obtain a public URL that Mistral can fetch
		const { url: pdfUrl, path } = await uploadToStorageAndGetUrl(file);
		pdfPath = path;

		// 2) Use Mistral OCR + document annotations to extract structured dialogue
		const dialogueDoc = await extractDialogueFromPdf({ pdfUrl, characterName });

		const target = characterName.toUpperCase();

		const lines: Cue[] = dialogueDoc.lines.map((line) => {
			const normalizedSpeaker = line.speaker.trim().toUpperCase();

			const role: 'myself' | 'reader' = normalizedSpeaker.includes(target)
				? 'myself'
				: 'reader';

			return [role, line.text];
		});

		const responseBody: ParsedLines = { lines };

		console.log(
			'Sending import-pdf-cues response to client (Mistral annotations):',
			JSON.stringify(responseBody, null, 2)
		);

		// Clean up the temporary PDF after successful processing
		await deleteFromTempStorage(pdfPath);

		return NextResponse.json(responseBody);
	} catch (error: any) {
		console.error('Unexpected error in import-pdf-cues', error);

		// Attempt cleanup even on error
		if (pdfPath) {
			await deleteFromTempStorage(pdfPath).catch(() => {});
		}

		return NextResponse.json(
			{ error: error?.message || 'Internal server error' },
			{ status: 500 }
		);
	}
}

