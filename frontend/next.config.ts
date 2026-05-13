import type { NextConfig } from "next";

// Note: removed `output: "export"`. The agent BFF route (/api/agent) is a
// dynamic Node runtime, which is incompatible with static export. The product
// is now server-rendered (Vercel default) so the agent panel can call the BFF.
const nextConfig: NextConfig = {
  images: { unoptimized: true },
  trailingSlash: false,
};

export default nextConfig;
