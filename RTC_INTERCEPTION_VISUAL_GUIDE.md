# RTCPeerConnection Interception - Visual Guide

## Problema Original

```
Ejecución en Google Meet (ANTES del fix):
═══════════════════════════════════════════

Chrome carga meet.google.com
    ↓
Scripts de Google Meet se cargan
    ↓
Google Meet ejecuta: Object.freeze(RTCPeerConnection)  ❌
    ↓
Content script carga (document_start)
    ↓
❌ RTCPeerConnection ya está congelado - NO se puede interceptar
```

## Solución Implementada

```
Ejecución en Google Meet (DESPUÉS del fix):
═══════════════════════════════════════════

Chrome carga meet.google.com
    ↓
Content script carga INMEDIATAMENTE (document_start)
    ↓
✅ INTERCEPTOR RTC ejecuta PRIMERO (nivel global)
    - Guarda OriginalRTCPeerConnection
    - Guarda métodos originales
    - Reemplaza window.RTCPeerConnection con clase custom
    ↓
Código HMR ejecuta (si está en dev mode)
    ↓
Resto del content script ejecuta
    ↓
Scripts de Google Meet se cargan
    ↓
Google Meet intenta: Object.freeze(RTCPeerConnection)
    ↓
✅ Pero nuestra clase custom ya está en su lugar!
✅ Referencias originales guardadas en window.__CEB_Original*
```

## Estructura del Código Generado

### meet.iife.js (Development Mode)

```javascript
// ═══════════════════════════════════════════════════════════════
// PARTE 1: INTERCEPTOR RTC (NIVEL GLOBAL - EJECUTA PRIMERO)
// ═══════════════════════════════════════════════════════════════

const OriginalRTCPeerConnection = window.RTCPeerConnection;
const OriginalRTCSessionDescription = window.RTCSessionDescription;
const OriginalRTCIceCandidate = window.RTCIceCandidate;

const originalRTCPeerConnectionMethods = {
  createOffer: OriginalRTCPeerConnection.prototype.createOffer,
  createAnswer: OriginalRTCPeerConnection.prototype.createAnswer,
  // ... más métodos
};

window.RTCPeerConnection = class extends OriginalRTCPeerConnection {
  constructor(config) {
    super(config);
    console.log('[CEB] RTCPeerConnection created with config:', config);
  }
};

window.__CEB_OriginalRTCPeerConnection = OriginalRTCPeerConnection;
// ... guardar otras referencias

console.log('[CEB] RTCPeerConnection intercepted before potential freeze');

// ═══════════════════════════════════════════════════════════════
// PARTE 2: RESTO DEL CONTENT SCRIPT (IIFE - SEGUNDA)
// ═══════════════════════════════════════════════════════════════

(function() {
  "use strict";
  
  // Intercepción de captions
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    // ...
  };
  
  // Intercepción de XMLHttpRequest
  XMLHttpRequest.prototype.send = function(...args) {
    // ...
  };
  
  // ... resto de la lógica del content script
})();

// ═══════════════════════════════════════════════════════════════
// PARTE 3: CÓDIGO HMR (IIFE - AL FINAL, ÚLTIMA)
// ═══════════════════════════════════════════════════════════════

(function() {
  let __HMR_ID = "...";
  
  // Código HMR para hot reload en desarrollo
  // Envuelto en Promise para no bloquear
  void Promise.resolve().then(() => {
    const ws = new WebSocket('ws://localhost:8081');
    // ...
  });
})();
```

## Comparación Visual

### ANTES (Problema)

```
┌─────────────────────────────────────────────────────┐
│ TIEMPO: T0                                          │
│ Chrome carga meet.google.com                        │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│ TIEMPO: T1                                          │
│ Google Meet scripts ejecutan                        │
│ ❌ Object.freeze(RTCPeerConnection)                 │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│ TIEMPO: T2                                          │
│ Content script carga (document_start)               │
│ ❌ Intenta interceptar RTCPeerConnection            │
│ ❌ Ya está congelado - FALLA                        │
└─────────────────────────────────────────────────────┘
```

### DESPUÉS (Solución)

