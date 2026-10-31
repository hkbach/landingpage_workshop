import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  transpilePackages: ["@workshop/shared"],
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
