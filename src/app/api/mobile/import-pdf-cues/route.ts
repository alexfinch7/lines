import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60; // Grok can take ~20–40s on big PDFs

type Cue = ['myself' | 'reader', string];
type ParsedLines = { lines: Cue[] };

export async function POST(request: Request) {
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

		const apiKey = process.env.XAI_API_KEY;
		if (!apiKey) {
			return NextResponse.json({ error: 'Missing XAI_API_KEY' }, { status: 500 });
		}

		// Step 1: Upload the PDF to xAI using multipart/form-data (OpenAI-compatible Files API)
		const fileArrayBuffer = await file.arrayBuffer();
		const blob = new Blob([fileArrayBuffer], {
			type: file.type || 'application/pdf'
		});

		const uploadForm = new FormData();
		// "file" is the field name xAI expects (OpenAI compatible)
		uploadForm.append('file', blob, (file as any).name ?? 'sides.pdf');

		const uploadResponse = await fetch('https://api.x.ai/v1/files', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`
				// Do not set Content-Type; fetch will add the multipart boundary.
			},
			body: uploadForm
		});

		if (!uploadResponse.ok) {
			const err = await uploadResponse.text().catch(() => 'Unknown error');
			console.error('File upload failed:', err);
			return NextResponse.json({ error: 'Failed to upload PDF' }, { status: 502 });
		}

		const uploadedJson: any = await uploadResponse.json();
		console.log(
			'xAI file upload response for import-pdf-cues:',
			JSON.stringify(uploadedJson, null, 2)
		);
		const file_id = uploadedJson?.file_id ?? uploadedJson?.id;

		if (!file_id || typeof file_id !== 'string') {
			console.error(
				'Unexpected xAI file upload response:',
				JSON.stringify(uploadedJson, null, 2)
			);
			return NextResponse.json(
				{ error: 'xAI file upload did not return a valid file id.' },
				{ status: 502 }
			);
		}

		// Step 2: Send the uploaded file + prompt
		const grokPayload = {
			// grok-2 models do not support server-side tools; use grok-4 family instead.
			model: 'grok-4-1-fast-non-reasoning',
			temperature: 0,
			messages: [
				{
					role: 'user',
					content: [
						{
							type: 'text',
							text: `You are an expert casting assistant. Extract every spoken line from this audition sides PDF.

Character: "${characterName.toUpperCase()}"

- Their lines → "myself"
- Everyone else → "reader"

Return ONLY this JSON (no backticks, no extra text):

{
  "lines": [
    ["myself" | "reader", "exact line here"]
  ]
}`
						},
						{
							type: 'file',
							file_id
						}
					]
				}
			]
		};

		console.log(
			'Calling Grok for import-pdf-cues with payload:',
			JSON.stringify(
				{
					...grokPayload,
					// Redact potentially large content text in logs to avoid noise
					messages: grokPayload.messages.map((m) => ({
						...m,
						content: m.content.map((c) =>
							c.type === 'text'
								? { ...c, text: '[omitted prompt text in logs]' }
								: c
						)
					}))
				},
				null,
				2
			)
		);

		const grokResponse = await fetch('https://api.x.ai/v1/chat/completions', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(grokPayload)
		});

		if (!grokResponse.ok) {
			const err = await grokResponse.text().catch(() => 'Unknown error');
			console.error('Grok API error:', err);
			return NextResponse.json({ error: 'Grok processing failed' }, { status: 502 });
		}

		const data: any = await grokResponse.json();
		console.log('Raw Grok JSON for import-pdf-cues:', JSON.stringify(data, null, 2));

		const content = data?.choices?.[0]?.message?.content;
		let raw = '';

		if (typeof content === 'string') {
			raw = content.trim();
		} else if (Array.isArray(content)) {
			// Some xAI responses may use an array of content parts
			const textPart = content.find(
				(part: any) => part && typeof part.text === 'string'
			);
			if (textPart) {
				raw = (textPart.text as string).trim();
			}
		}

		if (!raw) {
			console.error('Empty or non-string content from Grok:', JSON.stringify(data, null, 2));
			return NextResponse.json(
				{ error: 'Empty response from Grok' },
				{ status: 502 }
			);
		}

		let parsed: ParsedLines;
		try {
			parsed = JSON.parse(raw) as ParsedLines;
		} catch (e) {
			console.error('Invalid JSON from Grok:', raw);
			return NextResponse.json({ error: 'Invalid response format' }, { status: 502 });
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
			console.error(
				'Parsed lines from Grok had wrong shape:',
				JSON.stringify(parsed, null, 2)
			);
			return NextResponse.json({ error: 'Wrong shape from model' }, { status: 502 });
		}

		const responseBody = { lines: parsed.lines };
		console.log(
			'Sending import-pdf-cues response to client:',
			JSON.stringify(responseBody, null, 2)
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


