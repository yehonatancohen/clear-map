import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/oref-history",
        destination:
          "https://alerts-history.oref.org.il//Shared/Ajax/GetAlarmsHistory.aspx",
      },
    ];
  },
};

export default nextConfig;
