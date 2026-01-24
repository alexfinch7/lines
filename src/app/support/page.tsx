import React from 'react';
import styles from './page.module.css';
import Link from 'next/link';

export const metadata = {
  title: 'Support - Counterpart',
  description: 'Frequently asked questions and support for Counterpart.',
};

export default function SupportPage() {
  const faqs = [
    {
      question: 'Counterpart isn’t responding to my lines',
      answer: 'Most likely, Counterpart doesn’t recognize the Cue Target word for your line. By default, the Cue Target word is set to the last word in a line you speak (Myself line). Try changing the Cue Target word to a different, more obvious word in your line and see if it gets picked up easier.\n\nIf Counterpart isn’t responding to ANY of your spoken lines, please contact us at hello@counterpart.actor and we will be happy to assist.'
    },
    {
      question: 'How do I import a scene?',
      answer: 'To import, you must go to the PDF Document on your phone of the scene (in Gmail, Files, Drive, Dropbox or wherever you get your scenes), and click the Share icon. Then, in the options for sharing to Apps, click more, and then click Counterpart. Please look at the Walkthrough for more info.'
    },
    {
      question: 'The record button isn’t working',
      answer: 'The swipe record button works if you do the following: press and HOLD to start recording. Speak your line. Once finished speaking, drag the button to the left and let go to save it as a Reader line, or drag the button to the right and let go to save it as a Myself line.\n\nIf you are still need help, or the recording still does not work, please contact us at hello@counterpart.actor we will respond promptly!'
    },
    {
      question: 'How do I have my friend record the reader lines for me?',
      answer: 'First you must create the scene fully or import it via PDF. All lines must be correctly added and ordered. In edit mode, click the little greyed toggle in the top right corner of the scene. That will give you a share link to send to a friend so they can record on a browser (no app needed).\n\nIf you need the link again, you can click the little link icon to the right of the toggle to copy the link for sharing (the toggle must be on).'
    },
    {
      question: 'I didn’t import a scene properly with AI, can I add or adjust AI generated lines?',
      answer: 'Yes, to add or rerecord an AI generated line, you must go to the scene in edit mode, and click the plus button to add a new line, and then select the Generate Cue option, then type in the correct text for the line and select a reader voice. That will create a new AI generated cue line at the given location. You can also just change the text of the AI generated line and click the "AI Audio" button to regenerate the AI audio for the entire scene.'
    },
    {
      question: 'How do I access my Counterpart Studio Dashboard (Beta)',
      answer: <>Go to <Link href="/dashboard" className={styles.link}>counterpart.actor/dashboard</Link> and enter your phone number. You will be able to see all your practice stats and audition logs.</>
    },
    {
      question: 'How do I add Tags and Notes to my scenes?',
      answer: 'You can see data for each scene including tags, notes, time practiced and setting a project for each scene by clicking on the scene icon in the main menu, to the left of the scene title.'
    },
    {
      question: 'How do I delete a scene or line?',
      answer: 'Press and hold a scene from the main menu to delete it, drag a line to the left to delete it.'
    },
    {
      question: 'How do I rename a scene?',
      answer: 'In edit mode, click the scene title.'
    },
    {
      question: 'How do I cancel my subscription?',
      answer: 'Go to iOS Settings -> Account -> Subscriptions to manage your Counterpart subscription'
    },
  ];

  return (
    <main className={styles.container}>
      <div className={styles.contentWrapper}>
        <div className={styles.header}>
          <p className={styles.headerText}>
            To manage your subscription, on your mobile device, go to Settings -&gt; Account -&gt; Subscriptions.
          </p>
          <p className={styles.headerText}>
            For direct support please contact <a href="mailto:hello@counterpart.actor" className={styles.link}>hello@counterpart.actor</a>.
          </p>
        </div>

        <h1 className={styles.sectionTitle}>FAQs</h1>

        <div className={styles.faqList}>
          {faqs.map((faq, index) => (
            <div key={index} className={styles.faqItem}>
              <h2 className={styles.question}>{faq.question}</h2>
              <div className={styles.answer}>{faq.answer}</div>
            </div>
          ))}
        </div>

        <div className={styles.footer}>
          <p>
            Contact <a href="mailto:hello@counterpart.actor" className={styles.link}>hello@counterpart.actor</a> for help or special requests.
          </p>
        </div>
      </div>
    </main>
  );
}

