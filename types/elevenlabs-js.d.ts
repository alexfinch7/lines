declare module '@elevenlabs/elevenlabs-js' {
	export class ElevenLabsClient {
		constructor(config: { apiKey: string });

		textToSpeech: {
			convert(
				voiceId: string,
				options: {
					text: string;
					modelId?: string;
					voiceSettings?: {
						stability?: number;
						similarityBoost?: number;
					};
				}
			): Promise<Uint8Array | Buffer | ReadableStream>;
		};
	}
}


