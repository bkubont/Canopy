import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hostinger Node.js runs `next start` against a built app.
  // Prefer a standard build over Turbopack for production deploys.
  poweredByHeader: false,
};

export default nextConfig;
