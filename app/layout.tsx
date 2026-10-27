import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'The Newsren — AI research news, explained for students',
  description:
    'What everyone’s talking about vs. what the paper actually shows. An evidence-first AI research briefing.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Root layout applies to every page; this rule targets the Pages Router. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=UnifrakturMaguntia&family=Libre+Franklin:wght@400;500;600;700&family=Libre+Caslon+Text:ital,wght@0,400;0,700;1,400&display=swap"
        />
      </head>
      {/* The in-app browser may add attributes to body before React hydrates. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
