import type { NextConfig } from "next";

// Cortex serves under /cortex on capconvert.com (rewritten from the marketing
// site to ai-jacque.vercel.app). basePath is inlined at build time, so every
// route, asset, and API URL gets the /cortex prefix automatically. Mirrors
// capconvert-pm's /ops setup.
//
// trailingSlash: true so the document URL stays "/cortex/" after navigation.
// Existing client-side fetches use relative paths like "./api/clients" which
// only resolve under the basePath when the trailing slash is preserved.
const nextConfig: NextConfig = {
  basePath: "/cortex",
  trailingSlash: true,
};

export default nextConfig;
