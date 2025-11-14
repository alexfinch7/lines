// src/types/share.ts
export type ActorLine = {
	lineId: string;
	index: number;
	text: string;
	audioUrl: string;
};

export type ReaderLine = {
	lineId: string;
	index: number;
	text: string;
	audioUrl?: string;
};

export type ShareSession = {
	id: string;
	title: string;
	status: 'pending' | 'completed';
	scene_id: string;
	actor_lines: ActorLine[];
	reader_lines: ReaderLine[];
	created_at: string;
};


