import type { Metadata } from 'next';
import '@fontsource/caveat/latin-500.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import './globals.css';

export const metadata: Metadata = { title: 'draw', description: 'A virtual whiteboard for sketching hand-drawn like diagrams.' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
