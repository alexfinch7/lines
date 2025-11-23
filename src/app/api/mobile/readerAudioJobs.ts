export type ReaderAudioJobStatus = 'pending' | 'processing' | 'ready' | 'complete' | 'error';

export type JobLineAudio = {
	lineId: string;
	/**
	 * Ephemeral base64-encoded audio used for immediate playback.
	 * This is available as soon as TTS completes for a line.
	 */
	tempAudioBase64?: string;
	/**
	 * Permanent public URL once the audio has been uploaded to storage.
	 */
	publicUrl?: string;
};

export type ReaderAudioJob = {
	status: ReaderAudioJobStatus;
	audio: JobLineAudio[];
	error: string | null;
};

// In-memory job store. This will persist for the lifetime of the serverless
// instance / Node process and is sufficient for the current polling contract.
export const readerAudioJobs = new Map<string, ReaderAudioJob>();


