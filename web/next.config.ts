import type { NextConfig } from 'next';

const isTauri = process.env.TAURI_ENV_PLATFORM !== undefined || process.env.TAURI_BUILD === 'true';
const isGithubActions = process.env.GITHUB_ACTIONS === 'true' && !isTauri;
let basePath = process.env.BASE_PATH || process.env.NEXT_PUBLIC_BASE_PATH || '';

if (isGithubActions && !basePath && process.env.GITHUB_REPOSITORY && !isTauri) {
  const repoName = process.env.GITHUB_REPOSITORY.split('/')[1];
  if (repoName && !repoName.endsWith('.github.io')) {
    basePath = `/${repoName}`;
  }
}

const nextConfig: NextConfig = {
  output: 'export',
  basePath: basePath ? basePath : undefined,
  images: {
    unoptimized: true,
  },
  webpack: (config) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
    };
    return config;
  },
};

export default nextConfig;
