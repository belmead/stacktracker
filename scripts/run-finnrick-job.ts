import { runFinnrickSyncJob } from "@/lib/jobs/finnrick";

async function main(): Promise<void> {
  const result = await runFinnrickSyncJob();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
