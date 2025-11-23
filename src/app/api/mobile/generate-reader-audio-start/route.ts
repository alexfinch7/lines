import { NextResponse } from 'next/server';
import crypto from 'crypto';
import type { ReaderAudioJob } from '../readerAudioJobs';
import { readerAudioJobs } from '../readerAudioJobs';
import { supabaseAdmin } from '@/lib/supabaseServer';

export const runtime = 'nodejs';

const OPENAI_TTS_URL = 'https://api.openai.com/v1/audio/speech';
const OPENAI_TTS_MODEL = 'gpt-4o-mini-tts';
const TTS_INSTRUCTIONS =
	'Keep everything CONVERSATIONAL. Do not let the text imply any emotion. The pace is conversational, think a conversation between two quickthinking people, not too slow.';

type StartRequestBody = {
	sceneTitle: string;
	sceneId: string;
	lines: [lineId: string, role: 'reader', text: string, preferredVoice: 'male_presenting' | 'female_presenting'][];
};

async function processJob(jobId: string, body: StartRequestBody) {
	const job = readerAudioJobs.get(jobId);
	if (!job) return;

	try {
		const openaiKey = process.env.OPENAI_API_KEY;
		if (!openaiKey) {
			throw new Error('Missing OPENAI_API_KEY configuration for TTS');
		}

		// OpenAI TTS voices
		const maleVoiceId = 'onyx';
		const femaleVoiceId = 'alloy';

		const audioResults: ReaderAudioJob['audio'] = await Promise.all(
			body.lines.map(async ([lineId, _role, text, preferredVoice]) => {
				const voiceId =
					preferredVoice === 'male_presenting' ? maleVoiceId : femaleVoiceId;

				let audioBuffer: Buffer;
				try {
					const ttsRes = await fetch(OPENAI_TTS_URL, {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							Authorization: `Bearer ${openaiKey}`
						},
						body: JSON.stringify({
							model: OPENAI_TTS_MODEL,
							input: text,
							voice: voiceId,
							instructions: TTS_INSTRUCTIONS,
							response_format: 'mp3',
							speed: 1.15
						})
					});

					if (!ttsRes.ok) {
						const errText = await ttsRes.text().catch(() => 'Unknown OpenAI TTS error');
						console.error('OpenAI TTS HTTP error for line', lineId, errText);
						throw new Error('Failed to generate reader audio from OpenAI TTS.');
					}

					const arrayBuffer = await ttsRes.arrayBuffer();
					audioBuffer = Buffer.from(arrayBuffer);
				} catch (err) {
					console.error('OpenAI TTS error for line', lineId, err);
					throw new Error('Failed to generate reader audio from OpenAI TTS.');
				}

				const path = `tts/${body.sceneId}/${lineId}.mp3`;
				const { error: uploadError } = await supabaseAdmin.storage
					.from('reader-recordings')
					.upload(path, audioBuffer, {
						contentType: 'audio/mpeg',
						upsert: true
					});

				if (uploadError) {
					console.error('Supabase storage upload error for line', lineId, uploadError);
					throw new Error('Failed to store generated reader audio.');
				}

				const {
					data: { publicUrl }
				} = supabaseAdmin.storage.from('reader-recordings').getPublicUrl(path);

				return [lineId, publicUrl];
			})
		);

		job.status = 'complete';
		job.audio = audioResults;
		job.error = null;
		readerAudioJobs.set(jobId, job);
	} catch (e) {
		console.error('Error processing reader audio job', e);
		job.status = 'error';
		job.audio = [];
		job.error = 'Failed to generate reader audio.';
		readerAudioJobs.set(jobId, job);
	}
}

export async function POST(request: Request) {
	try {
		const body = (await request.json()) as Partial<StartRequestBody>;

		if (!body || typeof body.sceneTitle !== 'string' || typeof body.sceneId !== 'string') {
			return NextResponse.json(
				{ error: 'sceneTitle and sceneId are required.' },
				{ status: 400 }
			);
		}

		if (!Array.isArray(body.lines) || body.lines.length === 0) {
			return NextResponse.json({ error: 'lines array is required.' }, { status: 400 });
		}

		const readerLines = body.lines.filter(
			(line): line is StartRequestBody['lines'][number] =>
				Array.isArray(line) &&
				line.length === 4 &&
				line[1] === 'reader' &&
				typeof line[0] === 'string' &&
				typeof line[2] === 'string' &&
				(line[3] === 'male_presenting' || line[3] === 'female_presenting')
		);

		if (readerLines.length === 0) {
			return NextResponse.json(
				{ error: 'No valid reader lines were provided.' },
				{ status: 400 }
			);
		}

		const jobId = `job_${crypto.randomUUID()}`;

		const initialJob: ReaderAudioJob = {
			status: 'pending',
			audio: [],
			error: null
		};
		readerAudioJobs.set(jobId, initialJob);

		// Fire-and-forget processing. For now this is synchronous stub logic,
		// but it can be replaced with real TTS calls.
		void processJob(jobId, {
			sceneTitle: body.sceneTitle,
			sceneId: body.sceneId,
			lines: readerLines
		});

		return NextResponse.json({ jobId });
	} catch (e) {
		console.error('Unexpected error in generate-reader-audio-start', e);
		return NextResponse.json(
			{ error: 'Unexpected server error in generate-reader-audio-start.' },
			{ status: 500 }
		);
	}
}


