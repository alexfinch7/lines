import { NextResponse } from 'next/server';
import pdfParse from 'pdf-parse';

export const runtime = 'nodejs';

const OPENAI_API_URL = 'https://api.openai.com/v1/responses';

type ParsedLines = {
	lines: [role: 'myself' | 'reader', text: string][];
};

export async function POST(request: Request) {
	try {
		const apiKey = process.env.OPENAI_API_KEY;
		if (!apiKey) {
			return NextResponse.json(
				{ error: 'Missing OPENAI_API_KEY server configuration' },
				{ status: 500 }
			);
		}

		const formData = await request.formData();
		const file = formData.get('file') as File | null;
		const title = (formData.get('title') as string | null) ?? 'Untitled Script';
		const characterName = (formData.get('characterName') as string | null) ?? '';

		if (!file) {
			return NextResponse.json(
				{ error: 'A PDF file is required under the "file" field.' },
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

		if (!characterName.trim()) {
			return NextResponse.json(
				{ error: 'characterName is required.' },
				{ status: 400 }
			);
		}

		// 1) Parse PDF to text
		const arrayBuffer = await file.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);
		const parsed = await pdfParse(buffer);
		const scriptText = parsed.text ?? '';

		// 2) Build command for OpenAI Responses API
		const command = `
You are a script cue extraction assistant.

You are given the full text of a script for a scene. The user's character name is "${characterName}".

Your job:
- Split the script into spoken lines of dialogue.
- For every line that belongs to the character "${characterName}" (case-insensitive, including any variant like full name or character label), mark the speaker as "myself".
- For every other spoken line, mark the speaker as "reader".

Output format:
- You MUST return a single JSON object ONLY.
- The JSON must have exactly one top-level key: "lines".
- "lines" must be an array of 2-item arrays.
- Each inner array must be: [speaker, text].
- "speaker" MUST be exactly either "myself" or "reader" (lowercase), nothing else.
- "text" is the full text of that line of dialogue.
- Do not include any explanations, comments, stage directions, or extra keys.
- Do not wrap the JSON in backticks.

Example:
{
  "lines": [
    ["myself", "O Romeo, Romeo, wherefore art thou Romeo?"],
    ["reader", "With love's light wings did I o'erperch these walls;"]
  ]
}

Now read the script text above and return ONLY the JSON object in the specified format.
`;

		let input: string | any[]; // string for text-only, array for multimodal (PDF file)

		if (scriptText.trim()) {
			// Normal path: we have extracted text locally
			input = `${title}\n\n${scriptText}\n\n${command}`;
		} else {
			// Fallback path: let OpenAI read the raw PDF directly via file upload
			const uploadForm = new FormData();
			uploadForm.append('file', file);
			uploadForm.append('purpose', 'vision');

			const uploadRes = await fetch('https://api.openai.com/v1/files', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${apiKey}`
				},
				body: uploadForm
			});

			if (!uploadRes.ok) {
				const uploadErr = await uploadRes.text().catch(() => 'Unknown error');
				console.error('OpenAI file upload error', uploadErr);
				return NextResponse.json(
					{ error: 'Failed to upload PDF to OpenAI for cue extraction.' },
					{ status: 502 }
				);
			}

			const uploadJson: any = await uploadRes.json();
			const fileId = uploadJson.id;

			if (!fileId || typeof fileId !== 'string') {
				console.error('Unexpected OpenAI file upload response:', JSON.stringify(uploadJson, null, 2));
				return NextResponse.json(
					{ error: 'OpenAI file upload did not return a valid file id.' },
					{ status: 502 }
				);
			}

			const pdfPrompt = `${title}\n\nYou are given a PDF containing the script for a scene. Read all of the text from the PDF as the script, then follow the instructions below exactly.\n\n${command}`;

			// Multimodal input for Responses API: user message with text + the uploaded PDF file.
			input = [
				{
					role: 'user',
					content: [
						{
							type: 'input_text',
							text: pdfPrompt
						},
						{
							type: 'input_file',
							file_id: fileId
						}
					]
				}
			];
		}

		// 3) Call OpenAI Responses API
		const openaiRes = await fetch(OPENAI_API_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${apiKey}`
			},
			body: JSON.stringify({
				model: 'gpt-5-mini',
				input,
				reasoning: { effort: 'low' },
				text: { verbosity: 'low' }
			})
		});

		if (!openaiRes.ok) {
			const errText = await openaiRes.text().catch(() => 'Unknown error');
			console.error('OpenAI Responses API error', errText);
			return NextResponse.json(
				{ error: 'Failed to process script with OpenAI.' },
				{ status: 502 }
			);
		}

		const openaiJson: any = await openaiRes.json();
		// Log full OpenAI payload so we can debug schema / errors server-side.
		console.log('OpenAI Responses raw JSON:', JSON.stringify(openaiJson, null, 2));

		// Python client exposes result.output_text; with raw HTTP, we find the "message" entry and read its text.
		let rawText: string | null = null;
		if (typeof openaiJson.output_text === 'string') {
			rawText = openaiJson.output_text;
		} else if (Array.isArray(openaiJson.output)) {
			const messageEntry = openaiJson.output.find((item: any) => item.type === 'message');
			const firstContent = messageEntry?.content?.[0];
			if (firstContent && typeof firstContent.text === 'string') {
				rawText = firstContent.text;
			}
		}

		if (!rawText || typeof rawText !== 'string') {
			console.error('Unable to locate output_text in OpenAI response:', JSON.stringify(openaiJson, null, 2));
			return NextResponse.json(
				{ error: 'OpenAI response did not contain output text.' },
				{ status: 502 }
			);
		}

		let parsedLines: ParsedLines;
		try {
			parsedLines = JSON.parse(rawText) as ParsedLines;
		} catch (e) {
			console.error('Failed to parse JSON from OpenAI output text:', rawText);
			console.error(
				'Full OpenAI JSON when parse failed:',
				JSON.stringify(openaiJson, null, 2)
			);
			return NextResponse.json(
				{ error: 'OpenAI response was not valid JSON.' },
				{ status: 502 }
			);
		}

		if (
			!parsedLines ||
			!Array.isArray(parsedLines.lines) ||
			!parsedLines.lines.every(
				(entry) =>
					Array.isArray(entry) &&
					entry.length === 2 &&
					(entry[0] === 'myself' || entry[0] === 'reader') &&
					typeof entry[1] === 'string'
			)
		) {
			return NextResponse.json(
				{ error: 'OpenAI response did not match expected shape.' },
				{ status: 502 }
			);
		}

		// 4) Return validated JSON to client
		return NextResponse.json({ lines: parsedLines.lines });
	} catch (e) {
		console.error('Unexpected error in import-pdf-cues', e);
		return NextResponse.json({ error: 'Unexpected server error.' }, { status: 500 });
	}
}


