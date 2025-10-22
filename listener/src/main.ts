import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';

export interface ServerInstance {
  app: express.Application;
  server: any;
  wss: WebSocketServer;
  getActiveConnection: () => WebSocket | null;
  setActiveConnection: (connection: WebSocket | null) => void;
}

export function createTunnelServer(): ServerInstance {
  // Create Express app
  const app = express();
  app.use(express.json());
  app.use(express.raw({ type: '*/*', limit: '10mb' }));

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
    path: '/accept'
  });

  // Handle WebSocket connections on /accept
  wss.on('connection', (ws: WebSocket) => {
    console.log('WebSocket connection established');
    activeConnection = ws;

    ws.on('close', () => {
      console.log('WebSocket connection closed');
      activeConnection = null;
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      activeConnection = null;
    });

    // Send confirmation that connection is ready
    ws.send(JSON.stringify({ type: 'connected' }));
  });

  // Define a route handler for the default home page
  app.get('/', (_req: Request, res: Response) => {
    res.status(200).json({message: 'Hello, World!'});
  });

  // Proxy route - forwards requests through WebSocket
  app.all(/^\/proxy(.*)$/, (req: Request, res: Response) => {
    if (!activeConnection || activeConnection.readyState !== WebSocket.OPEN) {
      return res.status(503).json({ error: 'No active tunnel connection' });
    }

    const targetPath = req.params[0] || '/';
    const requestData = {
      type: 'http_request',
      method: req.method,
      path: targetPath,
      headers: req.headers,
      body: req.body,
      query: req.query
    };

    // Send request through WebSocket
    activeConnection.send(JSON.stringify(requestData));

    // Listen for response
    const responseHandler = (data: Buffer) => {
      try {
        const response = JSON.parse(data.toString());
        if (response.type === 'http_response') {
          res.status(response.status || 200)
             .set(response.headers || {})
             .send(response.body);
          activeConnection?.removeListener('message', responseHandler);
        }
      } catch (error) {
        res.status(500).json({ error: 'Invalid response from tunnel' });
        activeConnection?.removeListener('message', responseHandler);
      }
    };

    activeConnection.once('message', responseHandler);

    // Timeout after 30 seconds
    setTimeout(() => {
      activeConnection?.removeListener('message', responseHandler);
      if (!res.headersSent) {
        res.status(504).json({ error: 'Tunnel response timeout' });
      }
    }, 30000);
  });

  return {
    app,
    server,
    wss,
    getActiveConnection,
    setActiveConnection
  };
}