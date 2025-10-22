import ms from "ms";
import { Sandbox } from "@vercel/sandbox";
import { setTimeout } from "timers/promises";
import { spawn } from "child_process";

async function main() {
  const sandbox = await Sandbox.create({
    source: {
      // `source` doesn't have a "path" field - so, even if we wanted to use a monorepo, we couldn't.
      url: "https://github.com/scubbo/vercel-tunnel-listener.git",
      type: "git",
    },
    // Must be >=2 - IDK why!
    resources: { vcpus: 2 },
    // Timeout in milliseconds: ms('10m') = 600000
    // Defaults to 5 minutes. The maximum is 5 hours for Pro/Enterprise, and 45 minutes for Hobby.
    timeout: ms("10m"),
    ports: [3000],
    runtime: "node22",
  });

  console.log(`Installing dependencies...`);
  const install = await sandbox.runCommand({
    cmd: "npm",
    args: ["install", "--loglevel", "info"],
    stderr: process.stderr,
    stdout: process.stdout,
  });

  if (install.exitCode != 0) {
    console.log("installing packages failed");
    process.exit(1);
  }

  console.log(`Starting the server...`);
  await sandbox.runCommand({
    cmd: "npm",
    args: ["run", "dev"],
    stderr: process.stderr,
    stdout: process.stdout,
    detached: true,
  });

  await setTimeout(500);
  console.log(`Server started at ${sandbox.domain(3000)}`);
  spawn("open", [sandbox.domain(3000)]);
}

main().catch(console.error);
