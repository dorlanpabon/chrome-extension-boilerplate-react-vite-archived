# Google Meet Recorder Extension

Esta extensión de Chrome permite grabar reuniones de Google Meet con audio, capturar transcripciones (captions) y enviar todo a un endpoint para procesamiento adicional.

## Características

- 🎥 **Grabación de pestañas con audio**: Captura video y audio de reuniones de Google Meet
- 📝 **Extracción de captions**: Intercepta y decodifica los mensajes de protobuf de Google Meet para extraer subtítulos
- 👥 **Identificación de participantes**: Detecta y guarda información de los participantes de la reunión
- 🔄 **Conversión de video**: Infraestructura preparada para convertir videos a MP4 usando ffmpeg.wasm
- 📤 **Envío a endpoint**: Envía automáticamente grabaciones, transcripciones y metadatos a un servidor API
- 🎨 **UI moderna**: Interfaz de usuario con controles de grabación y estado en tiempo real

## Arquitectura

### Componentes principales

1. **Background Service Worker** (`chrome-extension/src/background/index.ts`)
   - Maneja el estado de grabación
   - Coordina la comunicación entre componentes
   - Envía datos al endpoint API

2. **Content Script de Google Meet** (`pages/content/src/matches/meet/index.ts`)
   - Se inyecta en `https://meet.google.com/*` al inicio de la carga (`document_start`)
   - Intercepta peticiones Fetch y XMLHttpRequest
   - Decodifica mensajes protobuf de captions
   - Extrae información de participantes del DOM

3. **Offscreen Document** (`pages/offscreen/src/index.ts`)
   - Maneja la grabación de medios usando MediaRecorder API
   - Procesa y prepara videos para envío
   - Infraestructura para conversión con ffmpeg.wasm

4. **Popup UI** (`pages/popup/src/Popup.tsx`)
   - Controles de inicio/parada de grabación
   - Visualización del estado en tiempo real
   - Contador de duración y captions capturados

## Instalación

### Requisitos previos
- Node.js >= 22.15.1
- pnpm 10.11.0

### Pasos

1. Clonar el repositorio:
```bash
git clone https://github.com/dorlanpabon/chrome-extension-boilerplate-react-vite-archived.git
cd chrome-extension-boilerplate-react-vite-archived
```

2. Instalar dependencias:
```bash
pnpm install
```

3. Construir la extensión:
```bash
pnpm build
```

4. Cargar en Chrome:
   - Abre Chrome y ve a `chrome://extensions/`
   - Activa "Modo de desarrollador" (esquina superior derecha)
   - Haz clic en "Cargar extensión sin empaquetar"
   - Selecciona la carpeta `dist/`

## Configuración

### Endpoint API

Por defecto, la extensión intenta enviar datos a:
```typescript
const API_ENDPOINT = 'https://your-api-endpoint.com/recordings';
```

Para cambiar el endpoint, edita el archivo `chrome-extension/src/background/index.ts` y modifica la constante `API_ENDPOINT`.

### Formato de datos enviados

El endpoint recibirá un POST con el siguiente formato JSON:

```json
{
  "duration": 123456,
  "captions": [
    {
      "text": "Texto del caption",
      "timestamp": 1707932445000,
      "participantId": "participant-123",
      "participantName": "Juan Pérez"
    }
  ],
  "participants": [
    {
      "id": "participant-123",
      "name": "Juan Pérez"
    }
  ],
  "timestamp": "2024-02-14T16:20:45.000Z"
}
```

## Uso

1. **Iniciar una reunión de Google Meet**:
   - Navega a `meet.google.com` y únete a una reunión

2. **Abrir el popup de la extensión**:
   - Haz clic en el icono de la extensión en la barra de herramientas

3. **Iniciar grabación**:
   - Haz clic en "Start Recording"
   - El estado cambiará a "Recording"
   - Verás un contador de duración y captions

4. **Detener grabación**:
   - Haz clic en "Stop Recording"
   - Los datos se procesarán y enviarán automáticamente al endpoint

## Permisos

La extensión requiere los siguientes permisos:

- `storage`: Almacenar configuración y estado
- `scripting`: Inyectar scripts en páginas
- `tabs`: Acceder a información de pestañas
- `notifications`: Mostrar notificaciones
- `tabCapture`: Capturar audio y video de pestañas
- `offscreen`: Crear documentos offscreen para procesamiento
- `webRequest`: Interceptar peticiones de red
- `webRequestBlocking`: Modificar peticiones interceptadas
- `<all_urls>`: Acceso a todas las URLs para content scripts

## Desarrollo

### Modo desarrollo

```bash
pnpm dev
```

Esto iniciará el servidor de desarrollo con hot reload.

### Estructura del proyecto

```
chrome-extension-boilerplate-react-vite-archived/
├── chrome-extension/           # Core de la extensión
│   ├── manifest.ts            # Definición del manifest
│   └── src/background/        # Service worker
├── pages/
│   ├── content/               # Content scripts
│   │   └── src/matches/meet/  # Script específico de Google Meet
│   ├── offscreen/             # Documento offscreen
│   └── popup/                 # UI del popup
└── packages/                  # Paquetes compartidos
```

### Agregar nuevas funcionalidades

#### Procesar captions con protobuf

Actualmente, la extensión hace una decodificación básica de los mensajes protobuf. Para una decodificación completa:

1. Obtén el schema protobuf de Google Meet
2. Instala `protobufjs`
3. Actualiza `handleProtobufData` en `background/index.ts`:

```typescript
import protobuf from 'protobufjs';

// Carga el schema
const root = await protobuf.load('meet-schema.proto');
const CaptionMessage = root.lookupType('meet.Caption');

// Decodifica el mensaje
const message = CaptionMessage.decode(uint8Array);
const caption = CaptionMessage.toObject(message);
```

#### Habilitar conversión a MP4

En `pages/offscreen/src/index.ts`, descomenta la función `convertToMp4()` y su llamada en `processRecording()`:

```typescript
// Descomentar estas líneas
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

// En processRecording():
await convertToMp4(blob);
```

## Troubleshooting

### La grabación no inicia

1. Verifica que estás en una página de Google Meet
2. Revisa la consola del background script (en `chrome://extensions/`)
3. Asegúrate de tener permisos de micrófono y cámara

### Los captions no se capturan

1. Los captions deben estar activos en Google Meet
2. Verifica la consola del content script
3. Los selectores del DOM pueden cambiar - actualiza `extractParticipantInfo()`

### Errores de build

```bash
# Limpiar y reinstalar
pnpm clean
pnpm install
pnpm build
```

## Seguridad

⚠️ **Importante**: Esta extensión requiere permisos amplios. Asegúrate de:

- Revisar y limitar los `host_permissions` en producción
- No compartir credenciales en el código
- Validar datos antes de enviarlos al servidor
- Cumplir con políticas de privacidad de Google Meet

## Limitaciones conocidas

- La decodificación de protobuf es básica y puede requerir el schema completo
- La conversión a MP4 con ffmpeg.wasm puede ser lenta en videos largos
- Los selectores del DOM de Google Meet pueden cambiar sin previo aviso
- Requiere que los captions estén activos en Meet para capturarlos

## Contribuir

Las contribuciones son bienvenidas. Por favor:

1. Fork el repositorio
2. Crea una rama para tu feature
3. Commit tus cambios
4. Push a la rama
5. Abre un Pull Request

## Licencia

MIT

## Soporte

Para problemas o preguntas, abre un issue en GitHub.
