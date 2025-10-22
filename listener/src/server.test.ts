import request from 'supertest';
import { WebSocket } from 'ws';
import { createTunnelServer, ServerInstance } from './main';

describe('WebSocket Tunnel Server', () => {
  let serverInstance: ServerInstance;
  let port: number;

  beforeEach((done) => {
    // Create the tunnel server
    serverInstance = createTunnelServer();

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

  test('should proxy request through WebSocket tunnel', (done) => {
    // Create WebSocket client that connects to /accept
    const client = new WebSocket(`ws://localhost:${port}/accept`);

    client.on('open', () => {
      console.log('Client connected to WebSocket');
    });

    client.on('message', (data) => {
      const message = JSON.parse(data.toString());

      if (message.type === 'connected') {
        console.log('Client received connected confirmation');

        // Make HTTP request to /proxy/test
        request(serverInstance.app)
          .get('/proxy/test')
          .expect((res) => {
            // The response should come from our mock client
            expect(res.status).toBe(200);
            expect(res.body).toEqual({ message: 'Hello from tunnel!' });
          })
          .end((err) => {
            if (err) {
              done(err);
            } else {
              done();
            }
          });

      } else if (message.type === 'http_request') {
        console.log('Client received HTTP request:', message);

        // Verify the request details
        expect(message.method).toBe('GET');
        expect(message.path).toBe('/test');
        expect(message.headers).toBeDefined();

        // Send mock response back through WebSocket
        const response = {
          type: 'http_response',
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: { message: 'Hello from tunnel!' }
        };

        client.send(JSON.stringify(response));
      }
    });

    client.on('error', (error) => {
      done(error);
    });
  }, 10000); // 10 second timeout

  test('should return 503 when no WebSocket connection is active', (done) => {
    // Make request without establishing WebSocket connection
    request(serverInstance.app)
      .get('/proxy/test')
      .expect(503)
      .expect((res) => {
        expect(res.body).toEqual({ error: 'No active tunnel connection' });
      })
      .end(done);
  });

  test('should handle WebSocket connection and disconnection', (done) => {
    const client = new WebSocket(`ws://localhost:${port}/accept`);

    client.on('open', () => {
      // Verify connection is active
      expect(serverInstance.getActiveConnection()).toBeTruthy();

      client.close();
    });

    client.on('close', () => {
      // Verify connection is cleaned up
      setTimeout(() => {
        expect(serverInstance.getActiveConnection()).toBeNull();
        done();
      }, 100);
    });
  });
});