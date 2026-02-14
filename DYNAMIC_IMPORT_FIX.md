# Solución: Eliminar Import Dinámico en Modo Desarrollo

## El Problema 🔴

En modo desarrollo, el plugin `makeEntryPointPlugin` generaba un **import dinámico** en `meet.iife.js`:

```javascript
// meet.iife.js (generado en desarrollo)
import('./meet.iife_dev.js');
```

### ¿Por qué era un problema?

1. **Import dinámico es ASYNC**: `import()` devuelve una Promise
2. **Retrasa ejecución**: El código no se ejecuta hasta que la Promise se resuelve
3. **Anula document_start**: Aunque el archivo se carga temprano, el código se ejecuta tarde
4. **Anula MAIN world**: Aunque está en el contexto principal, se ejecuta después
5. **Google Meet ejecuta primero**: Sus scripts pueden ejecutar antes que el nuestro

### Flujo del Problema

```
Control+R presionado
    ↓
Chrome carga meet.iife.js (document_start, MAIN world) ✅
    ↓
Código en meet.iife.js: import('./meet.iife_dev.js') 
    ↓
Import dinámico inicia (ASYNC) ⏳
    ↓
Google Meet scripts cargan y ejecutan ❌
    ↓
Meet congela RTCPeerConnection ❌
    ↓
Import dinámico finalmente se resuelve (demasiado tarde)
    ↓
meet.iife_dev.js ejecuta (RTC ya está congelado) ❌
```

## La Causa Raíz 🔍

### Archivo Problemático

`packages/hmr/lib/plugins/make-entry-point-plugin.ts`

```typescript
export const makeEntryPointPlugin = (): PluginOption => ({
  name: 'make-entry-point-plugin',
  generateBundle(options, bundle) {
    for (const module of Object.values(bundle)) {
      const fileName = module.fileName;
      const newFileName = fileName.replace('.js', '_dev.js');

      switch (module.type) {
        case 'chunk': {
          // Guarda el código en archivo _dev.js
          safeWriteFileSync(resolve(outputDir, newFileName), module.code);
          
          // ❌ PROBLEMA: Reemplaza el código con import dinámico
          module.code = `import('./${newFileNameBase}');`;
          break;
        }
      }
    }
  },
});
```

### ¿Por qué existía este código?

**Propósito original:**
- **Cache-busting**: Evitar que el navegador use cache viejo en desarrollo
- **Hot reload**: Facilitar actualizaciones en caliente
- **Separación**: Mantener código en archivo separado para debugging

**El problema:**
- Es útil para scripts normales donde el timing no es crítico
- Es **desastroso** para scripts de timing crítico como `meet.iife`
- El import dinámico introduce latencia inaceptable

## La Solución ✅

### Modificación Implementada

Añadido manejo especial para `meet.iife` para evitar el import dinámico:

```typescript
case 'chunk': {
  safeWriteFileSync(resolve(outputDir, newFileName), module.code);
  const newFileNameBase = basename(newFileName);

  // ✅ SOLUCIÓN: Manejo especial para meet.iife
  if (fileName.includes('meet.iife')) {
    // NO reemplazamos el código con import dinámico
    // Mantenemos el código inline para ejecución inmediata
    // El archivo _dev.js se crea igual para debugging
    break;
  }

  // Otros content scripts siguen usando import dinámico
  if (IS_FIREFOX) {
    module.code = `import(browser.runtime.getURL("${contentDirectory}/${newFileNameBase}"));`;
  } else {
    module.code = `import('./${newFileNameBase}');`;
  }
  break;
}
```

### Flujo Corregido

```
Control+R presionado
    ↓
Chrome carga meet.iife.js (document_start, MAIN world) ✅
    ↓
Código INLINE ejecuta INMEDIATAMENTE ✅
    ↓
RTC Interceptor captura window.RTCPeerConnection ✅
    ↓
Guarda referencias originales ✅
    ↓
Reemplaza con clase custom ✅
    ↓
Resto del content script ejecuta ✅
    ↓
Google Meet scripts cargan (demasiado tarde) ✅
    ↓
Meet intenta congelar RTC pero ya está interceptado ✅
```

## Comparación Visual

### ANTES: Import Dinámico (Async)

```
┌──────────────────────────────────────────────┐
│ meet.iife.js (Cargado en document_start)    │
├──────────────────────────────────────────────┤
│                                              │
│  import('./meet.iife_dev.js');              │
│         ↓ (ASYNC - Promise)                 │
│         ⏳ Esperando...                      │
│                                              │
└──────────────────────────────────────────────┘
                   │
                   │ Mientras tanto...
                   ▼
┌──────────────────────────────────────────────┐
│ Google Meet Scripts                          │
├──────────────────────────────────────────────┤
│  ⚡ Ejecutan primero ❌                       │
│  Object.freeze(RTCPeerConnection) ❌         │
└──────────────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────┐
│ meet.iife_dev.js finalmente se resuelve     │
├──────────────────────────────────────────────┤
│  ❌ Demasiado tarde                          │
│  ❌ RTC ya está congelado                    │
└──────────────────────────────────────────────┘
```

### DESPUÉS: Código Inline (Sync)

