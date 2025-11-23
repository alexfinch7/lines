import { NextResponse } from 'next/server';
import { readerAudioJobs, type JobLineAudio } from '../readerAudioJobs';

export const runtime = 'nodejs';

export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url);
		const jobId = searchParams.get('jobId');

		if (!jobId) {
			return NextResponse.json(
				{ status: 'error', audio: [], error: 'Missing jobId parameter.' },
				{ status: 400 }
			);
		}

		const job = readerAudioJobs.get(jobId);

		if (!job) {
			return NextResponse.json({
				status: 'error',
				audio: [],
				error: 'Job not found.'
			});
		}

		// Backwards-compatible audio payload:
		// - Historically, audio was [lineId, audioUrl][]
		// - Now we store richer per-line objects (JobLineAudio)
		//   but we still expose the legacy tuple shape to clients.
		const legacyAudio: [string, string][] = (job.audio as JobLineAudio[])
			.map((entry) => {
				const url =
					entry.publicUrl ??
					(entry.tempAudioBase64
						? `data:audio/mpeg;base64,${entry.tempAudioBase64}`
						: null);
				return url ? [entry.lineId, url] : null;
			})
			.filter((pair): pair is [string, string] => pair !== null);

		return NextResponse.json({
			status: job.status,
			audio: legacyAudio,
			error: job.error
		});
	} catch (e) {
		console.error('Unexpected error in generate-reader-audio-status', e);
		return NextResponse.json(
			{ status: 'error', audio: [], error: 'Unexpected server error.' },
			{ status: 500 }
		);
	}
}


