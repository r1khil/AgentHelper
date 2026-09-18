import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["exceljs", "yahoo-finance2", "postgres", "unpdf", "mammoth"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default config;
