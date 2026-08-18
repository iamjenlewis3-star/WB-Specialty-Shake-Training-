import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships a WASM build of PostgreSQL; it must stay external to the
  // server bundle so the .wasm/.data files resolve from node_modules at runtime.
  serverExternalPackages: ["@electric-sql/pglite", "adm-zip", "xlsx"],
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    serverActions: { bodySizeLimit: "50mb" },
  },
};

export default nextConfig;
