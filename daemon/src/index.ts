#!/usr/bin/env node

import { createTunnel } from "./tunnel.js";

function printUsage() {
  console.log("Usage: vercel-tunnel <target-hostname> <tunnel-url>");
  console.log("");
  console.log("Arguments:");
  console.log(
    "  target-hostname  The hostname to forward requests to (e.g., localhost:3000)",
  );
  console.log(
    "  tunnel-url      The WebSocket tunnel listener URL (e.g., wss://db-aefasef82g0s7.vercel.run/accept)",
  );
  console.log("");
  console.log("Example:");
  console.log("  vercel-tunnel localhost:8080 ws://localhost:3000");
}

function main() {
  const args = process.argv.slice(2);

  if (args.length !== 2) {
    printUsage();
    process.exit(1);
  }

  const [targetHostname, tunnelUrl] = args;

  if (!targetHostname || !tunnelUrl) {
    printUsage();
    process.exit(1);
  }

  // Validate tunnel URL format
  try {
    new URL(tunnelUrl);
  } catch (error) {
    console.error(`Error: Invalid tunnel URL format: ${tunnelUrl}`);
    process.exit(1);
  }

  console.log(`Starting tunnel:`);
  console.log(`  Target: ${targetHostname}`);
  console.log(`  Tunnel: ${tunnelUrl}`);
  console.log("");

  // Create and start the tunnel
  const tunnel = createTunnel(targetHostname, tunnelUrl);

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    console.log("\nShutting down tunnel...");
    tunnel.close();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log("\nShutting down tunnel...");
    tunnel.close();
    process.exit(0);
  });
}

main();
