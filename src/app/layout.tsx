import type { Metadata } from 'next';
// Every subset is imported; browsers only download the ones whose unicode-range is actually used.
import '@fontsource/caveat/latin-500.css';
import '@fontsource/caveat/latin-ext-500.css';
import '@fontsource/caveat/cyrillic-500.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-ext-400.css';
import '@fontsource/inter/latin-ext-500.css';
import '@fontsource/inter/latin-ext-600.css';
import '@fontsource/inter/cyrillic-400.css';
import '@fontsource/inter/cyrillic-600.css';
import '@fontsource/inter/greek-400.css';
import '@fontsource/inter/greek-600.css';
import '@fontsource/inter/vietnamese-400.css';
import '@fontsource/inter/vietnamese-600.css';
import './globals.css';

export const metadata: Metadata = { title: 'draw', description: 'A virtual whiteboard for sketching hand-drawn like diagrams.' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
