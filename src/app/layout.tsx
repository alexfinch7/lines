import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const advercase = localFont({
  src: "../fonts/Advercase.otf",
  variable: "--font-display",
});
const dmMono = localFont({
  src: "../fonts/DMMono-Regular.ttf",
  variable: "--font-mono",
});
const interTight = localFont({
  src: "../fonts/InterTight-VariableFont_wght.ttf",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Counterpart",
  description: "Your scene partner, reader, and understudy.",
  icons: {
    icon: '/favicon.png',
    shortcut: '/favicon.png',
    apple: '/favicon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${advercase.variable} ${dmMono.variable} ${interTight.variable}`}>
        {children}
      </body>
    </html>
  );
}
