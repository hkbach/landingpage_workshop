import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  transpilePackages: ["@workshop/shared"],
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
  // Dev only: subdomains of PLATFORM_DOMAIN (e.g. app.localtest.me, clayco.localtest.me) load dev resources/HMR.
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
