import { NextResponse } from 'next/server';
import { extractDialogueFromImage } from '@/lib/extractDialogue';

export const runtime = 'nodejs';
export const maxDuration = 60; // Increase if processing many pages

type Cue = ['myself' | 'reader', string];
type ParsedLines = { lines: Cue[] };

type ImportBody = {
	imageUrls: string[];
	title?: string;
	characterName: string;
};

export async function POST(request: Request) {
	try {
		const body = (await request.json().catch(() => ({}))) as ImportBody;
		const { imageUrls, characterName } = body;

		if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0 || !characterName) {
			return NextResponse.json(
				{ error: 'imageUrls array and characterName are required' },
				{ status: 400 }
			);
		}

		if (!process.env.MISTRAL_API_KEY) {
			return NextResponse.json({ error: 'Missing MISTRAL_API_KEY' }, { status: 500 });
		}

		console.log(`Processing ${imageUrls.length} pages for character: ${characterName}`);

		const target = characterName.trim().toUpperCase();
		const allLines: Cue[] = [];

		// Process pages sequentially to maintain order and avoid rate limits
		// Parallel processing is faster but might hit Mistral rate limits depending on your tier
		for (const url of imageUrls) {
			try {
				const dialogueDoc = await extractDialogueFromImage({
					imageUrl: url,
					characterName: target // Pass for context if needed, though extraction logic filters later
				});

				// Convert page lines to Cue format
				const pageLines: Cue[] = dialogueDoc.lines.map((line) => {
					const normalizedSpeaker = line.speaker.trim().toUpperCase();
					const role: 'myself' | 'reader' = normalizedSpeaker.includes(target)
						? 'myself'
						: 'reader';
					return [role, line.text];
				});

				allLines.push(...pageLines);
			} catch (pageError) {
				console.error(`Failed to process page ${url}:`, pageError);
				// Continue with other pages? Or fail? 
				// For now, we continue and log the error.
			}
		}

		const responseBody: ParsedLines = { lines: allLines };

		console.log(
			'Sending import response to client:',
			JSON.stringify({ lineCount: allLines.length }, null, 2)
		);

		return NextResponse.json(responseBody);
	} catch (error: any) {
		console.error('Unexpected error in import-pdf-cues', error);
		return NextResponse.json(
			{ error: error?.message || 'Internal server error' },
			{ status: 500 }
		);
	}
}

