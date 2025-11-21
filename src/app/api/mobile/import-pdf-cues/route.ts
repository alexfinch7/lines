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

		if (!file || file.type !== 'application/pdf') {
			return NextResponse.json(
				{ error: 'A PDF file is required under the "file" field.' },
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

		if (!scriptText.trim()) {
			return NextResponse.json({ error: 'Parsed PDF was empty.' }, { status: 400 });
		}

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

		const input = `${title}\n\n${scriptText}\n\n${command}`;

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
		// Python client exposes result.output_text; when calling HTTP directly, the text is in output[0].content[0].text.
		const rawText: string =
			(typeof openaiJson.output_text === 'string'
				? openaiJson.output_text
				: openaiJson.output?.[0]?.content?.[0]?.text) ?? '';

		let parsedLines: ParsedLines;
		try {
			parsedLines = JSON.parse(rawText) as ParsedLines;
		} catch (e) {
			console.error('Failed to parse JSON from OpenAI output:', rawText);
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


