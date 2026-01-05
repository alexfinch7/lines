// src/app/share/[id]/page.tsx
import Link from 'next/link';
import type { Metadata } from 'next';
import type { ShareSession } from '@/types/share';
import ShareClient from './ShareClient';

type Props = {
	params: Promise<{ id: string }>;
};

async function getSessionData(id: string) {
	const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
	const res = await fetch(`${baseUrl}/api/session?id=${id}&t=${Date.now()}`, {
		cache: 'no-store'
	});

	if (!res.ok) {
		return null;
	}

	const data = await res.json();
	return data.session as ShareSession;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { id } = await params;
	const session = await getSessionData(id);

	if (!session) {
		return {
			title: 'Counterpart',
			description: 'Be my reader! Record lines and rehearse in Counterpart.',
		};
	}

	const title = `${session.title} - Counterpart`;
	const description = 'Be my reader! Record lines and rehearse in Counterpart.';

	return {
		title,
		description,
		openGraph: {
			title,
			description,
			type: 'website',
			images: [{
				url: '/favicon.png', // Fallback image to ensure rich preview card appears
			}],
		},
		twitter: {
			card: 'summary',
			title,
			description,
			images: ['/favicon.png'],
		},
	};
}

export default async function SharePage({ params }: Props) {
	const { id } = await params;

	const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
	const res = await fetch(`${baseUrl}/api/session?id=${id}&t=${Date.now()}`, {
		// Always fetch fresh data so script edits are reflected immediately
		cache: 'no-store'
	});

	if (!res.ok) {
		let errorBody: any = {};
		try {
			errorBody = await res.json();
		} catch (e) {
			const text = await res.text().catch(() => '');
			errorBody = { error: 'Invalid JSON', raw: text.slice(0, 500) };
		}

		console.error(`SharePage load error: status=${res.status}`, {
			url: res.url,
			status: res.status,
			errorBody
		});

		// If scene is no longer sharable, show a specific message
		if (errorBody?.notSharable) {
			return (
				<main style={{ padding: 24 }}>
					<h1>Scene Not Available</h1>
					<p>This scene is no longer being shared. Please contact the scene owner.</p>
					<Link href="/">Back home</Link>
				</main>
			);
		}
		
		const isNotFound = res.status === 404;
		return (
			<main style={{ padding: 24 }}>
				<h1>{isNotFound ? 'Session not found' : 'Something went wrong'}</h1>
				<p>{errorBody?.error || 'Check the link or ask your friend to resend it.'}</p>
				{!isNotFound && <p style={{ fontSize: '0.8rem', color: '#666', marginTop: 8 }}>Error code: {res.status}</p>}
				<Link href="/" style={{ display: 'inline-block', marginTop: 16 }}>Back home</Link>
			</main>
		);
	}

	const { session, sceneVersion, lineUpdatedAt, sceneUpdatedAt, sceneSharable } = (await res.json()) as {
		session: ShareSession;
		sceneVersion?: string;
		lineUpdatedAt?: Record<string, string>;
		sceneUpdatedAt?: string;
		sceneSharable?: boolean;
	};

	return (
		<main style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
			<ShareClient
				initialSession={session}
				initialSceneVersion={sceneVersion}
				initialLineUpdatedAt={lineUpdatedAt}
				initialSceneUpdatedAt={sceneUpdatedAt}
				initialSceneSharable={sceneSharable}
			/>
		</main>
	);
}