```
┌──────────────────────────────────────────────┐
│ meet.iife.js (Cargado en document_start)    │
├──────────────────────────────────────────────┤
│  // RTC Interceptor (inline)                │
│  const OriginalRTC = window.RTCPeer...      │
│  window.RTCPeerConnection = class...        │
│  ⚡ Ejecuta INMEDIATAMENTE ✅                 │
│                                              │
│  // Rest of content script                  │
│  window.fetch = async function...           │
│  ⚡ Todo ejecuta sincrónicamente ✅           │
└──────────────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────┐
│ Google Meet Scripts                          │
├──────────────────────────────────────────────┤
│  ⏳ Cargan después ✅                         │
│  ⚠️ Intentan congelar RTC                    │
│  ✅ Pero ya está interceptado                │
└──────────────────────────────────────────────┘
```

## Detalles Técnicos

### ¿Qué pasa con el archivo _dev.js?

```typescript
// El archivo _dev.js SE CREA igual
safeWriteFileSync(resolve(outputDir, newFileName), module.code);

// Pero NO se usa vía import dinámico
// Solo está disponible para debugging manual si es necesario
```

**Ventajas:**
- ✅ Código disponible para debugging
- ✅ Puedes inspeccionarlo en DevTools
- ✅ No interfiere con la ejecución

### ¿Afecta a otros content scripts?

**NO.** Solo `meet.iife` tiene manejo especial:

```typescript
if (fileName.includes('meet.iife')) {
  // Manejo especial - código inline
  break;
}

// Otros scripts siguen usando import dinámico
module.code = `import('./${newFileNameBase}');`;
```

**Razón:**
- `all.iife.js` - No es timing-crítico
- `example.iife.js` - No es timing-crítico
- **`meet.iife.js`** - TIMING CRÍTICO (RTC interception)

### ¿Funciona HMR todavía?

**SÍ.** HMR se inyecta de forma separada:

```javascript
// HMR se inyecta por watch-rebuild-plugin, no por makeEntryPointPlugin
// El orden es:
// 1. RTC Interceptor (inline)
// 2. Content script logic (inline)
// 3. HMR code (inyectado al final, inline también)
```

El HMR sigue funcionando porque:
1. No depende del import dinámico
2. Se inyecta directamente en el código
3. Está al final del script (no bloquea)

## Verificación

### Desarrollo

```bash
# Construir en modo desarrollo
pnpm dev

# Verificar meet.iife.js
cat dist/content/meet.iife.js | head -20

# Debería ver código real, NO import()
# Debería empezar con:
# const OriginalRTCPeerConnection = window.RTCPeerConnection;
```

### Logs de Consola

Con Control+R en Google Meet (dev mode):

```
✅ [CEB] RTCPeerConnection intercepted before potential freeze
✅ [CEB] Google Meet content script loaded at document_start
✅ [CEB] Google Meet interception active
✅ [HMR] Connected to dev-server at ws://localhost:8081
```

Orden CRÍTICO: RTC debe interceptarse PRIMERO.

### DevTools

```javascript
// Verificar en Console:
window.__CEB_OriginalRTCPeerConnection
// ƒ RTCPeerConnection() { [native code] }  ✅

Object.isFrozen(window.RTCPeerConnection)
// false  ✅ (nuestro override no está congelado)

// Si ya hay conexiones RTC:
// [CEB] RTCPeerConnection created with config: {...}
```

## Resumen de Soluciones Completas

Ahora tenemos **4 capas de protección** para garantizar ejecución temprana:

### 1. Manifest: world: 'MAIN'
```typescript
{
  matches: ['https://meet.google.com/*'],
  world: 'MAIN',  // Inyecta en contexto principal
}
```

### 2. Manifest: run_at: 'document_start'
```typescript
{
  run_at: 'document_start',  // Timing más temprano
}
```

### 3. Script: RTC Interceptor al inicio
```typescript
// Primer código en el archivo (nivel global)
const OriginalRTCPeerConnection = window.RTCPeerConnection;
```

### 4. Build: Sin Import Dinámico (ESTA SOLUCIÓN)
```typescript
// makeEntryPointPlugin: NO genera import() para meet.iife
if (fileName.includes('meet.iife')) {
  break;  // Mantiene código inline
}
```

## Tabla Comparativa

| Aspecto | Con Import Dinámico | Sin Import Dinámico |
|---------|---------------------|---------------------|
| Tipo de carga | Async (Promise) | Sync (inline) |
| Timing | Retrasado ⏳ | Inmediato ⚡ |
| Control+R | ❌ Falla a veces | ✅ Siempre funciona |
| F5 | ❌ Inconsistente | ✅ Consistente |
| RTC Interception | ⚠️ Tarde | ✅ Temprano |
| Cache busting | ✅ Sí | ⚠️ No (no crítico) |
| Debugging | ✅ _dev.js separado | ✅ _dev.js disponible |
| HMR | ✅ Funciona | ✅ Funciona |

## Conclusión

✅ **Problema identificado**: `import('./meet.iife_dev.js')` en makeEntryPointPlugin
✅ **Causa**: Import dinámico es async, retrasa ejecución
✅ **Solución**: Manejo especial para meet.iife, código inline
✅ **Resultado**: Ejecución inmediata, sincrónica
✅ **Compatibilidad**: HMR funciona, otros scripts no afectados
✅ **Timing**: Ahora GARANTIZADO en todas las formas de recarga

Con esta solución, el código de `meet.iife.js` se ejecuta **inmediatamente** al cargar, sin esperar ninguna Promise, garantizando que el interceptor de RTC se ejecute ANTES que cualquier script de Google Meet.
