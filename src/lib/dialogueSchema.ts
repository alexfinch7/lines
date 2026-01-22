import { z } from 'zod';

export const DialogueLineSchema = z.object({
	type: z.literal('dialogue'),
	speaker: z.string().min(1).describe("The character name in ALL CAPS. Example: 'HAMLET'. Continued dialogue should repeat the character name."),
	text: z.string().min(1).describe("The spoken dialogue text only. Exclude parentheticals like '(beat)' or '(V.O.)', and exclude character names.")
});

export const SettingOrStageDirectionLineSchema = z.object({
	type: z.literal('setting_or_stage_direction'),
	text: z.string().min(1).describe('Stage direction OR setting text only, no character names.')
});

export const DialogueDocSchema = z.object({
	lines: z
		.array(z.union([DialogueLineSchema, SettingOrStageDirectionLineSchema]))
		.describe('List of all spoken dialogue lines on this page, strictly in order.')
});

export type DialogueLine = z.infer<typeof DialogueLineSchema>;
export type SettingOrStageDirectionLine = z.infer<typeof SettingOrStageDirectionLineSchema>;
export type DialogueDoc = z.infer<typeof DialogueDocSchema>;


