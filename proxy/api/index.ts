import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Sandbox } from "@vercel/sandbox";
const ms = require("ms");

let cachedSandboxId: string | null = null;

async function getOrCreateSandbox() {
  // Check if we have a cached sandbox that's still alive
  if (cachedSandboxId) {
    const cachedSandbox = await Sandbox.get({ sandboxId: cachedSandboxId });
    console.log(`Cached sandbox id is ${cachedSandbox.sandboxId}`);
    console.log(`Cached sandbox status is ${cachedSandbox.status}`);
    // Try to verify the sandbox is still responsive
    switch (cachedSandbox.status) {
      case "pending":
        console.log("Sandbox is pending");
        while (true) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          const status = await cachedSandbox.status;
          if (status !== "pending") {
            console.log(`Pending sandbox status changed to ${status}`);
            break; // From the `while` loop
          }
        }
      // Intentionally no `break` here - for once, that is the correct behaviour!
      case "running":
        console.log("Sandbox is running");
        return cachedSandbox;
      case "stopped":
        console.log("Sandbox is stopped");
        break;
      case "stopping":
        console.log("Sandbox is stopping");
        break;
      case "failed":
        console.log("Sandbox is in error state");
        break;
    }
  }

  // Create a new sandbox
  console.log("Creating new sandbox...");
  const sandbox = await Sandbox.create({
    source: {
      url: "https://github.com/scubbo/vercel-tunnel.git",
      type: "git",
    },
    resources: { vcpus: 2 },
    timeout: ms("2m"),
    ports: [3000],
    runtime: "node22",
  });

  console.log("Installing dependencies...");
  const install = await sandbox.runCommand({
    cmd: "pnpm",
    args: ["-F", "vercel-tunnel-listener", "install", "--loglevel", "info"],
  });

  if (install.exitCode !== 0) {
    throw new Error("Failed to install dependencies");
  }

  console.log("Starting the server...");
  await sandbox.runCommand({
    cmd: "pnpm",
    args: ["dev:listener"],
    detached: true,
  });

  cachedSandboxId = sandbox.sandboxId;
  return sandbox;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Drop favicon requests
  if (req.url === "/favicon.ico" || req.url === "/favicon.png") {
    res.status(404).end();
    return;
  }

  try {
    const sandbox = await getOrCreateSandbox();
    const sandboxDomain = sandbox.domain(3000);

    // Build the target URL
    const targetUrl = new URL(req.url || "/", sandboxDomain);

    console.log(`Forwarding ${req.method} ${req.url} to ${targetUrl}`);

    // Forward the request to the sandbox
    const response = await fetch(targetUrl.toString(), {
      method: req.method,
      headers: req.headers as HeadersInit,
      body:
        req.method !== "GET" && req.method !== "HEAD"
          ? JSON.stringify(req.body)
          : undefined,
    });
    console.log(
      `Received response from ${targetUrl}: ${response.status} ${response.statusText}`,
    );

    // Set status first
    res.status(response.status);

    // Skip content-encoding header to avoid double-encoding issues
    // (fetch decodes automatically, so sending with encoding header causes errors)
    const forwardedHeaders: string[] = [];
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() !== "content-encoding") {
        res.setHeader(key, value);
        forwardedHeaders.push(key);
      } else {
        console.log(`Skipping header: ${key}: ${value}`);
      }
    });
    console.log("Headers forwarded to client:", forwardedHeaders.join(", "));

    // Get the response as text (already decoded by fetch)
    const text = await response.text();
    console.log(`Response body length: ${text.length} chars`);
    console.log(`Response body preview: ${text.substring(0, 200)}...`);

    // Check for "no active tunnel connection" error
    if (response.status === 503) {
      try {
        const json = JSON.parse(text);
        if (json["error"] === "No active tunnel connection") {
          console.log("No active tunnel connection");
          res.setHeader("Content-Type", "text/html");
          res.send(
            `Sandbox is up, but no tunnel is connected. Run <pre>pnpm dev:daemon localhost:8080 ${targetUrl.toString().replace("https", "wss")}accept</pre>`,
          );
          return;
        }
      } catch (e) {
        // Not JSON, continue with normal response
      }
    }

    res.send(text);
  } catch (error) {
    console.error("Error forwarding request:", error);
    res.status(502).json({
      error: "Bad Gateway",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
