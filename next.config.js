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
  serverExternalPackages: [
    'googleapis',
    '@microsoft/microsoft-graph-client',
    'nodemailer',
    'openai',
  ],
};

const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

module.exports = withBundleAnalyzer(nextConfig);
