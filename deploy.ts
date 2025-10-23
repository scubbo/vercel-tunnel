#!/usr/bin/env node --experimental-strip-types --env-file .env.local
import ms from "ms";
import { Sandbox } from "@vercel/sandbox";
import { setTimeout } from "timers/promises";
import { spawn } from "child_process";

async function main() {
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
    timeout: ms("10m"),
    ports: [3000],
    runtime: "node22",
  });

  console.log(`Installing dependencies...`);
  const install = await sandbox.runCommand({
    cmd: "pnpm",
    args: ["-F", "vercel-tunnel-listener", "install", "--loglevel", "info"],
    stderr: process.stderr,
    stdout: process.stdout,
  });

  if (install.exitCode != 0) {
    console.log("installing packages failed");
    process.exit(1);
  }

  console.log(`Starting the server...`);
  await sandbox.runCommand({
    cmd: "pnpm",
    args: ["dev:listener"],
    stderr: process.stderr,
    stdout: process.stdout,
    detached: true,
  });

  await setTimeout(500);
  console.log(`Server started at ${sandbox.domain(3000)}`);
  spawn("open", [sandbox.domain(3000)]);
}

main().catch(console.error);
