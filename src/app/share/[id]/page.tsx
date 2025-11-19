// src/app/share/[id]/page.tsx
import Link from 'next/link';
import type { ShareSession } from '@/types/share';
import ShareClient from './ShareClient';

type Props = {
	params: Promise<{ id: string }>;
};

export default async function SharePage({ params }: Props) {
	const { id } = await params;

	// Use absolute URL in production (when NEXT_PUBLIC_BASE_URL is set), and a
	// relative URL in development. Avoid hard-coding localhost so serverless
	// environments (e.g. Vercel) don't try to call 127.0.0.1:3000.
	const apiUrl = process.env.NEXT_PUBLIC_BASE_URL
		? `${process.env.NEXT_PUBLIC_BASE_URL}/api/session?id=${id}`
		: `/api/session?id=${id}`;

	const res = await fetch(apiUrl, {
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

	const { session, sceneVersion } = (await res.json()) as {
		session: ShareSession;
		sceneVersion?: string;
	};

	return (
		<main style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
			<ShareClient initialSession={session} initialSceneVersion={sceneVersion} />
		</main>
	);
}


