import { z } from 'zod';

export const CueRoleSchema = z.enum(['myself', 'reader']);

export const CueSchema = z.object({
	role: CueRoleSchema, // "myself" or "reader"
	text: z.string().min(1) // the spoken line
});

export const DialogueDocSchema = z.object({
	lines: z.array(CueSchema)
});

export type CueRole = z.infer<typeof CueRoleSchema>;
export type Cue = z.infer<typeof CueSchema>;
export type DialogueDoc = z.infer<typeof DialogueDocSchema>;


