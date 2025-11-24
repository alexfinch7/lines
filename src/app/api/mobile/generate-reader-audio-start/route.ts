import { NextResponse } from 'next/server';
import crypto from 'crypto';
import type { ReaderAudioJob } from '../readerAudioJobs';
import { readerAudioJobs } from '../readerAudioJobs';
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

		console.log('[reader-audio] Starting ElevenLabs job', {
			jobId,
			sceneId: body.sceneId,
			sceneTitle: body.sceneTitle,
			totalLines: body.lines.length,
			hasApiKey: Boolean(elevenKey),
			hasMaleVoiceId: Boolean(maleVoiceId),
			hasFemaleVoiceId: Boolean(femaleVoiceId)
		});

		const client = new ElevenLabsClient({
			apiKey: elevenKey
		});

		const totalLines = body.lines.length;
		let generatedCount = 0;

		// Process each line sequentially; clients can send requests concurrently,
		// but we avoid batching multiple lines into a single ElevenLabs call.
		for (const [lineId, _role, text, preferredVoice] of body.lines) {
			const voiceId =
				preferredVoice === 'male_presenting' ? maleVoiceId : femaleVoiceId;

			const startedAt = Date.now();
			console.log('[reader-audio] ElevenLabs TTS request', {
				jobId,
				lineId,
				voiceId,
				textLength: text.length
			});

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

				const elapsedMs = Date.now() - startedAt;
				console.log('[reader-audio] ElevenLabs TTS success', {
					jobId,
					lineId,
					elapsedMs,
					resultType: audioResult instanceof ReadableStream
						? 'ReadableStream'
						: Buffer.isBuffer(audioResult)
							? 'Buffer'
							: typeof audioResult
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
				const elapsedMs = Date.now() - startedAt;
				console.error('[reader-audio] ElevenLabs SDK TTS error', {
					jobId,
					lineId,
					voiceId,
					elapsedMs,
					error: err instanceof Error ? err.message : String(err)
				});

				const currentJob = readerAudioJobs.get(jobId);
				if (currentJob) {
					currentJob.status = 'error';
					currentJob.error = 'Failed to generate reader audio from ElevenLabs.';
					readerAudioJobs.set(jobId, currentJob);
				}
				continue;
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

				generatedCount += 1;
				if (generatedCount === totalLines && jobForTemp.status !== 'error') {
					jobForTemp.status = 'complete';
					console.log('[reader-audio] ElevenLabs job complete', {
						jobId,
						totalLines
					});
				}

				readerAudioJobs.set(jobId, jobForTemp);
			}
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


