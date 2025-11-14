'use client';

// src/components/MarkDoneButton.tsx
import { useState } from 'react';

type Props = {
	id: string;
};

export default function MarkDoneButton({ id }: Props) {
	const [loading, setLoading] = useState(false);
	const onClick = async () => {
		setLoading(true);
		try {
			await fetch('/api/session/done', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id })
			});
			// naive refresh
			window.location.reload();
		} finally {
			setLoading(false);
		}
	};

	return (
		<button
			style={{
				marginTop: 16,
				padding: '10px 16px',
				borderRadius: 8,
				border: 'none',
				cursor: 'pointer'
			}}
			disabled={loading}
			onClick={onClick}
		>
			{loading ? 'Saving…' : 'Mark as Done'}
		</button>
	);
}


