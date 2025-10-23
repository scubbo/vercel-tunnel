#!/usr/bin/env node

import { createTunnel } from "./tunnel";
import fs from "fs";
import path from "path";
import os from "os";

function printUsage() {
  console.log("Usage: vercel-tunnel <target-hostname> <tunnel-url> [options]");
  console.log("");
  console.log("Arguments:");
  console.log(
    "  target-hostname  The hostname to forward requests to (e.g., localhost:3000)",
  );
  console.log(
    "  tunnel-url      The WebSocket tunnel listener URL (e.g., wss://example.vercel.app/accept)",
  );
  console.log("");
  console.log("Options:");
  console.log(
    "  --secret <value>  Shared secret for authentication (can also use TUNNEL_SECRET env var or config file)",
  );
  console.log("");
  console.log(
    "Secret precedence: --secret flag > TUNNEL_SECRET env var > config file",
  );
  console.log(
    "Config file locations: .vercel-tunnel-config.json in current directory or home directory",
  );
  console.log("");
  console.log("Example:");
  console.log(
    "  vercel-tunnel localhost:8080 wss://example.com/accept --secret mySecret",
  );
  console.log(
    "  TUNNEL_SECRET=mySecret vercel-tunnel localhost:8080 wss://example.com/accept",
  );
}

function loadSecretFromConfig(): string | null {
  // Check current directory first
  const cwdConfig = path.join(process.cwd(), ".vercel-tunnel-config.json");
  if (fs.existsSync(cwdConfig)) {
    try {
      const config = JSON.parse(fs.readFileSync(cwdConfig, "utf-8"));
      if (config.secret) {
        return config.secret;
      }
    } catch (error) {
      console.warn(`Warning: Failed to read config from ${cwdConfig}`);
    }
  }

  // Check home directory
  const homeConfig = path.join(os.homedir(), ".vercel-tunnel-config.json");
  if (fs.existsSync(homeConfig)) {
    try {
      const config = JSON.parse(fs.readFileSync(homeConfig, "utf-8"));
      if (config.secret) {
        return config.secret;
      }
    } catch (error) {
      console.warn(`Warning: Failed to read config from ${homeConfig}`);
    }
  }

  return null;
}

function parseArgs(args: string[]): {
  targetHostname?: string;
  tunnelUrl?: string;
  secret?: string;
} {
  const result: {
    targetHostname?: string;
    tunnelUrl?: string;
    secret?: string;
  } = {};

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === "--secret") {
      if (i + 1 >= args.length) {
        console.error("Error: --secret requires a value");
        process.exit(1);
      }
      result.secret = args[i + 1];
      i += 2;
    } else if (arg.startsWith("--")) {
      console.error(`Error: Unknown option ${arg}`);
      process.exit(1);
    } else {
      // Positional arguments
      if (!result.targetHostname) {
        result.targetHostname = arg;
      } else if (!result.tunnelUrl) {
        result.tunnelUrl = arg;
      } else {
        console.error(`Error: Unexpected argument ${arg}`);
        process.exit(1);
      }
      i++;
    }
  }

  return result;
}

function main() {
  const parsedArgs = parseArgs(process.argv.slice(2));

  if (!parsedArgs.targetHostname || !parsedArgs.tunnelUrl) {
    printUsage();
    process.exit(1);
  }

  const { targetHostname, tunnelUrl } = parsedArgs;

  // Validate tunnel URL format
  try {
    new URL(tunnelUrl);
  } catch (error) {
    console.error(`Error: Invalid tunnel URL format: ${tunnelUrl}`);
    process.exit(1);
  }

  // Load secret with precedence: CLI > ENV > Config
  let secret: string | undefined = parsedArgs.secret; // CLI flag
  if (!secret) {
    secret = process.env.TUNNEL_SECRET; // Environment variable
  }
  if (!secret) {
    const configSecret = loadSecretFromConfig(); // Config file
    if (configSecret) {
      secret = configSecret;
    }
  }

  // Secret is required
  if (!secret) {
    console.error("❌ Error: TUNNEL_SECRET is required");
    console.error("");
    console.error("Please provide a secret using one of these methods:");
    console.error("  1. CLI flag: --secret <value>");
    console.error("  2. Environment variable: TUNNEL_SECRET=<value>");
    console.error("  3. Config file: .vercel-tunnel-config.json");
    console.error("");
    console.error("See docs/AUTH.md for more information.");
    process.exit(1);
  }

  console.log(`Starting tunnel:`);
  console.log(`  Target: ${targetHostname}`);
  console.log(`  Tunnel: ${tunnelUrl}`);
  console.log(`  🔒 Authentication: enabled`);
  console.log("");

  // Create and start the tunnel
  const tunnel = createTunnel(targetHostname, tunnelUrl, secret);

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

if (require.main === module) {
  main();
}
