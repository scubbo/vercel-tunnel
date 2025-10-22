* Reference _this_ repo rather than `vercel-tunnel-listener`
* Don't require the `/proxy` path
  * Listen for connection initiation on a different port than the WebSocket connection
* Use certs to authenticate the client
* Implement:
  * a proxy to handle incoming requests and route them to the "live" Listener
  * a builder so that fresh Listeners can be started from a built image rather than having to reinstall
