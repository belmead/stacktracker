import { runVendorScrapeJob } from "@/lib/scraping/worker";

async function main(): Promise<void> {
  const result = await runVendorScrapeJob({
    runMode: "manual",
    scrapeMode: "safe",
    triggeredBy: "local_script"
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
