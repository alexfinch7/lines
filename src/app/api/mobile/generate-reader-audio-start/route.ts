import { NextResponse } from 'next/server';
import crypto from 'crypto';
import type { ReaderAudioJob } from '../readerAudioJobs';
import { readerAudioJobs } from '../readerAudioJobs';
import { supabaseAdmin } from '@/lib/supabaseServer';

export const runtime = 'nodejs';

type StartRequestBody = {
	sceneTitle: string;
	sceneId: string;
	lines: [lineId: string, role: 'reader', text: string, preferredVoice: 'male_presenting' | 'female_presenting'][];
};

async function processJob(jobId: string, body: StartRequestBody) {
	const job = readerAudioJobs.get(jobId);
	if (!job) return;

	try {
		const elevenKey = process.env.ELEVENLABS_API_KEY;
		if (!elevenKey) {
			throw new Error('Missing ELEVENLABS_API_KEY configuration');
		}

		const maleVoiceId =
			process.env.ELEVENLABS_MALE_VOICE_ID ?? process.env.ELEVENLABS_DEFAULT_VOICE_ID;
		const femaleVoiceId =
			process.env.ELEVENLABS_FEMALE_VOICE_ID ?? process.env.ELEVENLABS_DEFAULT_VOICE_ID;

		if (!maleVoiceId || !femaleVoiceId) {
			throw new Error(
				'Missing ELEVENLABS_MALE_VOICE_ID / ELEVENLABS_FEMALE_VOICE_ID (or ELEVENLABS_DEFAULT_VOICE_ID)'
			);
		}

		const audioResults: ReaderAudioJob['audio'] = [];

		for (const [lineId, _role, text, preferredVoice] of body.lines) {
			const voiceId =
				preferredVoice === 'male_presenting' ? maleVoiceId : femaleVoiceId;

			const ttsRes = await fetch(
				`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
				{
					method: 'POST',
					headers: {
						'xi-api-key': elevenKey,
						'Content-Type': 'application/json',
						Accept: 'audio/mpeg'
					},
					body: JSON.stringify({
						text,
						model_id: 'eleven_multilingual_v2',
						voice_settings: {
							stability: 0.5,
							similarity_boost: 0.75
						}
					})
				}
			);

			if (!ttsRes.ok) {
				const errText = await ttsRes.text().catch(() => 'Unknown TTS error');
				console.error('ElevenLabs TTS error for line', lineId, errText);
				throw new Error('Failed to generate reader audio from ElevenLabs.');
			}

			const audioBuffer = Buffer.from(await ttsRes.arrayBuffer());

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

			audioResults.push([lineId, publicUrl]);
		}

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


