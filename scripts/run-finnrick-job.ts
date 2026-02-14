import { runFinnrickSyncJob } from "@/lib/jobs/finnrick";
import { sql } from "@/lib/db/client";

async function main(): Promise<void> {
  console.log("[job:finnrick] starting sync...");
  const result = await runFinnrickSyncJob();
  console.log("[job:finnrick] sync complete.");
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
