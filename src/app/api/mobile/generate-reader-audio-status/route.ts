import { NextResponse } from 'next/server';
import { readerAudioJobs } from '../readerAudioJobs';

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

		return NextResponse.json({
			status: job.status,
			audio: job.audio,
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


