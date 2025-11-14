'use client';

import { useState } from 'react';

export default function Home() {
	const [shareUrl, setShareUrl] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	const createDummy = async () => {
		setLoading(true);
		try {
			const res = await fetch('/api/session', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: 'Dummy Scene from Web',
					sceneId: 'local-demo-scene-1',
					actorLines: [
						{
							lineId: 'line-1',
							index: 0,
							text: 'You never listen to me.',
							audioUrl: 'https://example.com/audio/line-1.m4a'
						}
					],
					readerLines: [
						{
							lineId: 'line-2',
							index: 1,
							text: 'I always listened. You just never talked.'
						}
					]
				})
			});
			const data = await res.json();
			setShareUrl(data.shareUrl);
		} finally {
			setLoading(false);
		}
	};

	return (
		<main style={{ padding: 24 }}>
			<h1>Lines Share Demo</h1>
			<button
				disabled={loading}
				onClick={createDummy}
				style={{
					padding: '10px 16px',
					borderRadius: 8,
					border: 'none',
					cursor: 'pointer',
					marginTop: 16
				}}
			>
				{loading ? 'Creating…' : 'Create Dummy Share Link'}
			</button>

			{shareUrl && (
				<div style={{ marginTop: 24 }}>
					<p>Share this URL:</p>
					<code
						style={{
							display: 'block',
							padding: 8,
							borderRadius: 6,
							background: '#f5f5f5',
							wordBreak: 'break-all'
						}}
					>
						{shareUrl}
					</code>
				</div>
			)}
		</main>
	);
}
