import { z } from 'zod';

export const SpeakerLineSchema = z.object({
	speaker: z.string().min(1).describe("The character name in ALL CAPS. Example: 'HAMLET'. Continued dialogue should repeat the character name."),
	text: z.string().min(1).describe("The spoken dialogue text only. Exclude parentheticals like '(beat)' or '(V.O.)', and exclude character names.")
});

export const DialogueDocSchema = z.object({
	lines: z.array(SpeakerLineSchema).describe("List of all spoken dialogue lines on this page, strictly in order.")
});

export type SpeakerLine = z.infer<typeof SpeakerLineSchema>;
export type DialogueDoc = z.infer<typeof DialogueDocSchema>;


