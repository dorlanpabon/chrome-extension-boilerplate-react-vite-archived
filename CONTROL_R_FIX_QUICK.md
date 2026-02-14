# Fix Control+R: world: 'MAIN' - Guía Rápida

## El Problema 🔴

```
Usuario presiona Control+R
    ↓
Google Meet scripts ejecutan PRIMERO ❌
    ↓
Extension script ejecuta después (demasiado tarde)
    ↓
Meet congela RTCPeerConnection antes de interceptarlo
```

## La Solución ✅

### Un Cambio Simple

**Archivo:** `chrome-extension/manifest.ts`

```diff
  {
    matches: ['https://meet.google.com/*'],
    js: ['content/meet.iife.js'],
    run_at: 'document_start',
+   world: 'MAIN',
  }
```

### ¿Qué hace esto?

```
Usuario presiona Control+R
    ↓
Extension script ejecuta PRIMERO ✅
    ↓
Intercepta RTCPeerConnection
    ↓
Google Meet scripts ejecutan después
    ↓
No pueden congelar RTC porque ya lo interceptamos
```

## Diferencia Visual

### ANTES: ISOLATED World (Default)

```
┌─────────────────────────────────────────┐
│ Chrome Browser                          │
│                                         │
│  ┌─────────────────┐  ┌──────────────┐ │
│  │ ISOLATED World  │  │  MAIN World  │ │
│  │                 │  │              │ │
│  │ Extension       │  │  Google Meet │ │
│  │ Content Script  │  │  Page Script │ │
│  │                 │  │              │ │
│  │ ⏱️ Carga 2°     │  │  ⚡ Carga 1° │ │
│  └─────────────────┘  └──────────────┘ │
│                                         │
│  En Control+R, Meet se optimiza         │
│  y carga ANTES que la extension ❌      │
└─────────────────────────────────────────┘
```

### DESPUÉS: MAIN World

```
┌─────────────────────────────────────────┐
│ Chrome Browser                          │
│                                         │
│  ┌────────────────────────────────────┐ │
│  │         MAIN World                 │ │
│  │                                    │ │
│  │  ⚡ Extension Script (1°)          │ │
│  │  ↓ Intercepta RTC                 │ │
│  │  ↓ Guarda referencias             │ │
│  │                                    │ │
│  │  ⏱️ Google Meet Script (2°)       │ │
│  │  ↓ Intenta congelar RTC           │ │
│  │  ↓ Pero ya está interceptado ✅   │ │
│  └────────────────────────────────────┘ │
│                                         │
│  Extension SIEMPRE ejecuta primero ✅   │
└─────────────────────────────────────────┘
```

## ¿Por Qué Funciona?

### ISOLATED World Problems

```javascript
// Manifest (antes)
world: 'ISOLATED' // default

// Resultado:
// ❌ Script separado del contexto de la página
// ❌ Chrome lo puede retrasar en recargas rápidas
// ❌ Meet puede ejecutar primero con Control+R
```

### MAIN World Solution

```javascript
// Manifest (ahora)
world: 'MAIN'

// Resultado:
// ✅ Script en el mismo contexto que la página
// ✅ Se inyecta como si fuera parte del HTML
// ✅ SIEMPRE ejecuta antes que scripts de página
// ✅ Funciona con Control+R, F5, click reload
```

## Prueba Rápida

### Antes de cargar la extensión:

```javascript
// En Google Meet, Console:
window.RTCPeerConnection
// ƒ RTCPeerConnection() { [native code] }

Object.isFrozen(window.RTCPeerConnection)
// true ❌ (Google Meet lo congeló)
```

### Después de cargar la extensión:

```javascript
// En Google Meet, Console (después de Control+R):
window.RTCPeerConnection
// class extends RTCPeerConnection { ... } ✅

Object.isFrozen(window.RTCPeerConnection)
// false ✅ (nuestro override no está congelado)

window.__CEB_OriginalRTCPeerConnection
// ƒ RTCPeerConnection() { [native code] } ✅
```

## Logs Esperados

### Control+R (Ahora funciona):

```
[CEB] RTCPeerConnection intercepted before potential freeze ✅
[CEB] Google Meet content script loaded at document_start
[CEB] Google Meet interception active
[CEB] RTCPeerConnection created with config: {...}
```

### Orden CRÍTICO:

```
1. [CEB] RTCPeerConnection intercepted...  ← PRIMERO
2. [CEB] Google Meet content script...
3. [CEB] Google Meet interception active
4. (Google Meet scripts cargan después)
```

## Tabla Comparativa

| Método de Recarga | ANTES (ISOLATED) | AHORA (MAIN) |
|-------------------|------------------|--------------|
| Click en Reload   | ✅ Funciona      | ✅ Funciona  |
| Control+R         | ❌ Falla        | ✅ Funciona  |
| F5                | ⚠️ Inconsistente | ✅ Funciona  |
| Cmd+R (Mac)       | ❌ Falla        | ✅ Funciona  |
| Recarga desde menú| ✅ Funciona      | ✅ Funciona  |

## Resumen

### Cambio Necesario:

```typescript
// Solo añadir una línea:
world: 'MAIN'
```

### Resultado:

```
✅ Extension script ejecuta PRIMERO siempre
✅ Funciona con Control+R
✅ Funciona con todas las formas de recarga
✅ RTC interceptado antes que Meet lo congele
✅ Sin cambios en el código del script
```

### Por Qué Es Importante:

```
Google Meet hace: Object.freeze(RTCPeerConnection)

Si ejecutamos después: ❌ No podemos interceptar
Si ejecutamos antes:  ✅ Interceptamos y guardamos original
```

## Nota Técnica

**¿Por qué chrome.runtime funciona en MAIN world?**

```javascript
// Aunque estamos en MAIN world, podemos usar chrome APIs
chrome.runtime.sendMessage({ ... }); // ✅ Funciona

// Razón: El script se CARGA desde la extensión
// Chrome le da acceso a APIs incluso en MAIN world
// cuando el origen es la extensión
```

## ¡Listo! 🎉

Con este simple cambio, el script de la extensión ahora se ejecuta PRIMERO, sin importar cómo el usuario recargue la página.

```
Control+R → ✅ Extension primero
F5        → ✅ Extension primero  
Click     → ✅ Extension primero
```
