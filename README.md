# vercel-tunnel

## Authentication

Vercel Tunnel uses HMAC-SHA256 authentication to secure WebSocket connections. Both the daemon and listener must be configured with a shared secret.

**See [docs/AUTH.md](docs/AUTH.md) for complete authentication documentation.**

Quick start:
- **Listener**: Set `TUNNEL_SECRET` environment variable (required)
- **Daemon**: Provide secret via `--secret` flag, `TUNNEL_SECRET` env var, or config file

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
# Set authentication secret (required)
$ export TUNNEL_SECRET="your-strong-secret-here"

# Must use node>=22.18
$ node --env-file .env.local --experimental-strip-types ./deploy.ts
[...]
# Your url will have a different address!
Server started at https://sb-shovdhxwg50o.vercel.run
✅ Server is running on http://0.0.0.0:3000
✅ WebSocket endpoint available at ws://0.0.0.0:3000/accept
🔒 Authentication enabled
```

### Run Daemon

The Daemon is the component that runs on your local machine (Kubernetes cluster, etc.) which:
* Connects out to the listener to form a persistent connection
* Forwards incoming requests to the Origin server

Assuming your Origin server is running on port 8080, and noting that `sb-shovdhxwg50o.vercel.run` is copied from the output above (i.e. you should use your own value), you can start the Daemon with:

```bash
# Use the same secret as the listener
$ export TUNNEL_SECRET="your-strong-secret-here"
$ pnpm dev:daemon localhost:8080 wss://sb-shovdhxwg50o.vercel.run/accept

# Or provide secret via CLI flag:
$ pnpm dev:daemon localhost:8080 wss://sb-shovdhxwg50o.vercel.run/accept --secret "your-strong-secret-here"

[...]
Starting tunnel:
  Target: localhost:8080
  Tunnel: wss://sb-shovdhxwg50o.vercel.run/accept
  🔒 Authentication: enabled

Connecting to tunnel listener at: wss://sb-shovdhxwg50o.vercel.run/accept?timestamp=...&signature=...
✅ Connected to tunnel listener
🔗 Tunnel connection established
```

### Use it!

In your browser, go to `https://sb-shovdhxwg50o.vercel.run/` and you should see the contents of your Origin server. All paths are proxied directly (e.g., `https://sb-shovdhxwg50o.vercel.run/api/users` forwards to your origin's `/api/users`).
