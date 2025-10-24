#!/usr/bin/env tsx
import { Sandbox } from "@vercel/sandbox";
import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const args = process.argv.slice(2);

  if (args.length !== 1) {
    console.log("Usage: get-sandbox.ts <sandboxId>");
    console.log("");
    console.log("Arguments:");
    console.log(
      "  sandboxId  The ID of the sandbox to retrieve (e.g., sbx_abc123...)",
    );
    process.exit(1);
  }

  const [sandboxId] = args;

  console.log(`📋 Fetching sandbox ${sandboxId}...\n`);

  try {
    const sandbox = await Sandbox.get({ sandboxId });

    console.log(`🔹 Sandbox ID: ${sandbox.sandboxId}`);
    console.log(
      `   Started at ${new Date(sandbox.sandbox.startedAt).toLocaleString()}`,
    );
    console.log(`   Status: ${sandbox.status}`);
    console.log(`   Timeout: ${sandbox.timeout}ms`);
    console.log("");

    console.log(`📍 Routes:`);
    for (const route of sandbox.routes) {
      console.log(`   Port ${route.port}: ${route.url}`);
    }
    console.log("");

    console.log(`✅ Successfully retrieved sandbox`);
  } catch (error) {
    console.error(
      "❌ Failed to fetch sandbox:",
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  }
}

main().catch(console.error);
