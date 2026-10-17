import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Allow devices on the local network (e.g. iPad) to access
  // Next.js development resources.
  allowedDevOrigins: ["192.168.1.53"],

  // The corpus is read from the filesystem at request time by server-only
  // code, so it must be traced into the standalone/serverless output.
  outputFileTracingIncludes: {
    "/api/securerag/**": ["./corpus/**"],
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
    ];
  },
};

export default nextConfig;