```
┌─────────────────────────────────────────────────────┐
│ TIEMPO: T0                                          │
│ Chrome carga meet.google.com                        │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│ TIEMPO: T1                                          │
│ Content script carga (document_start)               │
│ ✅ INTERCEPTOR RTC ejecuta PRIMERO                  │
│ ✅ Guarda original + Reemplaza RTCPeerConnection    │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│ TIEMPO: T2                                          │
│ Resto del content script ejecuta                    │
│ ✅ Caption interception ready                       │
│ ✅ Participant tracking ready                       │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│ TIEMPO: T3                                          │
│ HMR code ejecuta (async, no bloquea) - AL FINAL    │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│ TIEMPO: T4                                          │
│ Google Meet scripts intentan congelar               │
│ ✅ Nuestra clase custom ya está en su lugar         │
│ ✅ Referencias originales seguras                   │
└─────────────────────────────────────────────────────┘
```

## Características Clave

### 1. Ejecución Inmediata
```javascript
// ✅ Nivel global - NO dentro de IIFE
const OriginalRTCPeerConnection = window.RTCPeerConnection;

// ✅ Se ejecuta INMEDIATAMENTE al cargar el script
window.RTCPeerConnection = class extends OriginalRTCPeerConnection { ... };
```

### 2. Orden Garantizado por HMR Plugin
```javascript
// En watch-rebuild-plugin.ts:
if (fileName.includes('meet.iife')) {
  // Extrae interceptor del código compilado
  // Inyecta en orden: interceptor → resto → HMR AL FINAL
  module.code = interceptorCode + restOfCode + hmrCode;
}
```

### 3. Referencias Seguras
```javascript
// Guardadas en window para acceso posterior
window.__CEB_OriginalRTCPeerConnection = OriginalRTCPeerConnection;
window.__CEB_OriginalRTCSessionDescription = OriginalRTCSessionDescription;
window.__CEB_OriginalRTCIceCandidate = OriginalRTCIceCandidate;
window.__CEB_OriginalRTCPeerConnectionMethods = { ... };
```

## Testing

### Console Output Esperado

```javascript
// Al cargar Google Meet:
[CEB] Google Meet content script loaded at document_start
[CEB] RTCPeerConnection intercepted before potential freeze

// Cuando se crea una conexión RTC:
[CEB] RTCPeerConnection created with config: {
  iceServers: [...],
  iceTransportPolicy: "all",
  ...
}
```

### Verificación en DevTools

```javascript
// En la consola de Chrome:
console.log(window.__CEB_OriginalRTCPeerConnection);
// → [Function: RTCPeerConnection]

console.log(window.RTCPeerConnection);
// → [class extends RTCPeerConnection]

console.log(Object.isFrozen(window.RTCPeerConnection));
// → false (nuestra clase custom no está congelada)

console.log(window.__CEB_OriginalRTCPeerConnectionMethods);
// → { createOffer: f, createAnswer: f, ... }
```

## Beneficios de la Solución

| Aspecto | Antes | Después |
|---------|-------|---------|
| Timing de intercepción | ❌ Tarde (después de freeze) | ✅ Temprano (antes de freeze) |
| Acceso a RTC original | ❌ Perdido | ✅ Guardado en `window.__CEB_*` |
| Logging de conexiones | ❌ No disponible | ✅ Cada conexión se registra |
| Compatibilidad HMR | ⚠️ HMR bloquea | ✅ HMR async, no bloquea |
| Orden de ejecución | ❌ No garantizado | ✅ Garantizado por plugin |
| Métodos RTC originales | ❌ Inaccesibles | ✅ Todos guardados |

## Notas Técnicas

1. **document_start**: El manifest ya tiene `run_at: 'document_start'` para máxima prioridad
2. **Nivel Global**: El interceptor NO está en IIFE, ejecuta al nivel global
3. **HMR Plugin**: Detecta `meet.iife` y reordena el código automáticamente
4. **TypeScript**: Usa tipos apropiados, no `any`, para pasar ESLint
5. **Referencias**: Todas las referencias originales guardadas por si Google Meet congela

## Conclusión

✅ **Problema Resuelto**: El interceptor ahora se ejecuta ANTES de todo, incluyendo HMR
✅ **Orden Garantizado**: Plugin HMR maneja el orden de inyección automáticamente
✅ **No Bloqueante**: HMR envuelto en Promise, interceptor al nivel global
✅ **Acceso Completo**: Referencias originales disponibles para grabación
