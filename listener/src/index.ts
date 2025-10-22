import { createTunnelServer } from './main';

const port = 3000;

// Create the tunnel server
const { server } = createTunnelServer();

// Start the server
server.listen(port, '0.0.0.0', () => {
  console.log(`Server is running on http://0.0.0.0:${port}`);
  console.log(`WebSocket endpoint available at ws://0.0.0.0:${port}/accept`);
});
