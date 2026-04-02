import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.resolve(appRoot, "../..");

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Ensure @cabalfinder/shared (workspace package) is compiled by Next.js
  transpilePackages: ["@cabalfinder/shared"],

  // Turbopack (dev) — resolve workspace packages from monorepo root
  turbopack: {
    root: monorepoRoot
  },

  // Webpack (production build) — resolve workspace symlinks from monorepo root
  webpack(config) {
    config.resolve = config.resolve ?? {};
    // Tell webpack to follow symlinks so workspace packages resolve correctly
    config.resolve.symlinks = true;
    return config;
  }
};

export default nextConfig;
