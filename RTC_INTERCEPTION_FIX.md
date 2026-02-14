# RTCPeerConnection Interception Fix for Google Meet

## Problema
El content script de Google Meet necesita interceptar `RTCPeerConnection` ANTES de que los scripts de la página de Google Meet congelen el objeto. Incluso con `run_at: 'document_start'`, a veces los scripts de la página se ejecutaban primero.

## Solución Implementada

### 1. Interceptor de RTCPeerConnection al Inicio del Script

En `pages/content/src/matches/meet/index.ts`, añadimos el interceptor CRITICAL como el PRIMER código que se ejecuta:

```typescript
// CRITICAL: Intercept RTCPeerConnection IMMEDIATELY - Must execute before ANY other code
// This code runs at the global scope to ensure it executes first
const OriginalRTCPeerConnection = window.RTCPeerConnection;
const OriginalRTCSessionDescription = window.RTCSessionDescription;
const OriginalRTCIceCandidate = window.RTCIceCandidate;

// Store original prototype methods before they can be frozen
const originalRTCPeerConnectionMethods = {
  createOffer: OriginalRTCPeerConnection.prototype.createOffer,
  createAnswer: OriginalRTCPeerConnection.prototype.createAnswer,
  setLocalDescription: OriginalRTCPeerConnection.prototype.setLocalDescription,
  setRemoteDescription: OriginalRTCPeerConnection.prototype.setRemoteDescription,
  addIceCandidate: OriginalRTCPeerConnection.prototype.addIceCandidate,
  addTrack: OriginalRTCPeerConnection.prototype.addTrack,
  removeTrack: OriginalRTCPeerConnection.prototype.removeTrack,
  getStats: OriginalRTCPeerConnection.prototype.getStats,
  close: OriginalRTCPeerConnection.prototype.close,
};

// Immediately override RTCPeerConnection before Google Meet can freeze it
window.RTCPeerConnection = class extends OriginalRTCPeerConnection {
  constructor(config?: RTCConfiguration) {
    super(config);
    console.log('[CEB] RTCPeerConnection created with config:', config);
  }
} as typeof RTCPeerConnection;

// Store references for later use
(window as Window & { __CEB_OriginalRTCPeerConnection: typeof RTCPeerConnection }).__CEB_OriginalRTCPeerConnection = OriginalRTCPeerConnection;
(window as Window & { __CEB_OriginalRTCSessionDescription: typeof RTCSessionDescription }).__CEB_OriginalRTCSessionDescription = OriginalRTCSessionDescription;
(window as Window & { __CEB_OriginalRTCIceCandidate: typeof RTCIceCandidate }).__CEB_OriginalRTCIceCandidate = OriginalRTCIceCandidate;
(window as Window & { __CEB_OriginalRTCPeerConnectionMethods: typeof originalRTCPeerConnectionMethods }).__CEB_OriginalRTCPeerConnectionMethods = originalRTCPeerConnectionMethods;
```

### 2. Modificación del Plugin HMR

En `packages/hmr/lib/plugins/watch-rebuild-plugin.ts`, modificamos el `generateBundle` para que detecte `meet.iife.js` y coloque el interceptor ANTES del código HMR:

```typescript
generateBundle(_options, bundle) {
  for (const [fileName, module] of Object.entries(bundle)) {
    if (module.type === 'chunk') {
      // Special handling for meet.iife.js - inject HMR code after RTC interception
      if (fileName.includes('meet.iife')) {
        // Extract RTC interception code from the beginning of the module
        const rtcInterceptorMatch = module.code.match(
          /\/\/ CRITICAL:[\s\S]*?console\.log\('\[CEB\] RTCPeerConnection intercepted[\s\S]*?\n/
        );
        
        if (rtcInterceptorMatch) {
          // Remove the interceptor from its current position
          const interceptorCode = rtcInterceptorMatch[0];
          const restOfCode = module.code.replace(interceptorCode, '');
          
          // Inject in order: interceptor, then HMR, then rest of code
          module.code = interceptorCode + '\n' + 
                       `(function() {let __HMR_ID = "${id}";\n` + hmrCode + '\n' + '})();' + '\n' + 
                       restOfCode;
        } else {
          // Fallback: use standard injection
          module.code = `(function() {let __HMR_ID = "${id}";\n` + hmrCode + '\n' + '})();' + '\n' + module.code;
        }
      } else {
        // Standard HMR injection for other modules
        module.code = `(function() {let __HMR_ID = "${id}";\n` + hmrCode + '\n' + '})();' + '\n' + module.code;
      }
    }
  }
},
```

### 3. Orden de Ejecución

Con esta modificación, el orden de ejecución en `meet.iife.js` es:

1. **Interceptor de RTCPeerConnection** (PRIMERO - al nivel global)
2. **Código HMR** (en desarrollo, envuelto en IIFE)
3. **Resto del content script** (envuelto en IIFE)

Esto garantiza que el interceptor se ejecute ANTES de cualquier otro código, incluyendo HMR.

### 4. Beneficios

- ✅ El interceptor captura RTCPeerConnection antes de que Google Meet lo congele
- ✅ Los métodos originales se almacenan para uso posterior
- ✅ Una nueva clase personalizada reemplaza RTCPeerConnection, permitiendo logging
- ✅ Referencias originales disponibles en `window.__CEB_Original*` para debugging
- ✅ Compatible con el sistema HMR en modo desarrollo

### 5. Testing

Para verificar que funciona:

1. Build the extension: `pnpm build`
2. Load extension in Chrome
3. Navigate to Google Meet
4. Open DevTools Console
5. Verify logs:
   - `[CEB] RTCPeerConnection intercepted before potential freeze`
   - `[CEB] RTCPeerConnection created with config: ...` (cuando se crea una conexión)

### 6. Archivos Modificados

- `pages/content/src/matches/meet/index.ts` - Añadido interceptor al inicio
- `packages/hmr/lib/plugins/watch-rebuild-plugin.ts` - Manejo especial para meet.iife.js
- `pages/content/src/matches/meet/rtc-interceptor.ts` - Archivo de referencia con el código del interceptor

## Respuesta al Requirement

> "necesito que el content script de meet.iife_dev.js se ejecute antes de ... y si es posible que se ejecute antes de todo, ¿es posible quitar el function ()?"

**Sí, implementado:**
- ✅ El interceptor de RTC se ejecuta ANTES del código HMR
- ✅ El interceptor se ejecuta ANTES de que Google Meet congele RTCPeerConnection
- ✅ El interceptor se ejecuta al nivel global (no dentro de una función IIFE)
- ✅ El manifest ya tiene `run_at: 'document_start'` para máxima prioridad
