import { NextResponse } from 'next/server';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

export const runtime = 'nodejs';

type PreferredVoice = 'male_presenting' | 'female_presenting';

type TtsLineRequestBody = {
	lineId: string;
	text: string;
	preferredVoice: PreferredVoice;
};

type TtsLineResponseBody =
	| {
			lineId: string;
			audioDataUrl: string;
	  }
	| {
			error: string;
	  };

const MAX_TEXT_LENGTH = 500;

export async function POST(request: Request) {
	let body: Partial<TtsLineRequestBody>;

	try {
		body = (await request.json()) as Partial<TtsLineRequestBody>;
	} catch {
		return NextResponse.json<TtsLineResponseBody>(
			{ error: 'Invalid JSON body.' },
			{ status: 400 }
		);
	}

	const lineId = typeof body.lineId === 'string' ? body.lineId.trim() : '';
	const text = typeof body.text === 'string' ? body.text.trim() : '';
	const preferredVoice = body.preferredVoice;

	if (!lineId || !text || !preferredVoice) {
		return NextResponse.json<TtsLineResponseBody>(
			{ error: 'lineId, text, and preferredVoice are required.' },
			{ status: 400 }
		);
	}

	if (preferredVoice !== 'male_presenting' && preferredVoice !== 'female_presenting') {
		return NextResponse.json<TtsLineResponseBody>(
			{ error: 'preferredVoice must be "male_presenting" or "female_presenting".' },
			{ status: 400 }
		);
	}

	if (text.length > MAX_TEXT_LENGTH) {
		return NextResponse.json<TtsLineResponseBody>(
			{ error: `Text exceeds maximum length of ${MAX_TEXT_LENGTH} characters.` },
			{ status: 400 }
		);
	}

	const elevenKey = process.env.ELEVENLABS_API_KEY;
	if (!elevenKey) {
		console.error('Missing ELEVENLABS_API_KEY configuration');
		return NextResponse.json<TtsLineResponseBody>(
			{ error: 'TTS configuration error.' },
			{ status: 500 }
		);
	}

	const maleVoiceId =
		process.env.ELEVENLABS_MALE_VOICE_ID ?? process.env.ELEVENLABS_DEFAULT_VOICE_ID;
	const femaleVoiceId =
		process.env.ELEVENLABS_FEMALE_VOICE_ID ?? process.env.ELEVENLABS_DEFAULT_VOICE_ID;

	if (!maleVoiceId || !femaleVoiceId) {
		console.error(
			'Missing ELEVENLABS_MALE_VOICE_ID / ELEVENLABS_FEMALE_VOICE_ID (or ELEVENLABS_DEFAULT_VOICE_ID)'
		);
		return NextResponse.json<TtsLineResponseBody>(
			{ error: 'TTS configuration error.' },
			{ status: 500 }
		);
	}

	const voiceId = preferredVoice === 'male_presenting' ? maleVoiceId : femaleVoiceId;

	const client = new ElevenLabsClient({
		apiKey: elevenKey
	});

	let audioBuffer: Buffer;
	try {
		const audioResult = await client.textToSpeech.convert(voiceId, {
			text,
			modelId: 'eleven_flash_v2_5',
			outputFormat: 'mp3_22050_32',
			voiceSettings: {
				stability: 0.5,
				similarityBoost: 0.75
			}
		});

		if (audioResult instanceof ReadableStream) {
			const arrayBuffer = await new Response(audioResult).arrayBuffer();
			audioBuffer = Buffer.from(arrayBuffer);
		} else if (Buffer.isBuffer(audioResult)) {
			audioBuffer = audioResult;
		} else {
			audioBuffer = Buffer.from(audioResult as Uint8Array);
		}
	} catch (err: unknown) {
		console.error('ElevenLabs TTS error for line', lineId, err);

		// Best-effort mapping of upstream errors to HTTP status codes
		const status =
			(typeof err === 'object' && err !== null && 'status' in err && (err as any).status) ||
			(typeof err === 'object' &&
				err !== null &&
				'statusCode' in err &&
				(err as any).statusCode) ||
			(typeof err === 'object' &&
				err !== null &&
				'response' in err &&
				(err as any).response?.status);

		if (status === 429) {
			return NextResponse.json<TtsLineResponseBody>(
				{ error: 'Upstream rate limited. Please retry with backoff.' },
				{ status: 429 }
			);
		}

		if (status === 502 || status === 503) {
			return NextResponse.json<TtsLineResponseBody>(
				{ error: 'Upstream TTS service unavailable. Please retry.' },
				{ status: 503 }
			);
		}

		return NextResponse.json<TtsLineResponseBody>(
			{ error: 'Failed to generate TTS audio.' },
			{ status: 502 }
		);
	}

	const base64DataUrl = `data:audio/mpeg;base64,${audioBuffer.toString('base64')}`;

	return NextResponse.json<TtsLineResponseBody>({
		lineId,
		audioDataUrl: base64DataUrl
	});
}


