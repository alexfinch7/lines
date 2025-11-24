import { mistral } from './mistral';
import { DialogueDocSchema } from './dialogueSchema';

type ExtractDialogueOptions = {
	pdfUrl: string;
	characterName: string;
};

export async function extractDialogueFromPdf(options: ExtractDialogueOptions) {
	const { pdfUrl, characterName } = options;

	const documentAnnotationFormat = {
		jsonSchema: {
			name: 'DialogueDoc',
			description: `Extract every spoken line of dialogue from these audition sides. The actor's character is "${characterName.toUpperCase()}". Any dialogue spoken by this character is "myself". All other speakers are "reader".`,
			schemaDefinition: {
				type: 'object',
				properties: {
					lines: {
						type: 'array',
						items: {
							type: 'object',
							properties: {
								role: {
									type: 'string',
									enum: ['myself', 'reader']
								},
								text: {
									type: 'string'
								}
							},
							required: ['role', 'text']
						}
					}
				},
				required: ['lines']
			}
		}
	};

	const ocrResponse = await mistral.ocr.process({
		model: 'mistral-ocr-latest',
		document: {
			documentUrl: pdfUrl
		},
		documentAnnotationFormat
	});

	const rawAnnotation =
		(ocrResponse as any).document_annotation ?? (ocrResponse as any).documentAnnotation;

	if (!rawAnnotation) {
		throw new Error('Mistral OCR did not return a document annotation.');
	}

	const parsed = DialogueDocSchema.parse(rawAnnotation);

	return parsed;
}


