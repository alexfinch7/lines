import { NextResponse } from 'next/server';
import OpenAI from 'openai';

export const runtime = 'nodejs';
export const maxDuration = 60; // Grok can take ~20–40s on big PDFs

type Cue = ['myself' | 'reader', string];
type ParsedLines = { lines: Cue[] };

export async function POST(request: Request) {
	try {
		const apiKey = process.env.XAI_API_KEY;
		if (!apiKey) {
			return NextResponse.json(
				{ error: 'Missing XAI_API_KEY server configuration' },
				{ status: 500 }
			);
		}

		const formData = await request.formData();
		const file = formData.get('file') as File | null;
		const characterName = (formData.get('characterName') as string | null)?.trim();

		if (!file || !(file instanceof File)) {
			return NextResponse.json({ error: 'PDF file is required' }, { status: 400 });
		}

		// Optional soft check: if a type is provided and it's clearly not a PDF, reject.
		if (file.type && !file.type.toLowerCase().includes('pdf')) {
			return NextResponse.json(
				{ error: `Unexpected file type: ${file.type}` },
				{ status: 400 }
			);
		}

		if (!characterName) {
			return NextResponse.json({ error: 'characterName is required' }, { status: 400 });
		}

		const client = new OpenAI({
			apiKey,
			baseURL: 'https://api.x.ai/v1'
		});

		const prompt = `
You are an expert casting assistant. Extract every spoken line of dialogue from the attached audition sides PDF.

Rules:
- Character names are in ALL CAPS before their lines (e.g. MAX, ZOE, MICHELLE)
- The actor's character is "${characterName.toUpperCase()}". Any line under ${characterName.toUpperCase()}, ${
			characterName.toUpperCase()
		} (CONT’D), etc. belongs to them.
- Mark their lines as "myself"
- All other spoken lines are "reader"
- Ignore stage directions, scene headings, page numbers, watermarks, everything except spoken dialogue
- Return ONLY valid JSON in this exact shape:

{
  "lines": [
    ["myself" | "reader", "Exact line of dialogue here"],
    ...
  ]
}
`;

		// Convert the uploaded PDF file to a data URL that Grok accepts as image_url.
		const pdfDataUrl = await fileToDataURL(file);

		const response = await client.chat.completions.create({
			model: 'grok-2-1212', // or 'grok-beta' — both support PDF vision
			temperature: 0,
			max_tokens: 4096,
			messages: [
				{
					role: 'user',
					content: [
						{ type: 'text', text: prompt },
						{
							type: 'image_url',
							image_url: {
								url: pdfDataUrl
							}
						}
					]
				}
			]
		});

		const messageContent = (response as any)?.choices?.[0]?.message?.content;
		const raw =
			typeof messageContent === 'string' ? (messageContent as string).trim() : '';

		if (!raw) {
			return NextResponse.json({ error: 'Empty response from Grok' }, { status: 502 });
		}

		let parsed: ParsedLines;
		try {
			parsed = JSON.parse(raw) as ParsedLines;
		} catch (e) {
			console.error('Grok returned invalid JSON:', raw);
			return NextResponse.json({ error: 'Invalid JSON from model' }, { status: 502 });
		}

		if (
			!parsed ||
			!Array.isArray(parsed.lines) ||
			!parsed.lines.every(
				(entry) =>
					Array.isArray(entry) &&
					entry.length === 2 &&
					(entry[0] === 'myself' || entry[0] === 'reader') &&
					typeof entry[1] === 'string'
			)
		) {
			return NextResponse.json({ error: 'Wrong shape from model' }, { status: 502 });
		}

		return NextResponse.json({ lines: parsed.lines });
	} catch (error: any) {
		console.error('Unexpected error in import-pdf-cues', error);
		return NextResponse.json(
			{ error: error?.message || 'Internal server error' },
			{ status: 500 }
		);
	}
}

// Helper: convert File → data URL that Grok accepts
async function fileToDataURL(file: File): Promise<string> {
	const arrayBuffer = await file.arrayBuffer();
	const base64 = Buffer.from(arrayBuffer).toString('base64');
	const mimeType = file.type || 'application/pdf';
	return `data:${mimeType};base64,${base64}`;
}

