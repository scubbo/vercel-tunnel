import { createTunnelServer } from "./main";

const port = 3000;

// Read secret from environment
const secret = process.env.TUNNEL_SECRET;

if (!secret) {
  console.error("❌ Error: TUNNEL_SECRET environment variable is required");
  console.error(
    "Please set TUNNEL_SECRET to a shared secret for authentication",
  );
  process.exit(1);
}

// Create the tunnel server
const { server } = createTunnelServer(secret);

// Start the server
server.listen(port, "0.0.0.0", () => {
  console.log(`✅ Server is running on http://0.0.0.0:${port}`);
  console.log(`✅ WebSocket endpoint available at ws://0.0.0.0:${port}/accept`);
  console.log(`🔒 Authentication enabled`);
});
