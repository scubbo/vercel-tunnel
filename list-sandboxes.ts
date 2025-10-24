#!/usr/bin/env tsx
import { Sandbox } from "@vercel/sandbox";
import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  console.log("📋 Fetching sandboxes...\n");

  const result = await Sandbox.list({ since: Date.now() - 1000 * 60 * 5 });
  const data = result.json;

  if (!data || !data.sandboxes) {
    console.error("❌ Failed to fetch sandboxes or unexpected response format");
    console.error("Response:", JSON.stringify(result, null, 2));
    process.exit(1);
  }

  console.log(data.sandboxes);

  const activeSandboxes = data.sandboxes.filter(
    // Technically this is a lie, we should search for `=== active` - but it's helpful to know when they're starting up
    (sandbox) => sandbox.status !== "stopped",
  );

  if (activeSandboxes.length === 0) {
    console.log("No active sandboxes found.");
    return;
  }

  console.log(`Found ${activeSandboxes.length} active sandbox(es):\n`);

  for (const sandbox of activeSandboxes) {
    console.log(`🔹 Sandbox ID: ${sandbox.id}`);
    console.log(`   Status: ${sandbox.status}`);
    console.log(`   Runtime: ${sandbox.runtime}`);
    console.log(`   Region: ${sandbox.region}`);
    console.log(`   vCPUs: ${sandbox.vcpus}`);
    console.log(`   Memory: ${sandbox.memory} MB`);
    console.log(`   Timeout: ${sandbox.timeout}ms`);
    console.log(`   Created: ${new Date(sandbox.createdAt).toLocaleString()}`);
    console.log(`   Updated: ${new Date(sandbox.updatedAt).toLocaleString()}`);

    if (sandbox.startedAt) {
      console.log(
        `   Started: ${new Date(sandbox.startedAt).toLocaleString()}`,
      );
    }

    if (sandbox.duration) {
      console.log(`   Duration: ${sandbox.duration}ms`);
    }

    console.log("");
  }

  console.log(`📊 Pagination:`);
  console.log(`   Total count: ${data.pagination.count}`);
  console.log(`   Next page: ${data.pagination.next ?? "none"}`);
  console.log(`   Previous page: ${data.pagination.prev ?? "none"}`);
}

main().catch(console.error);
