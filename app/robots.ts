import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/workspace", "/account", "/api/"],
    },
    sitemap: `${process.env.APP_URL || "https://fairstage.vercel.app"}/sitemap.xml`,
  };
}
