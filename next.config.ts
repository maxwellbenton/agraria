import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  async rewrites() {
    return [
      // Serve the static icon-tracer page at a clean URL — it lives in
      // /public/icon-tool/index.html (plain HTML/JS, no Next.js build step).
      { source: "/icon-tool", destination: "/icon-tool/index.html" },
      { source: "/icon-tool/", destination: "/icon-tool/index.html" },
    ];
  },
};

export default nextConfig;
