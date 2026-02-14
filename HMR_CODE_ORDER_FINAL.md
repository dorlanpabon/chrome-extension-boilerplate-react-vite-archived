# HMR WebSocket Code Order - Final Solution

## Problem Solved

The HMR WebSocket connection was injecting at the BEGINNING of the script when it should be at the END.

## Solution Implemented

Modified `packages/hmr/lib/plugins/watch-rebuild-plugin.ts` to place HMR code at the END of the meet content script.

## Code Order - FINAL

### Development Mode (`meet.iife.js` with HMR)

```javascript
// ═══════════════════════════════════════════════════════════════
// PART 1: RTC INTERCEPTOR (FIRST - Global Scope, Critical)
// ═══════════════════════════════════════════════════════════════

// CRITICAL: Intercept RTCPeerConnection IMMEDIATELY
const OriginalRTCPeerConnection = window.RTCPeerConnection;
const OriginalRTCSessionDescription = window.RTCSessionDescription;
const OriginalRTCIceCandidate = window.RTCIceCandidate;

// Store original prototype methods
const originalRTCPeerConnectionMethods = { ... };

// Override RTCPeerConnection immediately
window.RTCPeerConnection = class extends OriginalRTCPeerConnection {
  constructor(config) {
    super(config);
    console.log('[CEB] RTCPeerConnection created with config:', config);
  }
};

// Store references
window.__CEB_OriginalRTCPeerConnection = OriginalRTCPeerConnection;
// ... more references

console.log('[CEB] RTCPeerConnection intercepted before potential freeze');

// ═══════════════════════════════════════════════════════════════
// PART 2: MEET CONTENT SCRIPT (Second - All business logic)
// ═══════════════════════════════════════════════════════════════

(function() {
  "use strict";
  
  // Intercept fetch for captions
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    // ... caption interception logic
  };
  
  // Intercept XMLHttpRequest
  XMLHttpRequest.prototype.send = function(...args) {
    // ... XHR interception logic
  };
  
  // Message listeners
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // ... message handling
  });
  
  // Extract participant info
  const extractParticipantInfo = () => {
    // ... participant extraction logic
  };
  
  // Periodic participant updates
  setInterval(() => {
    // ... send participant info
  }, 5000);
  
  // Notify page ready
  chrome.runtime.sendMessage({
    type: 'MEET_PAGE_READY',
    data: { url: window.location.href }
  });
  
  console.log('[CEB] Google Meet interception active');
})();

// ═══════════════════════════════════════════════════════════════
// PART 3: HMR WEBSOCKET (LAST - Non-critical, dev-only)
// ═══════════════════════════════════════════════════════════════

(function() {
  let __HMR_ID = "0.9fcq8tetds8";
  
  const LOCAL_RELOAD_SOCKET_PORT = 8081;
  const LOCAL_RELOAD_SOCKET_URL = `ws://localhost:${LOCAL_RELOAD_SOCKET_PORT}`;
  
  // WebSocket connection wrapped in Promise (non-blocking)
  void Promise.resolve().then(() => {
    const ws = new WebSocket(LOCAL_RELOAD_SOCKET_URL);
    
    ws.onopen = () => {
      // ... HMR logic
    };
    
    ws.onerror = () => {
      console.warn('[HMR] Failed to connect to hot reload server');
    };
  });
  
  // Reload logic
  const reload = () => {
    pendingReload = false;
    window.location.reload();
  };
  
  // ... more HMR logic
})();
```

### Production Mode (`meet.iife.js` minified)

```javascript
// PART 1: RTC Interceptor (unminified, at top)
const OriginalRTCPeerConnection = window.RTCPeerConnection;
// ... interceptor code ...

// PART 2: Meet content script (minified)
(function(){"use strict";
  // ... all business logic minified ...
})();

// PART 3: HMR code - NOT INCLUDED in production ✓
```

## Key Changes in Plugin

### File: `packages/hmr/lib/plugins/watch-rebuild-plugin.ts`

**Before (WRONG ORDER):**
```typescript
if (rtcInterceptorMatch) {
  const interceptorCode = rtcInterceptorMatch[0];
  const restOfCode = module.code.replace(interceptorCode, '');
  
  // ❌ WRONG: interceptor → HMR → rest
  module.code = interceptorCode + '\n' + hmrCode + '\n' + restOfCode;
}
```

**After (CORRECT ORDER):**
```typescript
if (rtcInterceptorMatch) {
  const interceptorCode = rtcInterceptorMatch[0];
  const restOfCode = module.code.replace(interceptorCode, '');
  
  // ✅ CORRECT: interceptor → rest → HMR
  module.code = interceptorCode + '\n' + restOfCode + '\n' + hmrCode;
}
```

## Execution Timeline

### Before Fix (WRONG)

```
T0: Chrome loads meet.google.com
    ↓
T1: Content script injected (document_start)
    ↓
T2: ❌ HMR WebSocket tries to connect (blocking)
    ↓
T3: RTC Interceptor executes
    ↓
T4: Meet business logic executes
    ↓
T5: Google Meet scripts load
    ↓
T6: ⚠️ Sometimes Meet scripts freeze RTC before T3
```

### After Fix (CORRECT)

```
T0: Chrome loads meet.google.com
    ↓
T1: Content script injected (document_start)
    ↓
T2: ✅ RTC Interceptor executes FIRST (immediate)
    - Captures OriginalRTCPeerConnection
    - Overrides window.RTCPeerConnection
    ↓
T3: ✅ Meet business logic executes (all critical code)
    - Caption interception ready
    - Participant tracking ready
    - Message handlers ready
    ↓
T4: ✅ HMR WebSocket connects (non-blocking, async)
    - In Promise, doesn't block anything
    - Dev-only, not in production
    ↓
T5: Google Meet scripts load
    ↓
T6: ✅ Meet tries to freeze RTC
    - But our override is already in place!
    - Original references saved
```

## Benefits of Final Order

1. **Critical First**: RTC interceptor runs before anything else
2. **Business Logic Second**: All Meet interception logic loads completely
3. **Non-Critical Last**: HMR hot reload doesn't interfere with timing
4. **Non-Blocking**: HMR WebSocket in Promise, async
5. **Production Clean**: No HMR code in production builds

## Verification

### Check Production Build

```bash
# Build
pnpm turbo build --filter='!@extension/hmr'

# Verify no HMR code
grep -i "websocket\|__HMR_ID" dist/content/meet.iife.js
# Should return nothing (exit code 1)

# Verify RTC interceptor is first
head -1 dist/content/meet.iife.js | grep -i "RTCPeerConnection"
# Should find RTCPeerConnection at the start
```

### Check Development Build

In development mode, the order should be:
1. RTC interceptor (immediate execution)
2. Meet content script (IIFE)
3. HMR code (IIFE, at the end)

### Console Output

When loading Google Meet, you should see logs in this order:

```
[CEB] RTCPeerConnection intercepted before potential freeze
[CEB] Google Meet content script loaded at document_start
[CEB] Google Meet interception active
[HMR] Failed to connect to hot reload server (if dev server not running)
```

## Summary

✅ **Problem**: HMR WebSocket at beginning, blocking critical code
✅ **Solution**: Move HMR to END via plugin modification
✅ **Result**: RTC interceptor → Business logic → HMR (correct order)
✅ **Production**: HMR excluded, only critical code (clean)
✅ **Development**: All code present, correct execution order

The HMR WebSocket connection now executes LAST, ensuring all critical interception code runs first without any blocking or timing issues.
