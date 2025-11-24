import { Mistral } from '@mistralai/mistralai';

if (!process.env.MISTRAL_API_KEY) {
	console.warn(
		'[mistral] MISTRAL_API_KEY is not set. Calls to Mistral will fail until this env var is configured.'
	);
}

export const mistral = new Mistral({
	apiKey: process.env.MISTRAL_API_KEY ?? ''
});


