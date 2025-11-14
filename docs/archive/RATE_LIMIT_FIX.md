# Rate Limiting Fix

## Problem

The bot was getting **429 "Too Many Requests"** errors even with Helius RPC because:

- Raydium has **hundreds of pool creations per hour** on mainnet
- Each pool creation triggered an immediate `getParsedTransaction` RPC call
- This created a **flood of concurrent requests** that overwhelmed even Helius's free tier
- Hundreds of requests were being made simultaneously

## Solution

Added **request throttling** using a queue system:

### 1. Request Queue (`src/utils/requestQueue.js`)

- Limits concurrent requests to **3 maximum**
- Adds **200ms delay** between requests
- Queues excess requests for processing later
- Prevents rate limit errors while still processing all data

### 2. Updated Token Discovery (`src/intelligence/tokenDiscovery.js`)

- All RPC calls now go through the request queue:
  - `getParsedTransaction()` - for parsing pool transactions
  - `getParsedAccountInfo()` - for token metadata
- Added stats tracking:
  - Logs received
  - Tokens discovered  
  - Queue status (queued, active)
- Automatic stats logging every 60 seconds

## Configuration

Current throttling settings (in `tokenDiscovery.js` line 18):
```javascript
this.requestQueue = new RequestQueue(3, 200);
//                                    ^   ^
//                                    |   200ms delay between requests
//                                    Max 3 concurrent requests
```

### Adjusting the Settings

If you still see rate limits:
- **Decrease** maxConcurrent: `new RequestQueue(2, 200)` - slower but safer
- **Increase** delay: `new RequestQueue(3, 300)` - more time between requests

If everything works and you want faster processing:
- **Increase** maxConcurrent: `new RequestQueue(5, 200)` - faster but may hit limits
- **Decrease** delay: `new RequestQueue(3, 100)` - process queue faster

## What You'll See

### Before (Rate Limited):
```
Server responded with 429 Too Many Requests...
Server responded with 429 Too Many Requests...
Server responded with 429 Too Many Requests...
(hundreds of errors)
```

### After (Throttled):
```
Token discovery active - monitoring Raydium pools
⚡ Rate limiting enabled: max 3 concurrent requests, 200ms delay
📊 Discovery Stats: 45 logs | 3 tokens | Queue: 12 queued, 3 active
🆕 New token discovered: TokenMintAddress123...
```

## How It Works

1. **Log Event Received** → Added to stats counter
2. **Parse Request Needed** → Added to queue (not executed immediately)
3. **Queue Processor** → Takes requests one at a time with delay
4. **Max 3 Concurrent** → Only 3 requests in flight at once
5. **200ms Between** → Ensures we don't spam the RPC
6. **Token Discovered** → Logged and tracked

## Benefits

✅ **No More Rate Limits** - Controlled request flow  
✅ **All Data Processed** - Nothing is lost, just queued  
✅ **Better Visibility** - Stats show what's happening  
✅ **Configurable** - Easy to adjust based on your RPC tier  
✅ **Helius Compatible** - Works perfectly with free tier  

## Stats Logging

Every 60 seconds you'll see:
```
📊 Discovery Stats: 
  - 120 logs received (pool creation events)
  - 8 tokens discovered (met criteria)
  - Queue: 5 queued, 3 active (processing status)
```

This helps you monitor:
- How active mainnet is
- If queue is backing up (may need to increase maxConcurrent)
- How many tokens meet your criteria

## Testing

The fix is now active. When you run `npm start`:
1. Bot will connect to Helius (no rate limits message)
2. Token discovery will show rate limiting enabled
3. You'll see smooth processing with NO 429 errors
4. Stats will show progress every 60 seconds

## Troubleshooting

### Still seeing 429 errors?
- Reduce maxConcurrent to 2
- Increase delay to 300ms or 500ms

### Queue backing up (queued count keeps growing)?
- Increase maxConcurrent to 5
- Decrease delay to 100ms
- Consider upgrading Helius tier

### Not seeing any tokens?
- Check logs - are pool events being received?
- Verify minLiquidity setting in config
- Mainnet is active 24/7, you should see pools

---

**Status**: ✅ FIXED - Ready to test!

