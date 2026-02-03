'use client';

import Link from 'next/link';
import TextType from '../components/TextType';
import styles from './page.module.css';

export default function Home() {
  return (
    <main className={styles.container}>
      <Link
        href="/dashboard"
        className={styles.dashboardButton}
      >
        Dashboard
      </Link>
      <div className={styles.centerTextContainer}>
        {/* Ghost element to define centering based on "Your Counterpart" */}
        <div className={styles.ghostText}>
          Your Counterpart
        </div>

        {/* Actual content overlaid */}
        <div className={styles.typingOverlay}>
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
      <a
        href="/download"
        target="_blank"
        rel="noopener noreferrer"
        className={styles.downloadButton}
      >
        Download for iOS
      </a>
      <Link
        href="/privacy"
        className={styles.privacyLink}
      >
        Privacy Policy
      </Link>
    </main>
  );
}
