import { createTunnel } from "./tunnel";
import WebSocket from "ws";
import { URL } from "url";

// Mock the WebSocket module
jest.mock("ws");

describe("Tunnel Authentication", () => {
  let mockWebSocket: any;

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    // Create a mock WebSocket instance
    mockWebSocket = {
      on: jest.fn(),
      close: jest.fn(),
      send: jest.fn(),
      readyState: WebSocket.OPEN,
    };

    // Mock the WebSocket constructor
    (WebSocket as unknown as jest.Mock).mockImplementation(() => mockWebSocket);
  });

  test("should append timestamp and signature to WebSocket URL", () => {
    const targetHostname = "localhost:8080";
    const tunnelUrl = "wss://example.com/accept";
    const secret = "test-secret-key";

    // Freeze time for consistent testing
    const mockTimestamp = 1234567890;
    jest.spyOn(Date, "now").mockReturnValue(mockTimestamp * 1000);

    createTunnel(targetHostname, tunnelUrl, secret);

    // Verify WebSocket was called
    expect(WebSocket).toHaveBeenCalledTimes(1);

    // Get the URL that was passed to WebSocket constructor
    const calledUrl = (WebSocket as unknown as jest.Mock).mock.calls[0][0];
    const parsedUrl = new URL(calledUrl);

    // Verify timestamp is present
    expect(parsedUrl.searchParams.get("timestamp")).toBe(
      mockTimestamp.toString(),
    );

    // Verify signature is present and is 64 hex characters
    const signature = parsedUrl.searchParams.get("signature");
    expect(signature).toBeTruthy();
    expect(signature).toMatch(/^[a-f0-9]{64}$/);

    // Verify the signature is correctly computed
    const crypto = require("crypto");
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(mockTimestamp.toString())
      .digest("hex");
    expect(signature).toBe(expectedSignature);
  });

  test("should generate different signatures for different secrets", () => {
    const targetHostname = "localhost:8080";
    const tunnelUrl = "wss://example.com/accept";
    const mockTimestamp = 1234567890;
    jest.spyOn(Date, "now").mockReturnValue(mockTimestamp * 1000);

    // Create tunnel with first secret
    const secret1 = "secret1";
    createTunnel(targetHostname, tunnelUrl, secret1);
    const url1 = (WebSocket as unknown as jest.Mock).mock.calls[0][0];
    const sig1 = new URL(url1).searchParams.get("signature");

    // Reset mock
    jest.clearAllMocks();
    (WebSocket as unknown as jest.Mock).mockImplementation(() => mockWebSocket);

    // Create tunnel with second secret
    const secret2 = "secret2";
    createTunnel(targetHostname, tunnelUrl, secret2);
    const url2 = (WebSocket as unknown as jest.Mock).mock.calls[0][0];
    const sig2 = new URL(url2).searchParams.get("signature");

    // Signatures should be different
    expect(sig1).not.toBe(sig2);
  });

  test("should generate different signatures for different timestamps", () => {
    const targetHostname = "localhost:8080";
    const tunnelUrl = "wss://example.com/accept";
    const secret = "test-secret";

    // First timestamp
    const timestamp1 = 1000000000;
    jest.spyOn(Date, "now").mockReturnValue(timestamp1 * 1000);
    createTunnel(targetHostname, tunnelUrl, secret);
    const url1 = (WebSocket as unknown as jest.Mock).mock.calls[0][0];
    const sig1 = new URL(url1).searchParams.get("signature");

    // Reset mock
    jest.clearAllMocks();
    (WebSocket as unknown as jest.Mock).mockImplementation(() => mockWebSocket);

    // Second timestamp
    const timestamp2 = 1000000001;
    jest.spyOn(Date, "now").mockReturnValue(timestamp2 * 1000);
    createTunnel(targetHostname, tunnelUrl, secret);
    const url2 = (WebSocket as unknown as jest.Mock).mock.calls[0][0];
    const sig2 = new URL(url2).searchParams.get("signature");

    // Signatures should be different
    expect(sig1).not.toBe(sig2);
  });

  test("should preserve original URL path and query parameters", () => {
    const targetHostname = "localhost:8080";
    const tunnelUrl = "wss://example.com/accept?existing=param";
    const secret = "test-secret";

    createTunnel(targetHostname, tunnelUrl, secret);

    const calledUrl = (WebSocket as unknown as jest.Mock).mock.calls[0][0];
    const parsedUrl = new URL(calledUrl);

    // Verify original path is preserved
    expect(parsedUrl.pathname).toBe("/accept");

    // Verify existing query param is preserved
    expect(parsedUrl.searchParams.get("existing")).toBe("param");

    // Verify auth params are added
    expect(parsedUrl.searchParams.get("timestamp")).toBeTruthy();
    expect(parsedUrl.searchParams.get("signature")).toBeTruthy();
  });

  test("should return TunnelInstance with close method", () => {
    const targetHostname = "localhost:8080";
    const tunnelUrl = "wss://example.com/accept";
    const secret = "test-secret";

    const tunnel = createTunnel(targetHostname, tunnelUrl, secret);

    // Verify the tunnel instance has a close method
    expect(tunnel).toHaveProperty("close");
    expect(typeof tunnel.close).toBe("function");

    // Verify close method calls WebSocket close
    tunnel.close();
    expect(mockWebSocket.close).toHaveBeenCalledTimes(1);
  });
});
