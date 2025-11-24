import { mistral } from './mistral';
import { DialogueDocSchema } from './dialogueSchema';

type ExtractDialogueOptions = {
	pdfUrl: string;
	characterName: string;
};

export async function extractDialogueFromPdf(options: ExtractDialogueOptions) {
	const { pdfUrl, characterName } = options;

	const documentAnnotationFormat = {
		type: 'json_schema' as 'json_schema',
		jsonSchema: {
			name: 'DialogueDoc',
			description:
				`Extract only spoken lines of dialogue from these audition sides.\n` +
				`The actor's character is "${characterName.toUpperCase()}". Use these rules:\n` +
				`1) Include ONLY words that are actually spoken aloud in the scene.\n` +
				`   - Do NOT include scene headings (INT./EXT.), role labels, or section titles.\n` +
				`   - Do NOT include action lines, stage directions, or description.\n` +
				`   - Do NOT include instructions to actors (e.g. self‑tape guidelines).\n` +
				`2) For every line spoken by "${characterName.toUpperCase()}" (including variants like NAME or NAME (CONT'D)), set role = "myself".\n` +
				`3) For every line spoken by any other character or narrator, set role = "reader".\n` +
				`4) Skip standalone character name labels if they are not spoken; only include the spoken text that follows.\n` +
				`5) Each entry in lines should correspond to one turn of dialogue (one character speaking).\n` +
				`6) Include EVERY line of dialogue from the script. Do not skip any lines.`,
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


