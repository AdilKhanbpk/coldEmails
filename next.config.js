/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Type checking is done separately to avoid OOM during build with heavy packages.
    ignoreBuildErrors: true,
  },
  images: { unoptimized: true },
  experimental: {
    serverComponentsExternalPackages: ['googleapis', '@microsoft/microsoft-graph-client', 'nodemailer', 'openai'],
  },
};

module.exports = nextConfig;
