import { mistral } from './mistral';
import { DialogueDocSchema } from './dialogueSchema';

type ExtractDialogueOptions = {
	pdfUrl: string;
	characterName: string;
};

export async function extractDialogueFromPdf(options: ExtractDialogueOptions) {
	const { pdfUrl, characterName } = options;

	const documentAnnotationFormat = {
		name: 'DialogueDoc',
		schema: {
			type: 'object',
			properties: {
				lines: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							role: {
								type: 'string',
								enum: ['myself', 'reader'],
								description:
									'"myself" if the line belongs to the actor’s character, "reader" otherwise.'
							},
							text: {
								type: 'string',
								description: 'Exact spoken line of dialogue.'
							}
						},
						required: ['role', 'text']
					}
				}
			},
			required: ['lines']
		},
		description: `Extract every spoken line of dialogue from these audition sides. The actor's character is "${characterName.toUpperCase()}". Any dialogue spoken by this character is "myself". All other speakers are "reader".`
	};

	const ocrResponse = await mistral.ocr.process({
		model: 'mistral-ocr-latest',
		document: {
			// The TS SDK expects camelCase `documentUrl` and no explicit type
			documentUrl: pdfUrl
		},
		documentAnnotationFormat
	} as any);

	const rawAnnotation =
		(ocrResponse as any).document_annotation ?? (ocrResponse as any).documentAnnotation;

	if (!rawAnnotation) {
		throw new Error('Mistral OCR did not return a document annotation.');
	}

	const parsed = DialogueDocSchema.parse(rawAnnotation);

	return parsed;
}


