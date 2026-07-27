import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // This repo has a package-lock.json at the root (repo-wide dev tooling) and one
  // per app, so Turbopack cannot infer the workspace root and falls back to the
  // repo root. That makes it watch and trace backend/ too. Pin the root to this
  // app: there are no npm workspaces, each app has its own node_modules, and the
  // frontend resolves nothing from outside this directory.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
