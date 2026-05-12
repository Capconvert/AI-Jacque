import type { NextConfig } from "next";

// Cortex serves under /cortex on capconvert.com (rewritten from the marketing
// site to ai-jacque.vercel.app). basePath is inlined at build time, so every
// route, asset, and API URL gets the /cortex prefix automatically. Mirrors
// capconvert-pm's /ops setup.
const nextConfig: NextConfig = {
  basePath: "/cortex",
};

export default nextConfig;
