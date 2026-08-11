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

  // Browser calls to /api/* are proxied server-side to the NestJS backend
  // (RUN-48). This keeps BACKEND_URL a server-only variable (no NEXT_PUBLIC_
  // leak into the bundle), avoids CORS entirely, and gives the client one
  // origin to talk to. Next tries the app's own routes first (rewrites are
  // "afterFiles"), so a future frontend route handler under /api still wins
  // over the proxy.
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.BACKEND_URL ?? 'http://localhost:3000'}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
