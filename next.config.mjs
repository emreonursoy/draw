const isDev = process.env.NODE_ENV !== 'production';

// Content-Security-Policy: everything is served from our own origin (no third-party scripts, fonts,
// images or connections) and the app cannot be framed. Next.js hydration and the UI SDK need inline
// scripts/styles, so 'unsafe-inline' stays: this policy limits where content can load from, but it is
// NOT a defence against injected inline script. 'unsafe-eval' is only allowed in development.
// (upgrade-insecure-requests is intentionally omitted: it breaks plain-HTTP self-hosting; HTTPS hosts
// such as Vercel already redirect and send HSTS.)
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  // embedded pages (only ever loaded after the user double-clicks an embed)
  "frame-src https: http://localhost:* http://127.0.0.1:*",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};
export default nextConfig;
