import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  // No trailing slash so Vercel/static hosts don't double-redirect.
  trailingSlash: false,
};

export default nextConfig;
