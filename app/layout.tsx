import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'The Newsren — Beyond the buzz',
  description:
    'What everyone’s talking about vs. what the paper actually shows. An evidence-first AI research briefing.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
