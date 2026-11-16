import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/** Home-screen icon for iOS, rendered from the same artwork as icon.svg. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0b8576' }}>
        <svg width="150" height="150" viewBox="0 0 64 64">
          <path d="M11 47c5-9 9-15 13-15 5 0 2 11 8 11 3 0 5-3 6-5" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M44 32L54 22" stroke="#fff" strokeWidth="9" strokeLinecap="round" />
          <path d="M38 40l2.5-9 6.5 6.5z" fill="#fff" />
        </svg>
      </div>
    ),
    size,
  );
}
