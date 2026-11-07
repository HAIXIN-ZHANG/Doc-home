import type { NextConfig } from 'next';

const apiInternalUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';

const nextConfig: NextConfig = {
  agentRules: false,
  // Keep browser requests same-origin while NestJS owns API validation and storage.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiInternalUrl}/:path*` }];
  },
};

export default nextConfig;
