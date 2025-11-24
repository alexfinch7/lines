import { z } from 'zod';

export const SpeakerLineSchema = z.object({
	speaker: z.string().min(1), // e.g. "MAX", "ZOE", "MICHELLE"
	text: z.string().min(1) // spoken line only
});

export const DialogueDocSchema = z.object({
	lines: z.array(SpeakerLineSchema)
});

export type SpeakerLine = z.infer<typeof SpeakerLineSchema>;
export type DialogueDoc = z.infer<typeof DialogueDocSchema>;


