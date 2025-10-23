import express, { Request, Response } from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import crypto from "crypto";
import { IncomingMessage } from "http";

export interface ServerInstance {
  app: express.Application;
  server: any;
  wss: WebSocketServer;
  getActiveConnection: () => WebSocket | null;
  setActiveConnection: (connection: WebSocket | null) => void;
}

const TIMESTAMP_WINDOW_SECONDS = 30;

function validateAuthentication(
  req: IncomingMessage,
  secret: string,
): { valid: boolean; reason?: string } {
  const url = new URL(req.url || "", `http://${req.headers.host}`);
  const timestamp = url.searchParams.get("timestamp");
  const signature = url.searchParams.get("signature");

  if (!timestamp || !signature) {
    return { valid: false, reason: "Missing timestamp or signature" };
  }

  // Validate timestamp is within acceptable window
  const currentTime = Math.floor(Date.now() / 1000);
  const requestTime = parseInt(timestamp, 10);

  if (isNaN(requestTime)) {
    return { valid: false, reason: "Invalid timestamp format" };
  }

  const timeDiff = Math.abs(currentTime - requestTime);
  if (timeDiff > TIMESTAMP_WINDOW_SECONDS) {
    return {
      valid: false,
      reason: `Timestamp outside ${TIMESTAMP_WINDOW_SECONDS}s window (diff: ${timeDiff}s)`,
    };
  }

  // Validate HMAC signature
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(timestamp)
    .digest("hex");

  if (signature !== expectedSignature) {
    return { valid: false, reason: "Invalid signature" };
  }

  return { valid: true };
}

export function createTunnelServer(secret: string): ServerInstance {
  // Create Express app
  const app = express();
  app.use(express.json());
  app.use(express.raw({ type: "*/*", limit: "10mb" }));

  // Store the active WebSocket connection
  let activeConnection: WebSocket | null = null;

  const setActiveConnection = (connection: WebSocket | null) => {
    activeConnection = connection;
  };

  const getActiveConnection = () => activeConnection;

  // Create HTTP server
  const server = createServer(app);

  // Create WebSocket server
  const wss = new WebSocketServer({
    server,
    path: "/accept",
  });

  // Handle WebSocket connections on /accept
  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    // Validate authentication
    const authResult = validateAuthentication(req, secret);

    if (!authResult.valid) {
      console.log(
        `❌ Authentication failed: ${authResult.reason} from ${req.socket.remoteAddress}`,
      );
      ws.close(1008, authResult.reason); // 1008 = Policy Violation
      return;
    }

    console.log("✅ WebSocket connection established and authenticated");
    activeConnection = ws;

    ws.on("close", () => {
      console.log("WebSocket connection closed");
      activeConnection = null;
    });

    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
      activeConnection = null;
    });

    // Send confirmation that connection is ready
    ws.send(JSON.stringify({ type: "connected" }));
  });

  // Proxy all requests through WebSocket (except /accept which is handled by WebSocketServer)
  app.use((req: Request, res: Response) => {
    if (!activeConnection || activeConnection.readyState !== WebSocket.OPEN) {
      return res.status(503).json({ error: "No active tunnel connection" });
    }

    const requestData = {
      type: "http_request",
      method: req.method,
      path: req.path,
      headers: req.headers,
      body: req.body,
      query: req.query,
    };

    // Send request through WebSocket
    activeConnection.send(JSON.stringify(requestData));

    // Listen for response
    const responseHandler = (data: Buffer) => {
      try {
        const response = JSON.parse(data.toString());
        if (response.type === "http_response") {
          res
            .status(response.status || 200)
            .set(response.headers || {})
            .send(response.body);
          activeConnection?.removeListener("message", responseHandler);
        }
      } catch (error) {
        res.status(500).json({ error: "Invalid response from tunnel" });
        activeConnection?.removeListener("message", responseHandler);
      }
    };

    activeConnection.once("message", responseHandler);

    // Timeout after 30 seconds
    setTimeout(() => {
      activeConnection?.removeListener("message", responseHandler);
      if (!res.headersSent) {
        res.status(504).json({ error: "Tunnel response timeout" });
      }
    }, 30000);
  });

  return {
    app,
    server,
    wss,
    getActiveConnection,
    setActiveConnection,
  };
}
