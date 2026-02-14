import { runVendorScrapeJob } from "@/lib/scraping/worker";
import { sql } from "@/lib/db/client";

async function main(): Promise<void> {
  const result = await runVendorScrapeJob({
    runMode: "manual",
    scrapeMode: "safe",
    triggeredBy: "local_script"
  });

  console.log(JSON.stringify(result, null, 2));
}

async function shutdown(): Promise<void> {
  await sql.end({ timeout: 5 }).catch(() => {});
}

main()
  .then(async () => {
    await shutdown();
  })
  .catch(async (error) => {
    console.error(error);
    await shutdown();
    process.exit(1);
  });
