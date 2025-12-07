import { mistral } from './mistral';
import { DialogueDocSchema } from './dialogueSchema';

type ExtractDialogueOptions = {
	imageUrl: string;
	characterName: string;
};

export async function extractDialogueFromImage(options: ExtractDialogueOptions) {
	const { imageUrl, characterName } = options;

	const documentAnnotationFormat = {
		type: 'json_schema' as const,
		jsonSchema: {
			name: 'DialogueDoc',
			description:
				`Extract ONLY spoken dialogue from this script page.\n` +
				`- A spoken line is text said aloud by a character.\n` +
				`- Ignore scene headings, role labels, descriptions, and instructions.\n` +
				`- Character names appear in ALL CAPS and label who is speaking.\n` +
				`- For each turn of dialogue, output one object: { "speaker": CHARACTER_NAME, "text": spoken words }.\n` +
				`- "speaker" must be the character name in ALL CAPS; "text" must be only what is spoken (no names, no headings).\n` +
				`- "Continued" lines should have the same speaker as the previous line.`,
			schemaDefinition: {
				type: 'object',
				properties: {
					lines: {
						type: 'array',
						items: {
							type: 'object',
							properties: {
								speaker: { type: 'string' },
								text: { type: 'string' }
							},
							required: ['speaker', 'text']
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
			type: 'image_url' as const,
			imageUrl: imageUrl
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
			console.error('Failed to parse document annotation JSON from Mistral OCR response.');
			return { lines: [] };
		}
	}

	const parsed = DialogueDocSchema.parse(annotationObject);

	return parsed;
}


