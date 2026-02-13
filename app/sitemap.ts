import type { MetadataRoute } from "next";

import { getCompoundSelectorOptions } from "@/lib/db/queries";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const compounds = await getCompoundSelectorOptions();

  const entries: MetadataRoute.Sitemap = [
    {
      url: `${base}/`,
      changeFrequency: "hourly",
      priority: 1
    }
  ];

  for (const compound of compounds) {
    entries.push({
      url: `${base}/peptides/${compound.slug}`,
      changeFrequency: "hourly",
      priority: 0.8
    });
  }

  return entries;
}
