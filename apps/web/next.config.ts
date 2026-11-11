import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Security headers (NFR-SEC): no MIME sniffing, a strict referrer, and the private areas cannot be framed by another site (clickjacking). HSTS only in production
// (localtest.me runs on http). TODO(api): a Content-Security-Policy once the scripts and the media hosts are known.
const common = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
];
const noFraming = [{ key: "X-Frame-Options", value: "SAMEORIGIN" }, { key: "Content-Security-Policy", value: "frame-ancestors 'self'" }];

const nextConfig: NextConfig = {
  transpilePackages: ["@workshop/shared"],
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: common },
      ...["/systemadmin/:path*", "/systemadmin", "/shopowner/:path*", "/shopowner", "/customer/:path*", "/login", "/signup", "/reset-password", "/forgot-password"].map((source) => ({ source, headers: noFraming })),
    ];
  },
  // The shop owner area moved from /dashboard to /shopowner; old links and bookmarks keep working (query strings are kept).
  async redirects() {
    return [
      { source: "/dashboard", destination: "/shopowner", permanent: false },
      { source: "/dashboard/:path*", destination: "/shopowner/:path*", permanent: false },
      // The system admin area moved from /admin to /systemadmin.
      { source: "/admin", destination: "/systemadmin", permanent: false },
      { source: "/admin/:path*", destination: "/systemadmin/:path*", permanent: false },
    ];
  },
  // Dev only: subdomains of PLATFORM_DOMAIN (e.g. app.localtest.me, whiskladle.localtest.me) load dev resources/HMR.
  allowedDevOrigins: ["localtest.me", "*.localtest.me"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withNextIntl(nextConfig);
