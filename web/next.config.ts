import { resolve } from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

/** Site-wide languages (Phase P, task P.5): the request config reads the NEXT_LOCALE cookie. */
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const isDev = process.env.NODE_ENV !== "production";

/**
 * Security headers (task 1.9, NFR-SEC-04). Next.js injects inline scripts, so
 * script-src needs 'unsafe-inline' until a nonce-based CSP is added.
 * Pusher is allowed for real time (task 5.1).
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' blob:",
  "connect-src 'self' https://*.pusher.com wss://*.pusher.com" + (isDev ? " ws://localhost:*" : ""),
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  // Microphone only for our own pages (the portal's live microphone, task M.12)
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" },
];

/**
 * Files outside `web/` that server code reads at run time (the evaluation scenarios the admin "simulate"
 * feature uses). Without this they would not be packaged into Vercel's serverless functions. Needs
 * "Include files outside the Root Directory" on in the Vercel project (the default for new projects) and
 * Root Directory = web. The scenario library was removed in Phase P (P.2).
 */

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Build only. In `next dev` this root makes Turbopack watch web/.next/dev/logs, which Next writes on
  // every page load: each write triggers a rebuild and a full reload, so pages reload in a loop.
  ...(isDev ? {} : { outputFileTracingRoot: resolve(process.cwd(), "..") }),
  outputFileTracingIncludes: {
    "/api/v1/staff/admin/scoring-configs/**": ["../evaluation/scenarios/*.json"],
  },
  experimental: {
    authInterrupts: true, // forbidden() / unauthorized() for staff pages
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withNextIntl(nextConfig);
