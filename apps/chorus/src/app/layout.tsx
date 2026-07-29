import type { Metadata } from 'next';
import { Newsreader, Archivo } from 'next/font/google';
import { memorialApi } from '@/services/api';
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

// The title and share preview come from the memorial's own config, so a
// texted link says who it's for. Falls back to something dignified rather
// than "Chorus" if the backend is unreachable — an app name means nothing to
// someone arriving from a message about a person they knew.
export async function generateMetadata(): Promise<Metadata> {
  try {
    const { memorial } = await memorialApi.config();
    const name = memorial.subjectName || 'someone';
    return {
      title: `Memories of ${name}`,
      description: memorial.blurb || `Share a memory of ${name}.`,
      openGraph: {
        title: `Memories of ${name}`,
        description: memorial.blurb || `Share a memory of ${name}.`,
        images: memorial.subjectPhotoUrl ? [memorial.subjectPhotoUrl] : undefined,
      },
    };
  } catch {
    return { title: 'Memories' };
  }
}

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
