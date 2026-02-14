# Fix: WebSocket Hot Reload Non-Blocking

## Problem

The WebSocket connection for hot reload (HMR) was being created synchronously in content scripts, which could block their execution. This was particularly problematic when:

- The dev server was not running
- Network connection was slow
- Multiple content scripts needed to load quickly on page load

## Solution

Wrapped the WebSocket connection initialization in a Promise to make it non-blocking.

## Changes

### File Modified
- `packages/hmr/lib/initializers/init-client.ts`

### Before
```typescript
export default ({ id, onUpdate }: { id: string; onUpdate: () => void }) => {
  const ws = new WebSocket(LOCAL_RELOAD_SOCKET_URL);

  ws.onopen = () => {
    ws.addEventListener('message', event => {
      const message = MessageInterpreter.receive(String(event.data));

      if (message.type === DO_UPDATE && message.id === id) {
        onUpdate();
        ws.send(MessageInterpreter.send({ type: DONE_UPDATE }));
      }
    });
  };
};
```

### After
```typescript
export default ({ id, onUpdate }: { id: string; onUpdate: () => void }) => {
  // Wrap WebSocket connection in a promise to avoid blocking content script execution
  void Promise.resolve().then(() => {
    const ws = new WebSocket(LOCAL_RELOAD_SOCKET_URL);

    ws.onopen = () => {
      ws.addEventListener('message', event => {
        const message = MessageInterpreter.receive(String(event.data));

        if (message.type === DO_UPDATE && message.id === id) {
          onUpdate();
          ws.send(MessageInterpreter.send({ type: DONE_UPDATE }));
        }
      });
    };

    ws.onerror = () => {
      // Silently handle connection errors to avoid breaking content scripts
      console.warn('[HMR] Failed to connect to hot reload server');
    };
  });
};
```

## Key Improvements

1. **Non-blocking execution**: The WebSocket connection is now created asynchronously, allowing content scripts to execute immediately without waiting for the connection.

2. **Error handling**: Added `ws.onerror` handler to gracefully handle connection failures without breaking content scripts.

3. **Promise wrapping**: Used `Promise.resolve().then()` to defer the WebSocket creation to the next tick of the event loop.

4. **Void keyword**: Used `void` to explicitly ignore the promise return value and avoid unhandled promise warnings.

## How It Works

1. When a content script loads, it calls `initClient()` immediately
2. The function returns immediately without blocking
3. The WebSocket connection is established asynchronously in the background
4. If the connection succeeds, hot reload functionality is enabled
5. If the connection fails, the content script continues to work normally

## Testing

After this change:
- Content scripts execute immediately without waiting
- Hot reload still works when the dev server is running
- Content scripts don't crash when the dev server is not running
- Multiple content scripts can load in parallel without blocking each other

## Build Process

After modifying `init-client.ts`, the HMR package must be rebuilt:

```bash
cd packages/hmr
pnpm ready
```

This generates the updated `reload.js` and `refresh.js` injection scripts that are bundled into the extension during development.

## Impact

- **Development**: Content scripts load faster and more reliably
- **Production**: No impact (HMR code is not included in production builds)
- **User Experience**: Pages load faster during development
- **Debugging**: Clearer error messages when dev server is not available
