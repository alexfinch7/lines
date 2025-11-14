'use client';

// src/app/share/[id]/ShareClient.tsx
import { useRef, useState } from 'react';
import type { ShareSession, ActorLine, ReaderLine } from '@/types/share';

type Props = {
	initialSession: ShareSession;
};

export default function ShareClient({ initialSession }: Props) {
	const [session, setSession] = useState<ShareSession>(initialSession);
	const [currentIndex, setCurrentIndex] = useState(0);
	const [isPlaying, setIsPlaying] = useState(false);
	const [isRecording, setIsRecording] = useState(false);

	const mediaRecorderRef = useRef<MediaRecorder | null>(null);
	const chunksRef = useRef<Blob[]>([]);

	const actorLines = [...(session.actor_lines || [])].sort((a, b) => a.index - b.index);
	const readerLines = [...(session.reader_lines || [])].sort((a, b) => a.index - b.index);
	const currentReader: ReaderLine | undefined = readerLines[currentIndex];

	const aggregatedActorText = actorLines
		.filter((a) => a.index <= (currentReader?.index ?? Number.MAX_SAFE_INTEGER))
		.map((a) => a.text)
		.join('\n\n');

	const playAudio = (url: string) =>
		new Promise<void>((resolve, reject) => {
			const audio = new Audio(url);
			audio.onended = () => resolve();
			audio.onerror = (e) => reject(e);
			audio.play().catch(reject);
		});

	const handlePlayActor = async () => {
		if (!currentReader) return;
		setIsPlaying(true);
		try {
			const relevantActorLines: ActorLine[] = actorLines.filter(
				(a) => a.index <= currentReader.index
			);
			for (const line of relevantActorLines) {
				if (!line.audioUrl) continue;
				await playAudio(line.audioUrl);
			}
		} finally {
			setIsPlaying(false);
		}
	};

	const startRecording = async () => {
		if (!currentReader || isRecording) return;
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			const recorder = new MediaRecorder(stream);
			mediaRecorderRef.current = recorder;
			chunksRef.current = [];

			recorder.ondataavailable = (event) => {
				if (event.data.size > 0) {
					chunksRef.current.push(event.data);
				}
			};

			recorder.onstop = async () => {
				const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
				await uploadRecording(blob, currentReader.lineId);
				stream.getTracks().forEach((t) => t.stop());
			};

			recorder.start();
			setIsRecording(true);
		} catch (e) {
			console.error('Failed to start recording', e);
			alert('Could not access microphone.');
		}
	};

	const stopRecording = () => {
		const recorder = mediaRecorderRef.current;
		if (recorder && isRecording) {
			recorder.stop();
			setIsRecording(false);
		}
	};

	const uploadRecording = async (blob: Blob, lineId: string) => {
		if (!session.id) return;
		const formData = new FormData();
		formData.append('file', blob, `${lineId}.webm`);
		formData.append('sessionId', session.id);
		formData.append('lineId', lineId);

		const uploadRes = await fetch('/api/upload', {
			method: 'POST',
			body: formData
		});
		if (!uploadRes.ok) {
			console.error(await uploadRes.text());
			alert('Upload failed');
			return;
		}
		const { url } = await uploadRes.json();

		const updateRes = await fetch('/api/session/line', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ sessionId: session.id, lineId, audioUrl: url })
		});
		if (!updateRes.ok) {
			console.error(await updateRes.text());
			alert('Failed to save line metadata');
			return;
		}

		setSession((prev) => {
			const updatedReaderLines = [...(prev.reader_lines || [])].map((l) =>
				l.lineId === lineId ? { ...l, audioUrl: url } : l
			);
			return { ...prev, reader_lines: updatedReaderLines };
		});
	};

	const gotoNext = () => {
		if (currentIndex < readerLines.length - 1) {
			setCurrentIndex((i) => i + 1);
		}
	};
	const gotoPrev = () => {
		if (currentIndex > 0) {
			setCurrentIndex((i) => i - 1);
		}
	};

	const markDone = async () => {
		const res = await fetch('/api/session/done', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id: session.id })
		});
		if (!res.ok) {
			console.error(await res.text());
			alert('Failed to mark as done');
			return;
		}
		setSession((prev) => ({ ...prev, status: 'completed' }));
	};

	return (
		<div>
			<h1>{session.title}</h1>
			<p>
				Status: <strong>{session.status === 'completed' ? 'Completed' : 'Pending'}</strong>
			</p>

			<p style={{ marginTop: 16 }}>
				When you’re ready, play the actor’s lines, then record your response.
			</p>

			{currentReader ? (
				<>
					<div style={{ display: 'flex', gap: 16, marginTop: 24, alignItems: 'flex-start' }}>
						<section style={{ flex: 1 }}>
							<h2>Actor (original) lines</h2>
							<pre
								style={{
									whiteSpace: 'pre-wrap',
									background: '#f5f5f5',
									padding: 12,
									borderRadius: 8
								}}
							>
								{aggregatedActorText || '(No actor lines yet)'}
							</pre>
							<button
								disabled={isPlaying}
								onClick={handlePlayActor}
								style={{
									marginTop: 8,
									padding: '8px 12px',
									borderRadius: 6,
									border: '1px solid #ddd',
									cursor: 'pointer'
								}}
							>
								{isPlaying ? 'Playing…' : 'Play actor audio'}
							</button>
						</section>

						<section style={{ flex: 1 }}>
							<h2>Your reader line</h2>
							<pre
								style={{
									whiteSpace: 'pre-wrap',
									background: '#f5f5f5',
									padding: 12,
									borderRadius: 8
								}}
							>
								{currentReader.text}
							</pre>

							<div style={{ marginTop: 8 }}>
								<button
									onClick={isRecording ? stopRecording : startRecording}
									style={{
										padding: '8px 12px',
										borderRadius: 20,
										border: 'none',
										cursor: 'pointer',
										background: isRecording ? '#ffdddd' : '#e0f5ff'
									}}
								>
									{isRecording ? 'Stop recording' : 'Record'}
								</button>
							</div>

							{currentReader.audioUrl && (
								<div style={{ marginTop: 8 }}>
									<p>Preview your take:</p>
									<audio controls src={currentReader.audioUrl} />
								</div>
							)}
						</section>
					</div>

					<div
						style={{
							marginTop: 24,
							display: 'flex',
							justifyContent: 'space-between',
							alignItems: 'center'
						}}
					>
						<div>
							<button
								onClick={gotoPrev}
								disabled={currentIndex === 0}
								style={{
									marginRight: 8,
									padding: '6px 10px',
									borderRadius: 6,
									border: '1px solid #ddd',
									cursor: 'pointer'
								}}
							>
								Prev
							</button>
							<button
								onClick={gotoNext}
								disabled={currentIndex === readerLines.length - 1}
								style={{
									padding: '6px 10px',
									borderRadius: 6,
									border: '1px solid #ddd',
									cursor: 'pointer'
								}}
							>
								Next
							</button>
						</div>

						<div>
							<span>
								Line {currentIndex + 1} of {readerLines.length}
							</span>
						</div>

						<button
							onClick={markDone}
							style={{
								padding: '8px 12px',
								borderRadius: 6,
								border: 'none',
								cursor: 'pointer',
								background: session.status === 'completed' ? '#d4f7d4' : '#e0ffe0'
							}}
						>
							{session.status === 'completed' ? 'Marked as Done ✅' : 'Mark Scene as Done'}
						</button>
					</div>
				</>
			) : (
				<p style={{ marginTop: 24 }}>There are no reader lines in this session yet.</p>
			)}
		</div>
	);
}


