/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_ESCROW_ADDRESS_STATUS: process.env.NEXT_PUBLIC_ESCROW_ADDRESS_STATUS || "",
    NEXT_PUBLIC_ARBITER_ADDRESS_STATUS: process.env.NEXT_PUBLIC_ARBITER_ADDRESS_STATUS || "",
    NEXT_PUBLIC_GMX_ADDRESS_ARBITRUM: process.env.NEXT_PUBLIC_GMX_ADDRESS_ARBITRUM || "",
  },
};

module.exports = nextConfig;
