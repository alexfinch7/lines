'use client';

import Link from 'next/link';
import TextType from '../components/TextType';

export default function Home() {
  return (
    <main
      style={{
        width: '100vw',
        height: '100vh',
        backgroundColor: '#F8F5F2',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'column',
        fontFamily: 'var(--font-display)',
        color: '#3B2F2F',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <Link
        href="/dashboard"
        style={{
          position: 'absolute',
          top: '24px',
          right: '24px',
          padding: '10px 20px',
          backgroundColor: '#3B2F2F',
          color: '#F8F5F2',
          borderRadius: '30px',
          fontSize: '1rem',
          fontWeight: 500,
          fontFamily: 'var(--font-sans)',
          textDecoration: 'none',
          transition: 'transform 0.2s ease',
        }}
      >
        Dashboard
      </Link>
      <div style={{ position: 'relative', fontSize: '3rem', fontWeight: 600 }}>
        {/* Ghost element to define centering based on "Your Counterpart" */}
        <div style={{ visibility: 'hidden', whiteSpace: 'pre' }}>
          Your Counterpart
        </div>

        {/* Actual content overlaid */}
        <div style={{ position: 'absolute', top: 0, left: 0, whiteSpace: 'nowrap' }}>
          <span>Your </span>
          <TextType
            text={[
              "Counterpart",
              "scene partner",
              "reader",
              "understudy",
              "Counterpart",
              "career tracker",
              "camera man",
              "practice space",
            ]}
            typingSpeed={75}
            deletingSpeed={40}
            pauseDuration={1500}
            showCursor={true}
            cursorCharacter="*"
          />
        </div>
      </div>
      <Link
        href="/privacy"
        style={{
          position: 'absolute',
          bottom: '24px',
          fontSize: '0.75rem',
          color: '#3B2F2F',
          opacity: 0.6,
          textDecoration: 'none',
          fontFamily: 'var(--font-sans)',
          transition: 'opacity 0.2s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = '1';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = '0.6';
        }}
      >
        Privacy Policy
      </Link>
    </main>
  );
}
