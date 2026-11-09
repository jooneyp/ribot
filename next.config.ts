import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the Next.js dev badge: the app and /deck are screen-recorded for the demo video.
  devIndicators: false,
  // The dev server is shared through a Cloudflare quick tunnel during the build day.
  allowedDevOrigins: ["*.trycloudflare.com"],
};

export default nextConfig;
