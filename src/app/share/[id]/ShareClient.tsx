'use client';

// src/app/share/[id]/ShareClient.tsx
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Mic, Square, Volume2, Check, Loader2, CheckCircle2, X } from 'lucide-react';
import type { ShareSession, ActorLine, ReaderLine } from '@/types/share';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RecordRTCType = any;

type Props = {
	initialSession: ShareSession;
	initialSceneVersion?: string;
	initialLineUpdatedAt?: Record<string, string>;
	initialSceneUpdatedAt?: string;
	initialSceneSharable?: boolean;
};

export default function ShareClient({
	initialSession,
	initialSceneVersion,
	initialLineUpdatedAt,
	initialSceneUpdatedAt,
	initialSceneSharable
}: Props) {
	const [session, setSession] = useState<ShareSession>(initialSession);
	const [sceneVersion, setSceneVersion] = useState<string | undefined>(initialSceneVersion);
	const [sceneOutOfDate, setSceneOutOfDate] = useState(false);
	const [sceneNoLongerSharable, setSceneNoLongerSharable] = useState(false);
	const [activeRecordingLineId, setActiveRecordingLineId] = useState<string | null>(null);
	const [playingLineId, setPlayingLineId] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [showSuccessDialog, setShowSuccessDialog] = useState(false);
	const [lineTimestampsSnapshot] = useState<Record<string, string> | undefined>(
		initialLineUpdatedAt
	);
	const [sceneUpdatedAtSnapshot] = useState<string | undefined>(initialSceneUpdatedAt);

	// Store recordings as local blobs (not uploaded until submit)
	const [localRecordings, setLocalRecordings] = useState<Record<string, Blob>>({});
	// Store object URLs for instant playback
	const [localPlaybackUrls, setLocalPlaybackUrls] = useState<Record<string, string>>({});

	// RecordRTC refs
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const recorderRef = useRef<any>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const audioContextRef = useRef<AudioContext | null>(null);
	const RecordRTCRef = useRef<RecordRTCType>(null);
	const currentLineIdRef = useRef<string | null>(null);
	const currentAudioRef = useRef<HTMLAudioElement | null>(null);

	// Dynamically import RecordRTC on client-side only
	useEffect(() => {
		import('recordrtc').then((module) => {
			RecordRTCRef.current = module.default;
		});
	}, []);

	// Keep a ref to the latest URLs for cleanup on unmount
	const localPlaybackUrlsRef = useRef(localPlaybackUrls);
	useEffect(() => {
		localPlaybackUrlsRef.current = localPlaybackUrls;
	}, [localPlaybackUrls]);

	// Cleanup object URLs ONLY on unmount
	useEffect(() => {
		return () => {
			Object.values(localPlaybackUrlsRef.current).forEach((url) => {
				URL.revokeObjectURL(url);
			});
		};
	}, []);

	// Initialize AudioContext on first user interaction (required for iOS)
	const initAudioContext = useCallback(() => {
		if (!audioContextRef.current) {
			audioContextRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
		}
		// Resume if suspended (iOS Safari suspends by default)
		if (audioContextRef.current.state === 'suspended') {
			audioContextRef.current.resume();
		}
	}, []);

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

	const playAudio = useCallback((url: string, lineId: string) => {
		// Stop any currently playing audio
		if (currentAudioRef.current) {
			currentAudioRef.current.pause();
			currentAudioRef.current = null;
		}

		return new Promise<void>((resolve, reject) => {
			const audio = new Audio(url);
			currentAudioRef.current = audio;
			
			audio.onended = () => {
				setPlayingLineId((id) => (id === lineId ? null : id));
				currentAudioRef.current = null;
				resolve();
			};
			audio.onerror = (e) => {
				setPlayingLineId((id) => (id === lineId ? null : id));
				currentAudioRef.current = null;
				reject(e);
			};
			setPlayingLineId(lineId);
			audio.play().catch((e) => {
				setPlayingLineId((id) => (id === lineId ? null : id));
				currentAudioRef.current = null;
				reject(e);
			});
		});
	}, []);

	const timestampsEqual = (
		initial?: Record<string, string>,
		latest?: Record<string, string>
	): boolean => {
		if (!initial || !latest) return true;
		const initialKeys = Object.keys(initial);
		const latestKeys = Object.keys(latest);
		if (initialKeys.length !== latestKeys.length) return false;
		for (const key of initialKeys) {
			if (!(key in latest)) return false;
			if (initial[key] !== latest[key]) return false;
		}
		return true;
	};

	const verifySceneFreshnessOrBlock = async (): Promise<boolean> => {
		if (!session.id || !lineTimestampsSnapshot) {
			setSceneOutOfDate(true);
			alert(
				"Uh-Oh! We couldn't verify whether this scene changed. Please reload the page before recording."
			);
			return false;
		}

		try {
			const res = await fetch(`/api/session?id=${session.id}`, {
				method: 'GET',
				headers: { Accept: 'application/json' },
				cache: 'no-store'
			});

			if (res.status === 403) {
				const errorBody = await res.json().catch(() => ({}));
				if (errorBody?.notSharable) {
					setSceneNoLongerSharable(true);
					setSceneOutOfDate(true);
					alert(
						"Uh-Oh! This scene is no longer being shared. The scene owner has disabled sharing. Please reload the page or contact them for a new link."
					);
					return false;
				}
			}

			if (!res.ok) {
				console.error('Failed to refresh scene timestamps', await res.text());
				setSceneOutOfDate(true);
				alert(
					"Uh-Oh! We couldn't verify whether this scene changed. Please reload the page before recording."
				);
				return false;
			}

			const data = (await res.json()) as {
				lineUpdatedAt?: Record<string, string>;
				sceneUpdatedAt?: string;
				sceneSharable?: boolean;
			};

			if (data.sceneSharable === false) {
				setSceneNoLongerSharable(true);
				setSceneOutOfDate(true);
				alert(
					"Uh-Oh! This scene is no longer being shared. The scene owner has disabled sharing. Please reload the page or contact them for a new link."
				);
				return false;
			}

			if (sceneUpdatedAtSnapshot && data.sceneUpdatedAt && sceneUpdatedAtSnapshot !== data.sceneUpdatedAt) {
				setSceneOutOfDate(true);
				alert(
					"Uh-Oh! It seems like the scene you're reading for was edited. Please reload this link after your counterpart is done editing."
				);
				return false;
			}

			if (!timestampsEqual(lineTimestampsSnapshot, data.lineUpdatedAt)) {
				setSceneOutOfDate(true);
				alert(
					"Uh-Oh! It seems like the scene you're reading for was edited. Please reload this link after your counterpart is done editing."
				);
				return false;
			}

			return true;
		} catch (e) {
			console.error('Failed to check scene timestamps', e);
			setSceneOutOfDate(true);
			alert(
				"Uh-Oh! We couldn't verify whether this scene changed. Please reload the page before recording."
			);
			return false;
		}
	};

	const startRecording = async (reader: ReaderLine) => {
		// Initialize AudioContext on user interaction (required for iOS Safari)
		initAudioContext();

		if (sceneNoLongerSharable) {
			alert(
				"Uh-Oh! This scene is no longer being shared. The scene owner has disabled sharing. Please reload the page or contact them for a new link."
			);
			return;
		}

		if (sceneOutOfDate) {
			alert(
				"Uh-Oh! It seems like the scene you're reading for is actively being edited. " +
					'Please reload the page after your counterpart is done editing.'
			);
			return;
		}

		if (activeRecordingLineId) return;

		if (!RecordRTCRef.current) {
			alert('Recording library is still loading. Please try again.');
			return;
		}

		const fresh = await verifySceneFreshnessOrBlock();
		if (!fresh) return;

		try {
			// Get or reuse audio stream
			let stream = streamRef.current;
			if (!stream || !stream.active) {
				// Request new stream if none exists or previous was closed
				stream = await navigator.mediaDevices.getUserMedia({ 
					audio: {
						echoCancellation: true,
						noiseSuppression: true,
						autoGainControl: true
					} 
				});
				streamRef.current = stream;
			}

			currentLineIdRef.current = reader.lineId;

			// Create RecordRTC with optimized settings for mobile:
			// - 16kHz sample rate (smaller files, good for voice)
			// - Mono channel
			const RecordRTC = RecordRTCRef.current;
			const recorder = new RecordRTC(stream, {
				type: 'audio',
				mimeType: 'audio/wav',
				recorderType: RecordRTC.StereoAudioRecorder,
				numberOfAudioChannels: 1,
				desiredSampRate: 16000, // 16kHz is plenty for voice, ~3x smaller than 44.1kHz
				disableLogs: true
			});

			recorderRef.current = recorder;
			recorder.startRecording();
			setActiveRecordingLineId(reader.lineId);
		} catch (e) {
			console.error('Failed to start recording', e);
			// Reset stream ref if there was an error
			streamRef.current = null;
			alert('Could not access microphone. Please check permissions and try again.');
		}
	};

	const stopRecording = useCallback(() => {
		const recorder = recorderRef.current;
		const lineId = currentLineIdRef.current;

		if (!recorder || !lineId) return;

		// Clear UI state immediately
		setActiveRecordingLineId(null);

		recorder.stopRecording(() => {
			const blob = recorder.getBlob();
			
			// Store blob locally (no upload yet)
			setLocalRecordings((prev) => ({ ...prev, [lineId]: blob }));
			
			// Create object URL for instant playback
			const playbackUrl = URL.createObjectURL(blob);
			setLocalPlaybackUrls((prev) => {
				// Revoke old URL if exists
				if (prev[lineId]) {
					URL.revokeObjectURL(prev[lineId]);
				}
				return { ...prev, [lineId]: playbackUrl };
			});

			// Mark as recorded in session state (using local URL marker)
			setSession((prev) => {
				const updatedReaderLines = [...(prev.reader_lines || [])].map((l) =>
					l.lineId === lineId ? { ...l, audioUrl: `local:${lineId}` } : l
				);
				return { ...prev, reader_lines: updatedReaderLines };
			});

			// Cleanup recorder but keep stream alive
			recorder.destroy();
			recorderRef.current = null;
			currentLineIdRef.current = null;
		});
	}, []);

	const playReader = useCallback(async (reader: ReaderLine) => {
		// Use local playback URL if available (instant), otherwise fall back to server URL
		const localUrl = localPlaybackUrls[reader.lineId];
		if (localUrl) {
			await playAudio(localUrl, reader.lineId);
		} else if (reader.audioUrl && !reader.audioUrl.startsWith('local:')) {
			await playAudio(reader.audioUrl, reader.lineId);
		}
	}, [localPlaybackUrls, playAudio]);

	const uploadAllRecordings = async (): Promise<Record<string, string>> => {
		const uploadedUrls: Record<string, string> = {};

		for (const [lineId, blob] of Object.entries(localRecordings)) {
			const formData = new FormData();
			formData.append('file', blob, `${lineId}.wav`);
			formData.append('sessionId', session.id);
			formData.append('lineId', lineId);
			formData.append('role', 'reader');

			const uploadRes = await fetch('/api/upload', {
				method: 'POST',
				body: formData
			});

			if (!uploadRes.ok) {
				throw new Error(`Failed to upload recording for line ${lineId}`);
			}

			const { url } = await uploadRes.json();
			uploadedUrls[lineId] = url;
		}

		return uploadedUrls;
	};

	const markDone = async () => {
		if (sceneNoLongerSharable) {
			alert(
				"Uh-Oh! This scene is no longer being shared. The scene owner has disabled sharing. Please reload the page or contact them for a new link."
			);
			return;
		}

		if (sceneOutOfDate) {
			alert(
				"Uh-Oh! It seems like the scene you're reading for is actively being edited. " +
					'Please reload the page after your counterpart is done editing before submitting.'
			);
			return;
		}

		if (!lineTimestampsSnapshot) {
			alert(
				"Uh-Oh! We couldn't verify whether this scene changed. Please reload the page before submitting."
			);
			return;
		}

		// Final freshness check before uploading
		const fresh = await verifySceneFreshnessOrBlock();
		if (!fresh) return;

		setIsSubmitting(true);

		try {
			// Upload all recordings now
			const uploadedUrls = await uploadAllRecordings();

			// Build updates with the uploaded URLs and generate new recording IDs
			const updates = Object.entries(uploadedUrls).map(([lineId, audioUrl]) => ({
				lineId,
				audioUrl,
				recordingId: crypto.randomUUID()
			}));

			if (updates.length === 0) {
				alert('No recordings to submit.');
				setIsSubmitting(false);
				return;
			}

			const commitRes = await fetch('/api/session/commit', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					sessionId: session.id,
					lineTimestamps: lineTimestampsSnapshot,
					sceneUpdatedAt: sceneUpdatedAtSnapshot,
					updates
				})
			});

			if (!commitRes.ok) {
				const body = await commitRes.json().catch(() => ({}));
				if (commitRes.status === 403 && body?.notSharable) {
					setSceneNoLongerSharable(true);
					setSceneOutOfDate(true);
					alert(
						body?.error ??
							"Uh-Oh! This scene is no longer being shared. The scene owner has disabled sharing."
					);
				} else if (commitRes.status === 409) {
					setSceneOutOfDate(true);
					alert(
						body?.error ??
							"Uh-Oh! It seems like the scene you're reading for was edited. Please reload this link before submitting."
					);
				} else {
					console.error('Failed to commit lines', body);
					alert(body?.error ?? 'Failed to submit lines. Please try again.');
				}
				setIsSubmitting(false);
				return;
			}
		} catch (e) {
			console.error('Failed to commit lines', e);
			alert('Failed to submit lines. Please try again.');
			setIsSubmitting(false);
			return;
		}

		const res = await fetch('/api/session/done', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id: session.id })
		});
		if (!res.ok) {
			console.error(await res.text());
			alert('Failed to mark as done');
			setIsSubmitting(false);
			return;
		}
		setSession((prev) => ({ ...prev, status: 'completed' }));
		setIsSubmitting(false);
		setShowSuccessDialog(true);
	};

	// Check if all reader lines have recordings (either local or from server)
	const allRecorded = readerLines.length > 0 && readerLines.every((l) => {
		return localRecordings[l.lineId] || (l.audioUrl && !l.audioUrl.startsWith('local:'));
	});

	// Check if a line has a recording available for playback
	const hasPlayableRecording = (lineId: string, audioUrl?: string) => {
		return localPlaybackUrls[lineId] || (audioUrl && !audioUrl.startsWith('local:'));
	};

	return (
		<div style={{ paddingBottom: 24 }}>
			<h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, lineHeight: 1.2, color: '#3B2F2F' }}>
				{session.title}
			</h1>
			<p style={{ fontFamily: 'var(--font-sans)', marginTop: 4, color: '#3B2F2F' }}>
				Status: <strong>{session.status === 'completed' ? 'Completed' : 'Pending'}</strong>
			</p>

			{/* Warning banner when scene is blocked */}
			{sceneNoLongerSharable && (
				<div
					style={{
						marginTop: 16,
						padding: '12px 16px',
						backgroundColor: '#fef2f2',
						border: '1px solid #fecaca',
						borderRadius: 8,
						color: '#991b1b'
					}}
				>
					<strong>Scene No Longer Shared</strong>
					<p style={{ margin: '4px 0 0', fontSize: 14 }}>
						The scene owner has disabled sharing. Please contact them for a new link or reload
						once they re-enable sharing.
					</p>
				</div>
			)}

			{sceneOutOfDate && !sceneNoLongerSharable && (
				<div
					style={{
						marginTop: 16,
						padding: '12px 16px',
						backgroundColor: '#fffbeb',
						border: '1px solid #fcd34d',
						borderRadius: 8,
						color: '#92400e'
					}}
				>
					<strong>Scene Has Been Edited</strong>
					<p style={{ margin: '4px 0 0', fontSize: 14 }}>
						The scene you&apos;re reading for was edited. Please reload this page after your
						counterpart is done editing.
					</p>
				</div>
			)}

			<ul style={{ listStyle: 'none', padding: 0, marginTop: 16 }}>
				{items.map((item) => {
					const key = `${item.kind}-${item.line.lineId}`;
					const isReader = item.kind === 'reader';
					const isRecording = isReader && activeRecordingLineId === item.line.lineId;
					const readerLine = item.line as ReaderLine;
					const hasRecording = isReader && hasPlayableRecording(readerLine.lineId, readerLine.audioUrl);
					const isPlaying = playingLineId === item.line.lineId;
					
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
											{(() => {
												// Disable this line's buttons if another line is recording or playing
												const isBusy = isSubmitting || 
													(activeRecordingLineId !== null && activeRecordingLineId !== readerLine.lineId) ||
													(playingLineId !== null && playingLineId !== readerLine.lineId);
												const isThisLineBusy = isRecording || isPlaying;
												
												return (
													<>
														<button
															onClick={isRecording ? stopRecording : () => startRecording(readerLine)}
															disabled={isBusy && !isRecording}
															style={{
																padding: '10px 12px',
																borderRadius: 999,
																border: '1px solid #ddd',
																background: isRecording ? '#ffd6d6' : 'var(--readerHighlightBlue)',
																color: '#3B2F2F',
																cursor: (isBusy && !isRecording) ? 'not-allowed' : 'pointer',
																minWidth: 44,
																display: 'inline-flex',
																alignItems: 'center',
																justifyContent: 'center',
																opacity: (isBusy && !isThisLineBusy) ? 0.5 : 1
															}}
															aria-label={isRecording ? 'Stop recording' : 'Record line'}
														>
															{isRecording ? <Square size={18} /> : <Mic size={18} />}
														</button>
														{hasRecording && (
															<>
																<button
																	onClick={() => playReader(readerLine)}
																	disabled={isBusy && !isPlaying}
																	style={{
																		padding: '10px 12px',
																		borderRadius: 999,
																		border: '1px solid #ddd',
																		background: isPlaying ? '#e0f2fe' : 'var(--readerHighlightBlue)',
																		color: '#3B2F2F',
																		cursor: (isBusy && !isPlaying) ? 'not-allowed' : 'pointer',
																		minWidth: 44,
																		display: 'inline-flex',
																		alignItems: 'center',
																		justifyContent: 'center',
																		opacity: (isBusy && !isThisLineBusy) ? 0.5 : 1
																	}}
																	aria-label="Play your recording"
																>
																	<Volume2 size={18} />
																</button>
																<Check size={18} color="#2ecc71" aria-label="Recorded" />
															</>
														)}
													</>
												);
											})()}
										</>
									) : null}
								</div>
							</div>
							{/* Line text */}
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
					disabled={sceneOutOfDate || sceneNoLongerSharable || !allRecorded || isSubmitting}
					style={{
						width: '100%',
						padding: '12px 16px',
						borderRadius: 10,
						border: 'none',
						cursor: allRecorded && !sceneOutOfDate && !sceneNoLongerSharable && !isSubmitting ? 'pointer' : 'not-allowed',
						background: sceneOutOfDate || sceneNoLongerSharable ? '#9ca3af' : '#3D5A80',
						color: '#ffffff',
						fontWeight: 700,
						fontSize: 16,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						gap: 8
					}}
				>
					{isSubmitting && <Loader2 size={18} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />}
					{sceneNoLongerSharable
						? 'Scene no longer shared'
						: sceneOutOfDate
						? 'Please reload the page'
						: isSubmitting
						? 'Uploading...'
						: allRecorded
						? 'Submit Lines'
						: 'Record all reader lines to submit'}
				</button>
			</div>

			{/* Success Dialog */}
			{showSuccessDialog && (
				<div
					style={{
						position: 'fixed',
						inset: 0,
						backgroundColor: 'rgba(0, 0, 0, 0.5)',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						zIndex: 1000,
						padding: 16
					}}
					onClick={() => setShowSuccessDialog(false)}
				>
					<div
						style={{
							backgroundColor: '#fff',
							borderRadius: 16,
							padding: 32,
							maxWidth: 400,
							width: '100%',
							textAlign: 'center',
							boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
							position: 'relative'
						}}
						onClick={(e) => e.stopPropagation()}
					>
						<button
							onClick={() => setShowSuccessDialog(false)}
							style={{
								position: 'absolute',
								top: 12,
								right: 12,
								background: 'none',
								border: 'none',
								cursor: 'pointer',
								padding: 4,
								color: '#9ca3af'
							}}
							aria-label="Close"
						>
							<X size={20} />
						</button>

						<div
							style={{
								width: 64,
								height: 64,
								borderRadius: '50%',
								backgroundColor: '#d1fae5',
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								margin: '0 auto 16px'
							}}
						>
							<CheckCircle2 size={32} color="#059669" />
						</div>

						<h2
							style={{
								fontFamily: 'var(--font-display)',
								fontSize: 24,
								fontWeight: 700,
								color: '#3B2F2F',
								marginBottom: 8
							}}
						>
							Lines Submitted!
						</h2>

						<p
							style={{
								fontFamily: 'var(--font-sans)',
								fontSize: 16,
								color: '#6b7280',
								marginBottom: 24,
								lineHeight: 1.5
							}}
						>
							Your recordings have been sent successfully. The scene owner will be notified and can now review your lines.
						</p>

						<button
							onClick={() => setShowSuccessDialog(false)}
							style={{
								width: '100%',
								padding: '12px 24px',
								borderRadius: 10,
								border: 'none',
								backgroundColor: '#3D5A80',
								color: '#fff',
								fontWeight: 600,
								fontSize: 16,
								cursor: 'pointer'
							}}
						>
							Done
						</button>
					</div>
				</div>
			)}

			<style jsx>{`
				@keyframes spin {
					from { transform: rotate(0deg); }
					to { transform: rotate(360deg); }
				}
			`}</style>
		</div>
	);
}
