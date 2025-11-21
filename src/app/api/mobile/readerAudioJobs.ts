export type ReaderAudioJobStatus = 'pending' | 'complete' | 'error';

export type ReaderAudioJob = {
	status: ReaderAudioJobStatus;
	audio: [lineId: string, audioUrl: string][];
	error: string | null;
};

// In-memory job store. This will persist for the lifetime of the serverless
// instance / Node process and is sufficient for the current polling contract.
export const readerAudioJobs = new Map<string, ReaderAudioJob>();


