import type { MetadataRoute } from "next";

import { getCategorySummaries, getCompoundSelectorOptions, listVendorSlugOptions } from "@/lib/db/queries";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const [compounds, categories, vendors] = await Promise.all([
    getCompoundSelectorOptions(),
    getCategorySummaries(),
    listVendorSlugOptions()
  ]);

  const entries: MetadataRoute.Sitemap = [
    {
      url: `${base}/`,
      changeFrequency: "hourly",
      priority: 1
    },
    {
      url: `${base}/categories`,
      changeFrequency: "hourly",
      priority: 0.8
    }
  ];

  for (const category of categories) {
    entries.push({
      url: `${base}/categories/${category.slug}`,
      changeFrequency: "hourly",
      priority: 0.7
    });
  }

  for (const compound of compounds) {
    entries.push({
      url: `${base}/peptides/${compound.slug}`,
      changeFrequency: "hourly",
      priority: 0.8
    });
  }

  for (const vendor of vendors) {
    entries.push({
      url: `${base}/vendors/${vendor.slug}`,
      changeFrequency: "hourly",
      priority: 0.6
    });
  }

  return entries;
}
