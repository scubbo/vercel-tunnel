import WebSocket from "ws";
import http from "http";
import https from "https";
import { URL } from "url";
import crypto from "crypto";

export interface TunnelInstance {
  close: () => void;
}

interface HttpRequest {
  type: "http_request";
  method: string;
  path: string;
  headers: Record<string, string | string[]>;
  body: any;
  query: Record<string, string | string[]>;
}

interface HttpResponse {
  type: "http_response";
  status: number;
  headers: Record<string, string | string[]>;
  body: any;
}

export function createTunnel(
  targetHostname: string,
  tunnelUrl: string,
  secret: string,
): TunnelInstance {
  // Parse target hostname to extract protocol, host, and port
  const targetUrl = targetHostname.startsWith("http")
    ? targetHostname
    : `http://${targetHostname}`;
  const parsedTarget = new URL(targetUrl);

  // Use the provided tunnel URL directly (should already include /accept)
  const wsUrl = new URL(tunnelUrl);

  // Add authentication
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto
    .createHmac("sha256", secret)
    .update(timestamp.toString())
    .digest("hex");

  wsUrl.searchParams.set("timestamp", timestamp.toString());
  wsUrl.searchParams.set("signature", signature);

  console.log(`Connecting to tunnel listener at: ${wsUrl.toString()}`);

  // Create WebSocket connection
  const ws = new WebSocket(wsUrl.toString());

  ws.on("open", () => {
    console.log("✅ Connected to tunnel listener");
  });

  ws.on("message", (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString());

      if (message.type === "connected") {
        console.log("🔗 Tunnel connection established");
        return;
      }

      if (message.type === "http_request") {
        handleHttpRequest(message as HttpRequest, parsedTarget, ws);
        return;
      }

      console.log("⚠️  Unknown message type:", message.type);
    } catch (error) {
      console.error("❌ Error parsing WebSocket message:", error);
    }
  });

  ws.on("close", (code, reason) => {
    console.log(`🔌 WebSocket connection closed: ${code} ${reason.toString()}`);
  });

  ws.on("error", (error) => {
    console.error("❌ WebSocket error:", error);
  });

  return {
    close: () => {
      ws.close();
    },
  };
}

function handleHttpRequest(
  request: HttpRequest,
  target: URL,
  ws: WebSocket,
): void {
  console.log(`📨 ${request.method} ${request.path}`);

  // Build the full target URL
  const targetUrl = new URL(request.path, target);

  // Add query parameters
  if (request.query && Object.keys(request.query).length > 0) {
    Object.entries(request.query).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach((v) => targetUrl.searchParams.append(key, v));
      } else {
        targetUrl.searchParams.set(key, value);
      }
    });
  }

  // Choose HTTP or HTTPS module based on target protocol
  const httpModule = target.protocol === "https:" ? https : http;

  // Prepare request options
  const options: http.RequestOptions = {
    hostname: target.hostname,
    port: target.port || (target.protocol === "https:" ? 443 : 80),
    path: targetUrl.pathname + targetUrl.search,
    method: request.method,
    headers: request.headers,
  };

  // Create the request
  const req = httpModule.request(options, (res) => {
    // Collect response data
    const responseChunks: Buffer[] = [];

    res.on("data", (chunk) => {
      responseChunks.push(chunk);
    });

    res.on("end", () => {
      const responseBody = Buffer.concat(responseChunks);

      // Determine if response is binary or text
      let body: any;
      const contentType = res.headers["content-type"] || "";

      if (contentType.includes("application/json")) {
        try {
          body = JSON.parse(responseBody.toString());
        } catch {
          body = responseBody.toString();
        }
      } else if (
        contentType.startsWith("text/") ||
        contentType.includes("html")
      ) {
        body = responseBody.toString();
      } else {
        // For binary data, convert to base64
        body = responseBody.toString("base64");
      }

      // Filter out undefined values from headers
      const cleanHeaders: Record<string, string | string[]> = {};
      Object.entries(res.headers).forEach(([key, value]) => {
        if (value !== undefined) {
          cleanHeaders[key] = value;
        }
      });

      const response: HttpResponse = {
        type: "http_response",
        status: res.statusCode || 200,
        headers: cleanHeaders,
        body: body,
      };

      // Send response back through WebSocket
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(response));
        console.log(`📤 ${res.statusCode} ${request.method} ${request.path}`);
      }
    });
  });

  // Handle request errors
  req.on("error", (error) => {
    console.error(
      `❌ Request error for ${request.method} ${request.path}:`,
      error.message,
    );

    const errorResponse: HttpResponse = {
      type: "http_response",
      status: 502,
      headers: { "content-type": "application/json" },
      body: { error: "Bad Gateway", message: error.message },
    };

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(errorResponse));
    }
  });

  // Send request body if present
  if (request.body) {
    if (typeof request.body === "string") {
      req.write(request.body);
    } else if (Buffer.isBuffer(request.body)) {
      req.write(request.body);
    } else {
      req.write(JSON.stringify(request.body));
    }
  }

  req.end();
}
