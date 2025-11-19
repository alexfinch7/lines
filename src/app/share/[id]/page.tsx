// src/app/share/[id]/page.tsx
import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import type { ShareSession } from '@/types/share';
import ShareClient from './ShareClient';

type Props = {
	params: Promise<{ id: string }>;
};

export default async function SharePage({ params }: Props) {
	const supabase = createSupabaseServerClient();
	const { id } = await params;

	const { data, error } = await supabase
		.from('share_sessions')
		.select('*')
		.eq('id', id)
		.single();

	if (error || !data) {
		return (
			<main style={{ padding: 24 }}>
				<h1>Session not found</h1>
				<p>Check the link or ask your friend to resend it.</p>
				<Link href="/">Back home</Link>
			</main>
		);
	}

	const session = data as ShareSession;
	return (
		<main style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
			<ShareClient initialSession={session} />
		</main>
	);
}


