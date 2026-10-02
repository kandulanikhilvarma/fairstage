import type { MetadataRoute } from "next";
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    "",
    "/how-it-works",
    "/pricing",
    "/jobs",
    "/open",
    "/policy",
    "/privacy",
  ].map((path) => ({
    url: `${process.env.APP_URL || "https://fairstage.vercel.app"}${path}`,
    changeFrequency: "monthly",
    priority: path ? 0.6 : 1,
  }));
}
