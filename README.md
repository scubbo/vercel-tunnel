# vercel-tunnel

## Usage

### Setup

```bash
# If you don't already have the Vercel CLI installed
npm install -g vercel
# TK - link to a
```

### Run Listener

The listener is the component that runs in Vercel's network, accepting connections from the wider Internet and forwarding them to the local daemon.

```bash
# Must use node>=22.18
$ node --env-file .env.local --experimental-strip-types ./deploy.ts
[...]
# Your url will have a different address!
Server started at https://sb-shovdhxwg50o.vercel.run
Server is running on http://0.0.0.0:3000
WebSocket endpoint available at ws://0.0.0.0:3000/accept
```

### Run Daemon

The Daemon is the component that runs on your local machine (Kubernetes cluster, etc.) which:
* Connects out to the daemon to form a persistent connections
* Forwards incoming requests to the Origin server

Assuming your Origin server is running on port 8080, and noting I copied `sb-shovdhxwg50o.vercel.run` from the output above, you can start the Daemon with:

```bash
$ pnpm dev:daemon localhost:8080 wss://sb-shovdhxwg50o.vercel.run/accept
[...]
Starting tunnel:
  Target: localhost:8080
  Tunnel: wss://sb-shovdhxwg50o.vercel.run/accept

Connecting to tunnel listener at: wss://sb-shovdhxwg50o.vercel.run/accept
✅ Connected to tunnel listener
🔗 Tunnel connection established
```

### Use it!

In your browser, go tohttps://sb-shovdhxwg50o.vercel.run/proxy` and you should see the contents of your Origin server.
