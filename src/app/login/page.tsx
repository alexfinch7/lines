'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseClient } from '@/lib/supabaseClient';

export default function LoginPage() {
	const router = useRouter();
	const [phone, setPhone] = useState('+1 ');
	const [code, setCode] = useState('');
	const [step, setStep] = useState<'phone' | 'code' | 'name'>('phone');
	const [stageName, setStageName] = useState('');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleSendCode = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);
		setLoading(true);
		try {
			const trimmed = phone.trim();
			if (!trimmed) {
				setError('Enter your phone number including country code.');
				return;
			}

			const { error: signInError } = await supabaseClient.auth.signInWithOtp({
				phone: trimmed,
				options: {
					channel: 'sms'
				}
			});

			if (signInError) {
				setError(signInError.message);
				return;
			}

			setStep('code');
		} finally {
			setLoading(false);
		}
	};

	const handleVerifyCode = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);
		setLoading(true);
		try {
			const trimmedPhone = phone.trim();
			const trimmedCode = code.trim();
			if (!trimmedPhone || !trimmedCode) {
				setError('Enter the verification code sent to your phone.');
				return;
			}

			const { data, error: verifyError } = await supabaseClient.auth.verifyOtp({
				type: 'sms',
				phone: trimmedPhone,
				token: trimmedCode
			});

			if (verifyError || !data.session) {
				setError(verifyError?.message ?? 'Verification failed. Check the code and try again.');
				return;
			}

			// Check if the user already has a stage name
			const token = data.session.access_token;
			try {
				const profileRes = await fetch('/api/profile/name', {
					method: 'GET',
					headers: {
						Authorization: `Bearer ${token}`
					},
					cache: 'no-store'
				});

				if (profileRes.ok) {
					const body = (await profileRes.json()) as { stageName?: string | null };
					if (body.stageName && body.stageName.trim().length > 0) {
						router.replace('/dashboard');
						return;
					}
				}
			} catch {
				// If the profile lookup fails, fall back to asking for a name.
			}

			setStep('name');
		} finally {
			setLoading(false);
		}
	};

	return (
		<main
			style={{
				minHeight: '100vh',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				background: 'var(--offWhite)'
			}}
		>
			<div
				style={{
					width: '100%',
					maxWidth: 420,
					padding: 32,
					borderRadius: 16,
					background: '#ffffff',
					boxShadow: '0 18px 45px rgba(0,0,0,0.06)',
					border: '1px solid var(--clay20)'
				}}
			>
				<h1
					style={{
						fontFamily: 'var(--font-display)',
						fontSize: 28,
						lineHeight: 1.1,
						color: 'var(--espresso)',
						marginBottom: 8
					}}
				>
					Welcome back
				</h1>
				<p
					style={{
						fontFamily: 'var(--font-sans)',
						fontSize: 14,
						color: '#5b4a4a',
						marginBottom: 24
					}}
				>
					Log in with the same phone number you use in the app to see your Understudy Studio stats.
				</p>

				{step === 'phone' && (
					<form onSubmit={handleSendCode} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
						<label style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--espresso)' }}>
							Phone number
							<input
								type="tel"
								value={phone}
								onChange={(e) => setPhone(e.target.value)}
								placeholder="+1 555 555 5555"
								style={{
									marginTop: 6,
									width: '100%',
									padding: '10px 12px',
									borderRadius: 10,
									border: '1px solid var(--clay30)',
									fontSize: 15,
									fontFamily: 'var(--font-sans)',
									background: 'var(--offWhite)'
								}}
							/>
						</label>

						<button
							type="submit"
							disabled={loading}
							style={{
								marginTop: 4,
								width: '100%',
								padding: '11px 14px',
								borderRadius: 999,
								border: 'none',
								cursor: loading ? 'default' : 'pointer',
								background: 'var(--navy)',
								color: '#ffffff',
								fontWeight: 600,
								fontSize: 15,
								fontFamily: 'var(--font-sans)'
							}}
						>
							{loading ? 'Sending code…' : 'Send code'}
						</button>
					</form>
				)}

				{step === 'code' && (
					<form onSubmit={handleVerifyCode} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
						<label style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--espresso)' }}>
							Verification code
							<input
								type="text"
								inputMode="numeric"
								value={code}
								onChange={(e) => setCode(e.target.value)}
								placeholder="6-digit code"
								style={{
									marginTop: 6,
									width: '100%',
									padding: '10px 12px',
									borderRadius: 10,
									border: '1px solid var(--clay30)',
									fontSize: 15,
									letterSpacing: 4,
									fontFamily: 'var(--font-mono)',
									background: 'var(--offWhite)'
								}}
							/>
						</label>

						<button
							type="submit"
							disabled={loading}
							style={{
								marginTop: 4,
								width: '100%',
								padding: '11px 14px',
								borderRadius: 999,
								border: 'none',
								cursor: loading ? 'default' : 'pointer',
								background: 'var(--navy)',
								color: '#ffffff',
								fontWeight: 600,
								fontSize: 15,
								fontFamily: 'var(--font-sans)'
							}}
						>
							{loading ? 'Verifying…' : 'Log in'}
						</button>

						<button
							type="button"
							onClick={() => {
								setStep('phone');
								setCode('');
								setError(null);
							}}
							style={{
								marginTop: 4,
								width: '100%',
								padding: '10px 12px',
								borderRadius: 999,
								border: 'none',
								background: 'transparent',
								color: 'var(--navy)',
								fontSize: 13,
								fontFamily: 'var(--font-sans)',
								textDecoration: 'underline',
								cursor: 'pointer'
							}}
						>
							Use a different phone number
						</button>
					</form>
				)}

				{step === 'name' && (
					<form
						onSubmit={async (e) => {
							e.preventDefault();
							setError(null);
							const trimmed = stageName.trim();
							if (!trimmed) {
								setError('Please enter a name.');
								return;
							}
							setLoading(true);
							try {
								const {
									data: { session }
								} = await supabaseClient.auth.getSession();
								if (!session) {
									setError('Your session expired. Please log in again.');
									setStep('phone');
									return;
								}

								const res = await fetch('/api/profile/name', {
									method: 'POST',
									headers: {
										'Content-Type': 'application/json',
										Authorization: `Bearer ${session.access_token}`
									},
									body: JSON.stringify({ stageName: trimmed })
								});

								if (!res.ok) {
									const body = await res.json().catch(() => ({}));
									setError(body.error ?? 'Failed to save name.');
									return;
								}

								router.replace('/dashboard');
							} finally {
								setLoading(false);
							}
						}}
						style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
					>
						<label style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--espresso)' }}>
							What's your stage name?
							<input
								type="text"
								value={stageName}
								onChange={(e) => setStageName(e.target.value)}
								placeholder="e.g. Alex Finch"
								style={{
									marginTop: 6,
									width: '100%',
									padding: '10px 12px',
									borderRadius: 10,
									border: '1px solid var(--clay30)',
									fontSize: 15,
									fontFamily: 'var(--font-sans)',
									background: 'var(--offWhite)'
								}}
							/>
						</label>

						<button
							type="submit"
							disabled={loading}
							style={{
								marginTop: 4,
								width: '100%',
								padding: '11px 14px',
								borderRadius: 999,
								border: 'none',
								cursor: loading ? 'default' : 'pointer',
								background: 'var(--navy)',
								color: '#ffffff',
								fontWeight: 600,
								fontSize: 15,
								fontFamily: 'var(--font-sans)'
							}}
						>
							{loading ? 'Saving…' : 'Continue'}
						</button>
					</form>
				)}

				{error && (
					<p
						style={{
							marginTop: 16,
							fontFamily: 'var(--font-sans)',
							fontSize: 13,
							color: '#b00020'
						}}
					>
						{error}
					</p>
				)}
			</div>
		</main>
	);
}


