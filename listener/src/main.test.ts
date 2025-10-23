import request from "supertest";
import { WebSocket } from "ws";
import { createTunnelServer, ServerInstance } from "./main";
import crypto from "crypto";

function generateHmacSignature(secret: string, timestamp: number): string {
  return crypto
    .createHmac("sha256", secret)
    .update(timestamp.toString())
    .digest("hex");
}

describe("WebSocket Tunnel Server", () => {
  let serverInstance: ServerInstance;
  let port: number;
  const testSecret = "test-secret-key";

  beforeEach((done) => {
    // Create the tunnel server with a secret
    serverInstance = createTunnelServer(testSecret);

    // Start the server on a random port
    serverInstance.server.listen(0, () => {
      port = serverInstance.server.address().port;
      done();
    });
  });

  afterEach((done) => {
    const connection = serverInstance.getActiveConnection();
    if (connection) {
      connection.close();
    }
    serverInstance.server.close(() => {
      done();
    });
  });

  test("should proxy request through WebSocket tunnel", (done) => {
    // Create WebSocket client that connects to /accept with authentication
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = generateHmacSignature(testSecret, timestamp);
    const client = new WebSocket(
      `ws://localhost:${port}/accept?timestamp=${timestamp}&signature=${signature}`,
    );

    client.on("open", () => {
      console.log("Client connected to WebSocket");
    });

    client.on("message", (data) => {
      const message = JSON.parse(data.toString());

      if (message.type === "connected") {
        console.log("Client received connected confirmation");

        // Make HTTP request to /proxy/test
        request(serverInstance.app)
          .get("/test/path")
          .expect((res) => {
            // The response should come from our mock client
            expect(res.status).toBe(200);
            expect(res.body).toEqual({ message: "Hello from tunnel!" });
          })
          .end((err) => {
            if (err) {
              done(err);
            } else {
              done();
            }
          });
      } else if (message.type === "http_request") {
        console.log("Client received HTTP request:", message);

        // Verify the request details
        expect(message.method).toBe("GET");
        expect(message.path).toBe("/test/path");
        expect(message.headers).toBeDefined();

        // Send mock response back through WebSocket
        const response = {
          type: "http_response",
          status: 200,
          headers: { "content-type": "application/json" },
          body: { message: "Hello from tunnel!" },
        };

        client.send(JSON.stringify(response));
      }
    });

    client.on("error", (error) => {
      done(error);
    });
  }, 10000); // 10 second timeout

  test("should return 503 when no WebSocket connection is active", (done) => {
    // Make request without establishing WebSocket connection
    request(serverInstance.app)
      .get("/proxy/test")
      .expect(503)
      .expect((res) => {
        expect(res.body).toEqual({ error: "No active tunnel connection" });
      })
      .end(done);
  });

  test("should handle WebSocket connection and disconnection", (done) => {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = generateHmacSignature(testSecret, timestamp);
    const client = new WebSocket(
      `ws://localhost:${port}/accept?timestamp=${timestamp}&signature=${signature}`,
    );

    client.on("open", () => {
      // Verify connection is active
      expect(serverInstance.getActiveConnection()).toBeTruthy();

      client.close();
    });

    client.on("close", () => {
      // Verify connection is cleaned up
      setTimeout(() => {
        expect(serverInstance.getActiveConnection()).toBeNull();
        done();
      }, 100);
    });
  });

  describe("Authentication", () => {
    test("should reject connection when no auth provided", (done) => {
      const client = new WebSocket(`ws://localhost:${port}/accept`);
      let receivedOpen = false;

      client.on("open", () => {
        receivedOpen = true;
      });

      client.on("close", (code) => {
        // Server should close immediately with policy violation
        expect(code).toBe(1008); // Policy violation
        // Connection should not be set as active
        expect(serverInstance.getActiveConnection()).toBeFalsy();
        done();
      });

      client.on("error", () => {
        // Error might occur, that's fine
      });
    }, 5000);

    test("should reject connection with invalid signature", (done) => {
      const timestamp = Math.floor(Date.now() / 1000);
      const invalidSignature = "invalid-signature-here";
      const client = new WebSocket(
        `ws://localhost:${port}/accept?timestamp=${timestamp}&signature=${invalidSignature}`,
      );

      client.on("open", () => {
        // Open might fire but connection should close immediately
      });

      client.on("close", (code) => {
        expect(code).toBe(1008); // Policy violation
        // Connection should not be set as active
        expect(serverInstance.getActiveConnection()).toBeFalsy();
        done();
      });

      client.on("error", () => {
        // Error might occur, that's fine
      });
    }, 5000);

    test("should reject connection with stale timestamp", (done) => {
      // Timestamp from 60 seconds ago (outside the 30-second window)
      const staleTimestamp = Math.floor(Date.now() / 1000) - 60;
      const signature = generateHmacSignature(testSecret, staleTimestamp);
      const client = new WebSocket(
        `ws://localhost:${port}/accept?timestamp=${staleTimestamp}&signature=${signature}`,
      );

      client.on("open", () => {
        // Open might fire but connection should close immediately
      });

      client.on("close", (code) => {
        expect(code).toBe(1008); // Policy violation
        // Connection should not be set as active
        expect(serverInstance.getActiveConnection()).toBeFalsy();
        done();
      });

      client.on("error", () => {
        // Error might occur, that's fine
      });
    }, 5000);

    test("should accept connection with valid HMAC signature", (done) => {
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = generateHmacSignature(testSecret, timestamp);
      const client = new WebSocket(
        `ws://localhost:${port}/accept?timestamp=${timestamp}&signature=${signature}`,
      );

      client.on("open", () => {
        // Connection accepted
        expect(serverInstance.getActiveConnection()).toBeTruthy();
        client.close();
        done();
      });

      client.on("error", (error) => {
        done(error);
      });
    }, 5000);
  });
});
