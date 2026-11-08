import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  outputFileTracingIncludes: {
    "/api/resolve": ["./bin/yt-dlp", "./bin/yt-dlp.pyz"],
    "/api/downloads": ["./bin/yt-dlp", "./bin/yt-dlp.pyz"],
    "/api/downloads/file": ["./bin/yt-dlp", "./bin/yt-dlp.pyz"],
  },
  turbopack: {
    root: import.meta.dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
