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

	let annotationObject: unknown = rawAnnotation;
	if (typeof rawAnnotation === 'string') {
		try {
			annotationObject = JSON.parse(rawAnnotation);
		} catch (err) {
			throw new Error('Failed to parse document annotation JSON from Mistral OCR response.');
		}
	}

	const parsed = DialogueDocSchema.parse(annotationObject);

	return parsed;
}


