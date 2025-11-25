// src/app/share/[id]/page.tsx
import Link from 'next/link';
import type { ShareSession } from '@/types/share';
import ShareClient from './ShareClient';

type Props = {
	params: Promise<{ id: string }>;
};

export default async function SharePage({ params }: Props) {
	const { id } = await params;

	const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
	const res = await fetch(`${baseUrl}/api/session?id=${id}`, {
		// Always fetch fresh data so script edits are reflected immediately
		cache: 'no-store'
	});

	if (!res.ok) {
		return (
			<main style={{ padding: 24 }}>
				<h1>Session not found</h1>
				<p>Check the link or ask your friend to resend it.</p>
				<Link href="/">Back home</Link>
			</main>
		);
	}

	const { session, sceneVersion, lineUpdatedAt } = (await res.json()) as {
		session: ShareSession;
		sceneVersion?: string;
		lineUpdatedAt?: Record<string, string>;
	};

	return (
		<main style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
			<ShareClient
				initialSession={session}
				initialSceneVersion={sceneVersion}
				initialLineUpdatedAt={lineUpdatedAt}
			/>
		</main>
	);
}


