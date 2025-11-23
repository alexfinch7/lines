import { NextResponse } from 'next/server';
import crypto from 'crypto';
import type { ReaderAudioJob } from '../readerAudioJobs';
import { readerAudioJobs } from '../readerAudioJobs';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

export const runtime = 'nodejs';

type StartRequestBody = {
	sceneTitle: string;
	sceneId: string;
	lines: [lineId: string, role: 'reader', text: string, preferredVoice: 'male_presenting' | 'female_presenting'][];
};

async function processJob(jobId: string, body: StartRequestBody) {
	try {
		const job = readerAudioJobs.get(jobId);
		if (!job) return;

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

		const client = new ElevenLabsClient({
			apiKey: elevenKey
		});

		const totalLines = body.lines.length;
		let uploadedCount = 0;

		// Process TTS in batches of 6 to limit concurrent requests against ElevenLabs.
		const concurrency = 6;
		for (let i = 0; i < body.lines.length; i += concurrency) {
			const batch = body.lines.slice(i, i + concurrency);

			await Promise.all(
				batch.map(async ([lineId, _role, text, preferredVoice]) => {
					const voiceId =
						preferredVoice === 'male_presenting' ? maleVoiceId : femaleVoiceId;

					let audioBuffer: Buffer;
					try {
						const audioResult = await client.textToSpeech.convert(voiceId, {
							text,
							modelId: 'eleven_flash_v2_5',
							voiceSettings: {
								stability: 0.5,
								similarityBoost: 0.75
							}
						});

						if (audioResult instanceof ReadableStream) {
							// SDK returned a web ReadableStream – consume it fully into a Buffer
							const arrayBuffer = await new Response(audioResult).arrayBuffer();
							audioBuffer = Buffer.from(arrayBuffer);
						} else if (Buffer.isBuffer(audioResult)) {
							audioBuffer = audioResult;
						} else {
							// Assume Uint8Array or ArrayBuffer-like
							audioBuffer = Buffer.from(audioResult as Uint8Array);
						}
					} catch (err) {
						console.error('ElevenLabs SDK TTS error for line', lineId, err);

						const currentJob = readerAudioJobs.get(jobId);
						if (currentJob) {
							currentJob.status = 'error';
							currentJob.error = 'Failed to generate reader audio from ElevenLabs.';
							readerAudioJobs.set(jobId, currentJob);
						}
						return;
					}

					// Phase 1: expose base64 audio immediately for client playback.
					const base64DataUrl = `data:audio/mpeg;base64,${audioBuffer.toString('base64')}`;
					const jobForTemp = readerAudioJobs.get(jobId);
					if (jobForTemp) {
						const existingIndex = jobForTemp.audio.findIndex(([id]) => id === lineId);
						if (existingIndex >= 0) {
							jobForTemp.audio[existingIndex] = [lineId, base64DataUrl];
						} else {
							jobForTemp.audio.push([lineId, base64DataUrl]);
						}
						readerAudioJobs.set(jobId, jobForTemp);
					}

					// Phase 2: upload in the background of this worker; playback is already possible.
					const path = `tts/${body.sceneId}/${lineId}.mp3`;
					const { error: uploadError } = await supabaseAdmin.storage
						.from('reader-recordings')
						.upload(path, audioBuffer, {
							contentType: 'audio/mpeg',
							upsert: true
						});

					const jobForUpload = readerAudioJobs.get(jobId);
					if (!jobForUpload) {
						return;
					}

					if (!uploadError) {
						const {
							data: { publicUrl }
						} = supabaseAdmin.storage.from('reader-recordings').getPublicUrl(path);

						const existingIndex = jobForUpload.audio.findIndex(([id]) => id === lineId);
						if (existingIndex >= 0) {
							jobForUpload.audio[existingIndex] = [lineId, publicUrl];
						} else {
							jobForUpload.audio.push([lineId, publicUrl]);
						}

						uploadedCount += 1;
						if (uploadedCount === totalLines && jobForUpload.status !== 'error') {
							jobForUpload.status = 'complete';
						}
						readerAudioJobs.set(jobId, jobForUpload);
					} else {
						console.error('Supabase storage upload error for line', lineId, uploadError);
						// Do not fail the whole job; client can still use temp audio.
						readerAudioJobs.set(jobId, jobForUpload);
					}
				})
			);
		}
	} catch (e) {
		console.error('Error processing reader audio job', e);
		const job = readerAudioJobs.get(jobId);
		if (job) {
			job.status = 'error';
			job.error = 'Failed to generate reader audio.';
			readerAudioJobs.set(jobId, job);
		}
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


