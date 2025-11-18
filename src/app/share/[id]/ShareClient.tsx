'use client';

// src/app/share/[id]/ShareClient.tsx
import { useMemo, useRef, useState } from 'react';
import { Mic, Square, Volume2, Check } from 'lucide-react';
import type { ShareSession, ActorLine, ReaderLine } from '@/types/share';

type Props = {
	initialSession: ShareSession;
};

export default function ShareClient({ initialSession }: Props) {
	const [session, setSession] = useState<ShareSession>(initialSession);
	const [activeRecordingLineId, setActiveRecordingLineId] = useState<string | null>(null);
	const [playingLineId, setPlayingLineId] = useState<string | null>(null);

	const mediaRecorderRef = useRef<MediaRecorder | null>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const chunksRef = useRef<Blob[]>([]);

	const actorLines = useMemo(() => session.actor_lines || [], [session.actor_lines]);
	const readerLines = useMemo(() => session.reader_lines || [], [session.reader_lines]);

	// Merge actor + reader lines into a single scene-ordered list (by index)
	type Item =
		| { kind: 'actor'; line: ActorLine }
		| { kind: 'reader'; line: ReaderLine };
	const items: Item[] = useMemo(() => {
		const a = (actorLines as ActorLine[]).map((line) => ({ kind: 'actor', line }) as Item);
		const r = (readerLines as ReaderLine[]).map((line) => ({ kind: 'reader', line }) as Item);
		return [...a, ...r].sort((x, y) => x.line.index - y.line.index);
	}, [actorLines, readerLines]);

	const playAudio = (url: string, lineId: string) =>
		new Promise<void>((resolve, reject) => {
			const audio = new Audio(url);
			audio.onended = () => {
				setPlayingLineId((id) => (id === lineId ? null : id));
				resolve();
			};
			audio.onerror = (e) => {
				setPlayingLineId((id) => (id === lineId ? null : id));
				reject(e);
			};
			setPlayingLineId(lineId);
			audio.play().catch((e) => {
				setPlayingLineId((id) => (id === lineId ? null : id));
				reject(e);
			});
		});

	const handlePlayActor = async (actor?: ActorLine) => {
		if (!actor || !actor.audioUrl) return;
		await playAudio(actor.audioUrl, actor.lineId);
	};

	const startRecording = async (reader: ReaderLine) => {
		// Prevent starting a new recording while one is in progress
		if (activeRecordingLineId) return;
		try {
			// Reuse a single audio stream for all recordings to avoid repeated permission / lag
			let stream = streamRef.current;
			if (!stream) {
				stream = await navigator.mediaDevices.getUserMedia({ audio: true });
				streamRef.current = stream;
			}
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
				await uploadRecording(blob, reader.lineId);
				// Keep the stream alive for subsequent recordings; only clear UI state here.
				setActiveRecordingLineId(null);
			};

			recorder.start();
			setActiveRecordingLineId(reader.lineId);
		} catch (e) {
			console.error('Failed to start recording', e);
			alert('Could not access microphone.');
		}
	};

	const stopRecording = () => {
		const recorder = mediaRecorderRef.current;
		if (recorder && recorder.state === 'recording') {
			// Clear UI state immediately so the button responds instantly
			setActiveRecordingLineId(null);
			recorder.stop();
		}
	};

	const uploadRecording = async (blob: Blob, lineId: string) => {
		if (!session.id) return;
		const formData = new FormData();
		formData.append('file', blob, `${lineId}.webm`);
		formData.append('sessionId', session.id);
		formData.append('lineId', lineId);
		formData.append('role', 'reader');

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

	const allRecorded = readerLines.length > 0 && readerLines.every((l) => !!l.audioUrl);

	const playReader = async (reader: ReaderLine) => {
		if (!reader.audioUrl) return;
		await playAudio(reader.audioUrl, reader.lineId);
	};

	return (
		<div style={{ paddingBottom: 24 }}>
			<h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, lineHeight: 1.2, color: '#3B2F2F' }}>
				{session.title}
			</h1>
			<p style={{ fontFamily: 'var(--font-sans)', marginTop: 4, color: '#3B2F2F' }}>
				Status: <strong>{session.status === 'completed' ? 'Completed' : 'Pending'}</strong>
			</p>

			<ul style={{ listStyle: 'none', padding: 0, marginTop: 16 }}>
				{items.map((item) => {
					const key = `${item.kind}-${item.line.lineId}`;
					const isReader = item.kind === 'reader';
					const isActor = item.kind === 'actor';
					const isRecording = isReader && activeRecordingLineId === item.line.lineId;
					const hasRecording = isReader && !!(item.line as ReaderLine).audioUrl;
					const isPlaying = isActor && playingLineId === item.line.lineId;
					return (
						<li
							key={key}
							style={{
								border: '1px solid #eee',
								borderRadius: 12,
								padding: 12,
								marginBottom: 12,
								background: '#fff'
							}}
						>
							<div
								style={{
									display: 'flex',
									justifyContent: 'space-between',
									alignItems: 'center',
									gap: 12
								}}
							>
								<div style={{ flex: 1 }}>
									<div
										style={{
											fontSize: 16,
											fontWeight: 800,
											color: 'var(--espresso)',
											// Reader: light highlight blue; Actor: no highlight
											background: isReader ? 'var(--readerHighlightBlue)' : 'transparent',
											display: 'inline-block',
											padding: '2px 8px',
											borderRadius: 999,
											fontFamily: 'var(--font-mono)'
										}}
									>
										{isReader ? 'READER' : 'ACTOR'}
									</div>
								</div>
								<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
									{isReader ? (
										<>
											<button
												onClick={
													isRecording
														? stopRecording
														: () => startRecording(item.line as ReaderLine)
												}
												style={{
													padding: '10px 12px',
													borderRadius: 999,
													border: '1px solid #ddd',
													// Mic button uses light highlight blue when idle; red-tint when recording
													background: isRecording ? '#ffd6d6' : 'var(--readerHighlightBlue)',
													color: '#3B2F2F',
													cursor: 'pointer',
													minWidth: 44,
													display: 'inline-flex',
													alignItems: 'center',
													justifyContent: 'center'
												}}
												aria-label={isRecording ? 'Stop recording' : 'Record line'}
											>
												{isRecording ? <Square size={18} /> : <Mic size={18} />}
											</button>
											{hasRecording && (
												<>
													<button
														onClick={() => playReader(item.line as ReaderLine)}
														style={{
															padding: '10px 12px',
															borderRadius: 999,
															border: '1px solid #ddd',
															background: 'var(--readerHighlightBlue)',
															color: '#3B2F2F',
															cursor: 'pointer',
															minWidth: 44,
															display: 'inline-flex',
															alignItems: 'center',
															justifyContent: 'center'
														}}
														aria-label="Play your recording"
													>
														<Volume2 size={18} />
													</button>
													<Check size={18} color="#2ecc71" aria-label="Recorded" />
												</>
											)}
										</>
									) : (
										<button
											onClick={() => handlePlayActor(item.line as ActorLine)}
											disabled={!(item.line as ActorLine).audioUrl}
											style={{
												padding: '10px 12px',
												borderRadius: 999,
												border: '1px solid #ddd',
												background: '#f5f5f5',
												color: '#3B2F2F',
												cursor: (item.line as ActorLine).audioUrl
													? 'pointer'
													: 'not-allowed',
												minWidth: 44,
												display: 'inline-flex',
												alignItems: 'center',
												justifyContent: 'center',
												opacity: (item.line as ActorLine).audioUrl ? 1 : 0.5
											}}
											aria-label="Play actor line"
										>
											<Volume2 size={18} />
										</button>
									)}
								</div>
							</div>
							{/* Line text (highlight reader only as selection/marker style) */}
							<div
								style={{
									marginTop: 8,
									textAlign: 'left',
									color: '#3B2F2F',
									whiteSpace: 'pre-wrap',
									lineHeight: 1.5,
									fontFamily: 'var(--font-mono)',
									fontSize: 16
								}}
							>
								{isReader ? (
									<span
										style={{
											// Thicker, more visible repeating marker highlight (still bright)
											backgroundImage:
												'linear-gradient(transparent 0, transparent 26%, var(--readerHighlightBlueStrong) 26%, var(--readerHighlightBlueStrong) 92%, transparent 92%, transparent 100%)',
											backgroundSize: '100% 1.8em',
											backgroundRepeat: 'repeat-y',
											backgroundPosition: '0 0.05em',
											boxDecorationBreak: 'clone',
											WebkitBoxDecorationBreak: 'clone'
										}}
									>
										{item.line.text}
									</span>
								) : (
									item.line.text
								)}
							</div>
						</li>
					);
				})}
			</ul>

			<div style={{ position: 'sticky', bottom: 0, background: '#fff', paddingTop: 8 }}>
				<button
					onClick={markDone}
					disabled={!allRecorded}
					style={{
						width: '100%',
						padding: '12px 16px',
						borderRadius: 10,
						border: 'none',
						cursor: allRecorded ? 'pointer' : 'not-allowed',
						background: '#3D5A80',
						color: '#ffffff',
						fontWeight: 700,
						fontSize: 16
					}}
				>
					{allRecorded ? 'Submit Lines' : 'Record all reader lines to submit'}
				</button>
			</div>
		</div>
	);
}


