#!/usr/bin/env node --experimental-strip-types --env-file .env.local
import ms from "ms";
import { Sandbox } from "@vercel/sandbox";
import { setTimeout } from "timers/promises";
import { spawn } from "child_process";
import { createTunnel } from "./daemon/src/tunnel.ts";

async function main() {
  const args = process.argv.slice(2);

  if (args.length !== 1) {
    console.log("Usage: vgrok <port>");
    console.log("");
    console.log("Arguments:");
    console.log("  port  The local port to forward to the tunnel (e.g., 8080)");
    process.exit(1);
  }

  const [port] = args;

  if (!port || isNaN(Number(port))) {
    console.error("❌ Error: Port must be a valid number");
    process.exit(1);
  }
  const sandbox = await Sandbox.create({
    source: {
      url: "https://github.com/scubbo/vercel-tunnel.git",
      type: "git",
    },
    // Must be >=2 - IDK why!
    resources: { vcpus: 2 },
    // Unfortunately, Sandboxes cannot run indefinitely.
    //
    // If we wanted indefinite execution, we could have a proxy layer above the listener to:
    // * initialize Sandboxes when the previous one exits (or - depending on latency requirements - just init on-demand)
    // * route to the active Sandbox
    timeout: ms("2m"),
    ports: [3000],
    runtime: "node22",
  });

  console.log(`📦 Installing dependencies...`);
  const install = await sandbox.runCommand({
    cmd: "pnpm",
    args: ["-F", "vercel-tunnel-listener", "install", "--loglevel", "info"],
    stderr: process.stderr,
    stdout: process.stdout,
  });

  if (install.exitCode != 0) {
    console.log("❌ Installing packages failed");
    process.exit(1);
  }

  console.log(`🚀 Starting the server...`);
  await sandbox.runCommand({
    cmd: "pnpm",
    args: ["dev:listener"],
    stderr: process.stderr,
    stdout: process.stdout,
    detached: true,
  });

  const sandboxDomain = sandbox.domain(3000);
  console.log(`✅ Server started at ${sandboxDomain}`);

  const tunnelUrl = sandboxDomain.replace("https://", "wss://") + "/accept";
  const targetHostname = `localhost:${port}`;

  console.log(
    `🔗 Starting daemon to connect ${targetHostname} to ${tunnelUrl}...`,
  );
  // Server takes a while to actually be ready - and I'd rather avoid error messages while demoing
  await setTimeout(3000);

  createTunnel(targetHostname, tunnelUrl);
}

main().catch(console.error);
