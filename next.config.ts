import type { NextConfig } from "next";

// Cortex serves under /cortex on capconvert.com (rewritten from the marketing
// site to ai-jacque.vercel.app). basePath is inlined at build time, so every
// route, asset, and API URL gets the /cortex prefix automatically. Mirrors
// capconvert-pm's /ops setup.
//
// Client-side fetches must use absolute "/cortex/api/..." paths. basePath is
// a Next.js routing concept that does not bend the global fetch() API, so any
// raw fetch() in a client component needs the prefix baked in.
const nextConfig: NextConfig = {
  basePath: "/cortex",
};

export default nextConfig;
