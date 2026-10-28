import type { NextConfig } from "next";

// MOBILE_BUILD=1 → static export (out/) — GitHub Actions ka Capacitor APK build
// isi se banata hai. Web preview/production me standalone server rahta hai.
const isMobileBuild = process.env.MOBILE_BUILD === "1";

const nextConfig: NextConfig = {
  output: isMobileBuild ? "export" : "standalone",
  images: { unoptimized: isMobileBuild },
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
