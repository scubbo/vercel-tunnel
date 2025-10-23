# Authentication

This document describes the authentication mechanism used to secure WebSocket tunnel connections between the daemon and listener.

## Overview

Vercel Tunnel uses **HMAC-SHA256 challenge-response authentication** to ensure only trusted daemons can connect to the listener. Both the daemon and listener must be configured with the same shared secret.

## How It Works

### Authentication Flow

1. **Daemon** generates a timestamp (Unix epoch in seconds)
2. **Daemon** computes an HMAC-SHA256 signature: `HMAC(secret, timestamp)`
3. **Daemon** connects to listener with: `wss://host/accept?timestamp=X&signature=Y`
4. **Listener** validates:
   - Timestamp is present
   - Signature is present
   - Timestamp is within 30 seconds of current time (prevents replay attacks)
   - Signature matches expected value: `HMAC(secret, timestamp)`
5. If validation passes, connection is established
6. If validation fails, connection is closed with code 1008 (Policy Violation)

### Security Properties

- **Shared secret never transmitted**: Only the HMAC signature is sent over the wire
- **Replay protection**: 30-second timestamp window prevents old signatures from being reused
- **Tamper-proof**: Any modification to the timestamp invalidates the signature
- **WSS encryption**: All traffic should use `wss://` (WebSocket Secure) for encryption in transit

## Configuration

### Listener Configuration

The listener **requires** a secret to start. Set the `TUNNEL_SECRET` environment variable:

```bash
export TUNNEL_SECRET="your-shared-secret-here"
pnpm dev:listener
```

If `TUNNEL_SECRET` is not set, the listener will refuse to start with an error.

### Daemon Configuration

The daemon **requires** a secret to start. It supports three ways to provide the secret, with the following precedence:

1. **CLI flag** (highest precedence)
2. **Environment variable**
3. **Config file** (lowest precedence)

#### Option 1: CLI Flag

```bash
pnpm dev:daemon localhost:8080 wss://example.com/accept --secret "your-shared-secret-here"
```

#### Option 2: Environment Variable

```bash
export TUNNEL_SECRET="your-shared-secret-here"
pnpm dev:daemon localhost:8080 wss://example.com/accept
```

#### Option 3: Config File

Create a `.vercel-tunnel-config.json` file in either:
- Current working directory (checked first)
- Home directory (`~/.vercel-tunnel-config.json`)

Config file format:
```json
{
  "secret": "your-shared-secret-here"
}
```

Then run:
```bash
pnpm dev:daemon localhost:8080 wss://example.com/accept
```

### Secret Requirements

- Secrets should be **strong and random** (at least 32 characters recommended)
- Use a password manager or secure random generator
- Never commit secrets to version control
- Rotate secrets periodically for production use

Example of generating a strong secret:
```bash
# Using OpenSSL
openssl rand -hex 32

# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Troubleshooting

### Connection Rejected with 1008 (Policy Violation)

**Cause**: Authentication failed.

**Solutions**:
- Verify the secret matches on both daemon and listener
- Check the listener logs for specific error reason:
  - `Missing timestamp or signature` - Daemon not sending auth credentials
  - `Invalid signature` - Secrets don't match
  - `Timestamp outside 30s window` - Clock skew between machines

### "Authentication: disabled" Warning

**Cause**: Daemon couldn't find a secret (no flag, no env var, no config file).

**Solution**: Provide the secret using one of the three methods above.

### Clock Skew Issues

If you see "Timestamp outside 30s window" errors but secrets match:
- Ensure both machines have synchronized clocks (use NTP)
- Check system time with `date` command
- Verify timezone settings are correct

## Security Best Practices

1. **Always use WSS** (`wss://`) not WS (`ws://`) for production
2. **Keep secrets secret**: Don't log them, don't commit them
3. **Use strong secrets**: At least 32 random characters
4. **Rotate secrets**: Change them periodically
5. **Monitor auth failures**: Check listener logs for repeated auth failures

## Technical Details

### HMAC-SHA256 Algorithm

```javascript
import crypto from 'crypto';

const timestamp = Math.floor(Date.now() / 1000);
const signature = crypto
  .createHmac('sha256', secret)
  .update(timestamp.toString())
  .digest('hex');
```

### Timestamp Window

The listener accepts timestamps within **±30 seconds** of current server time. This provides:
- Protection against replay attacks
- Tolerance for minor clock skew between machines
- Balance between security and usability

### WebSocket Close Codes

- `1008` (Policy Violation): Authentication failed
- `1000` (Normal Closure): Clean shutdown
- `1006` (Abnormal Closure): Connection lost unexpectedly

## Testing Authentication

To test authentication locally:

1. Start listener with secret:
```bash
cd listener
TUNNEL_SECRET="test-secret-123" npm run dev
```

2. Start daemon with matching secret:
```bash
cd daemon
npm run build
TUNNEL_SECRET="test-secret-123" node dist/index.js localhost:8080 ws://localhost:3000/accept
```

3. Verify connection:
```
✅ WebSocket connection established and authenticated
```

4. Test with wrong secret:
```bash
TUNNEL_SECRET="wrong-secret" node dist/index.js localhost:8080 ws://localhost:3000/accept
```

Should see:
```
❌ Authentication failed: Invalid signature from ::1
```
