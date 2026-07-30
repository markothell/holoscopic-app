import type { Metadata } from 'next';
import { Newsreader, Archivo } from 'next/font/google';
import PlayerProvider from '@/components/audio/PlayerProvider';
import './globals.css';

// Newsreader carries the voice — the prompt sentence and the stories. Archivo
// is the working hand: names, labels, controls.
// Only the four faces the design actually uses: regular and medium, upright
// and italic. Every extra weight is another file fetched before the page reads
// properly, on a phone that is often on one bar.
const newsreader = Newsreader({
  subsets: ['latin'],
  weight: ['400', '500'],
  style: ['normal', 'italic'],
  variable: '--font-newsreader',
  display: 'swap',
});

const archivo = Archivo({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-archivo',
  display: 'swap',
});

// Deliberately generic. This deployment serves every memorial, so there is no
// single subject to name here — the title and share preview that matter are
// set per memorial in c/[slug]/layout.tsx, where the subject is known.
export const metadata: Metadata = {
  title: 'Chorus',
  description: 'Memories about one person, collected from anyone with the link.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#E4EAE2" />
      </head>
      <body className={`${newsreader.variable} ${archivo.variable}`}>
        {/* One audio element for the whole app, so two memories can never
            talk over each other and playback survives navigation. */}
        <PlayerProvider>{children}</PlayerProvider>
      </body>
    </html>
  );
}
