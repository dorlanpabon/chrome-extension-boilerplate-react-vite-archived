# Fix import() Dinámico - Guía Rápida

## El Problema en 30 Segundos 🔴

```javascript
// meet.iife.js (generado en desarrollo)
import('./meet.iife_dev.js');  // ← ASYNC, ejecuta tarde ❌
```

**Resultado:**
```
1. Chrome carga meet.iife.js
2. Ve: import('./meet.iife_dev.js')
3. Inicia carga async (Promise)
4. Google Meet scripts ejecutan primero ❌
5. Import finalmente se resuelve (tarde)
```

## La Solución en 30 Segundos ✅

```typescript
// makeEntryPointPlugin.ts
if (fileName.includes('meet.iife')) {
  break;  // NO usar import dinámico
}
```

**Resultado:**
```
1. Chrome carga meet.iife.js
2. Código está inline (no import)
3. Ejecuta INMEDIATAMENTE ✅
4. RTC interceptado ✅
5. Google Meet scripts ejecutan después (tarde)
```

## Antes vs Después

### ANTES: Import Async ❌

```
meet.iife.js carga
    ↓
Contiene: import('./meet.iife_dev.js')
    ↓
⏳ Promise pendiente...
    ↓
Google Meet ejecuta PRIMERO ❌
    ↓
Congela RTCPeerConnection ❌
    ↓
Import se resuelve (tarde)
```

### DESPUÉS: Código Inline ✅

```
meet.iife.js carga
    ↓
Contiene: Código completo inline
    ↓
⚡ Ejecuta INMEDIATAMENTE
    ↓
RTC interceptado ✅
    ↓
Google Meet ejecuta después (tarde)
    ↓
No puede congelar RTC (ya interceptado) ✅
```

## Código Modificado

### Archivo
`packages/hmr/lib/plugins/make-entry-point-plugin.ts`

### Cambio

```diff
  case 'chunk': {
    safeWriteFileSync(resolve(outputDir, newFileName), module.code);
    const newFileNameBase = basename(newFileName);

+   // Special handling for meet.iife to avoid async loading delay
+   if (fileName.includes('meet.iife')) {
+     // Don't replace code - keep it inline
+     break;
+   }

    if (IS_FIREFOX) {
      module.code = `import(browser.runtime.getURL("${contentDirectory}/${newFileNameBase}"));`;
    } else {
      module.code = `import('./${newFileNameBase}');`;
    }
    break;
  }
```

## ¿Qué hace el código?

```typescript
// Para TODOS los content scripts:
// 1. Guarda código en archivo_dev.js
safeWriteFileSync(resolve(outputDir, newFileName), module.code);

// 2. Para meet.iife: PARA AQUÍ (break)
if (fileName.includes('meet.iife')) {
  break;  // ← Mantiene código original inline
}

// 3. Para otros scripts: reemplaza con import()
module.code = `import('./${newFileNameBase}');`;
```

## Resultado Final

### meet.iife.js (Desarrollo)

**ANTES:**
```javascript
import('./meet.iife_dev.js');  // Solo esta línea
```

**DESPUÉS:**
```javascript
// Todo el código inline (miles de líneas)
const OriginalRTCPeerConnection = window.RTCPeerConnection;
window.RTCPeerConnection = class extends OriginalRTCPeerConnection {
  constructor(config) {
    super(config);
    console.log('[CEB] RTCPeerConnection created:', config);
  }
};
// ... resto del código ...
```

### all.iife.js (Desarrollo - sin cambios)

```javascript
import('./all.iife_dev.js');  // Sigue usando import (no crítico)
```

## Verificación Rápida

```bash
# Build en desarrollo
pnpm dev

# Ver meet.iife.js
head -5 dist/content/meet.iife.js
```

**Deberías ver:**
```javascript
const OriginalRTCPeerConnection = window.RTCPeerConnection;
// ... código real
```

**NO deberías ver:**
```javascript
import('./meet.iife_dev.js');  // ❌ Esto ya no debería estar
```

## Logs Esperados

Con Control+R en Google Meet (dev mode):

```
[CEB] RTCPeerConnection intercepted before potential freeze  ← PRIMERO ✅
[CEB] Google Meet content script loaded at document_start
[CEB] Google Meet interception active
[HMR] Connected to dev-server at ws://localhost:8081
```

## Preguntas Frecuentes

### ¿Por qué existía el import dinámico?

**Cache-busting** en desarrollo:
- Evita que el navegador use código viejo
- Útil para HMR y desarrollo
- Pero causa retraso async

### ¿Se pierde cache-busting?

**Solo para meet.iife, pero no importa:**
- El timing crítico es más importante
- En dev, el código cambia poco
- Puedes hacer hard-reload si es necesario
- En producción no hay import dinámico anyway

### ¿Afecta otros scripts?

**NO:**
- Solo meet.iife tiene manejo especial
- all.iife.js sigue usando import()
- example.iife.js sigue usando import()
- No son timing-críticos

### ¿Funciona HMR?

**SÍ:**
- HMR se inyecta separadamente
- No depende del import dinámico
- watch-rebuild-plugin maneja HMR
- makeEntryPointPlugin maneja entry points

### ¿Y el archivo _dev.js?

**Se crea igual:**
- meet.iife_dev.js se genera
- Disponible para debugging
- Simplemente no se usa vía import()
- Puedes cargarlo manualmente si quieres

## Resumen Ultra-Rápido

| Cambio | Líneas | Efecto |
|--------|--------|--------|
| Añadir `if` check | +5 líneas | meet.iife inline |
| meet.iife.js | Era: 1 línea | Ahora: código completo |
| Timing | Era: async | Ahora: sync |
| Ejecución | Era: tarde ❌ | Ahora: inmediata ✅ |

## Pila de Soluciones Completa

Ahora tenemos **4 capas** de protección:

```
1. world: 'MAIN'           → Contexto principal
2. run_at: 'document_start' → Timing temprano
3. RTC Interceptor al inicio → Primer código
4. Sin import() dinámico   → Ejecución inmediata ✅
```

¡Todas trabajando juntas para garantizar ejecución PRIMERO! 🎉
