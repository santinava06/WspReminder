# WhatsApp Reminders

Aplicación para enviar recordatorios masivos a grupos de WhatsApp desde el navegador. Backend con Baileys (sin Chrome/Puppeteer), frontend en React + Vite.

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | React 19, TypeScript, Vite, Tailwind v4, cmdk |
| Backend | Node.js, Express, Baileys (WhatsApp Web API) |
| Base de datos | SQLite (sesiones, historial, programaciones) |

## Arquitectura

```
Frontend (Vercel) ──HTTPS──▶ Cloudflare Tunnel ──▶ Backend (PC local :9090)
                                                        │
                                                        └── Baileys (WhatsApp Web)
```

El backend corre **directamente en tu PC** con Baileys integrado. Ya no se necesita Render ni bridges separados. Las sesiones de WhatsApp persisten en disco local.

## Estructura

```
whatsapp-reminders-backend/   # API Express + Baileys
  index.js                    # Servidor, rutas, middleware auth
  app.js                      # Router de sesión (envío, grupos, QR)
  auth.js                     # 8 usuarios hardcodeados, tokens hash
  sessionManager.js           # Gestión de sesiones Baileys
  scheduler.js                # Mensajes programados
  history.js                  # Historial de envíos

whatsapp-reminders-frontend/  # SPA React
  src/
    App.tsx                   # Shell principal
    components/
      LoginPage.tsx           # Login con estilos minimalistas
      AdminPanel.tsx          # Panel admin (monitoreo + configuración)
      GroupList.tsx           # Lista de grupos
      CommandPalette.tsx      # Paleta de comandos (Cmd+K)
      ScheduleModal.tsx       # Programar envíos
      ScheduledPanel.tsx      # Panel de programados
      SendConfirmationModal.tsx
      Titlebar.tsx
    hooks/
      useSettings.ts          # Tema, densidad, color accent, blur
      useGroups.ts
      useSendHistory.ts
      useScheduledMessages.ts
    api.ts                    # apiFetch wrapper con auto-logout
```

## Usuarios

| Usuario | Contraseña | Sesión | Display name |
|---------|-----------|--------|-------------|
| admin | Admin2024! | admin | Admin |
| erika | 1234 | erika | Erika |
| melina | 1234 | melina | Melina |
| yanina | 1234 | yanina | Yanina |
| julieta | 1234 | julieta | Julieta |
| academico1 | Acad1#2024 | academico-1 | Académico 1 |
| in | IN#2024 | in | IN |
| luciana | in2024 | luciana | Luciana |

> Solo el usuario **admin** puede acceder al panel de administración.

## Inicio rápido

```bash
# Iniciar backend + tunnel
cd whatsapp-reminders-backend
npm install
npm start             # http://localhost:9090

# Frontend (otra terminal)
cd whatsapp-reminders-frontend
npm install
npm run dev           # http://localhost:5173
```

### Variables de entorno

**.env en whatsapp-reminders-backend/:**
- `PORT` — puerto del servidor (default: 9090)
- `ALLOWED_ORIGINS` — orígenes CORS permitidos
- `LOG_LEVEL` — nivel de log: debug, info, warn, error
- `HOST` — interfaz de red (default: 0.0.0.0)
- `WHATSAPP_REMINDERS_DATA_DIR` — directorio de datos

**Frontend (Vercel):**
- `VITE_API_BASE_URL` — URL del backend via tunnel (default: `http://localhost:9090`)<br>
  En producción: `https://bridge.wspreminder.online`

## Funcionalidades

### Envío de recordatorios
- Individual, múltiple (selección) o masivo (todos los grupos)
- Adjuntar imágenes a los mensajes
- Delay configurable entre envíos
- Cancelación en vivo
- Reintento de grupos fallidos

### Programación
- Programar envíos para una fecha futura
- El scheduler verifica cada 10 segundos si hay mensajes pendientes
- Persistencia en archivo JSON (sobrevive reinicios)

### Sesión WhatsApp
- Login por QR (se genera automáticamente)
- Reconexión automática en caso de desconexión
- Desconexión manual desde la app

### Panel de administración (solo admin)
- **Usuarios**: estado de conexión de cada sesión, desconexión remota
- **Historial**: todos los envíos de todos los usuarios, filtro por usuario
- **Programados**: mensajes agendados de todas las sesiones
- **Estadísticas**: totales, tasa de éxito, desglose por usuario
- **Configuración**: URL del backend, delay, apariencia (tema, densidad, color accent, blur)

### Historial local
- Cada envío se guarda en el navegador (localStorage)
- El admin ve además el historial del servidor (todos los usuarios)

### Autenticación
- Tokens determinísticos (SHA-256 de `usuario:contraseña:salt`)
- Sin dependencias externas de auth
- Bearer token en todas las rutas (excepto `/api/login`)

## API

### Endpoints públicos
- `POST /api/login` — login

### Endpoints autenticados
- `GET /debug` — estado de la sesión actual
- `GET /sessions` — resumen de sesión
- `GET /sessions/:id/status` — estado WhatsApp
- `GET /sessions/:id/qr` — QR actual
- `GET /sessions/:id/groups` — grupos disponibles
- `POST /sessions/:id/send-group-reminder`
- `POST /sessions/:id/send-all-group-reminders`
- `POST /sessions/:id/send-selected-group-reminders`
- `POST /sessions/:id/disconnect` — desconectar WhatsApp
- `GET /sessions/:id/scheduled` — programados
- `POST /sessions/:id/scheduled` — crear programado
- `DELETE /sessions/:id/scheduled/:msgId`

### Endpoints admin-only
- `GET /admin/users` — lista de usuarios con estado
- `GET /admin/history` — historial completo
- `GET /admin/scheduled` — todos los programados
- `GET /admin/stats` — estadísticas agregadas
- `POST /admin/disconnect/:sessionId` — desconectar cualquier sesión

## Producción (Vercel + Tunnel)

Arquitectura simplificada: Frontend en Vercel, backend en tu PC expuesto via Cloudflare Tunnel.

URL fija del tunnel:

```text
https://bridge.wspreminder.online
```

### Iniciar backend local

```powershell
cd C:\Users\santi\Desktop\Escencial\WspReminder\whatsapp-reminders-backend
npm run local:stack
```

Esto inicia:
1. Backend en `http://localhost:9090`
2. Cloudflare Tunnel apuntando a `localhost:9090`

### Para apagar

```powershell
npm run local:stack:stop
```

### Chequeos rápidos

```powershell
# Health del backend directo
curl.exe http://localhost:9090/health

# Health via tunnel (público)
curl.exe https://bridge.wspreminder.online/health

# Login
curl.exe -X POST https://bridge.wspreminder.online/api/login -H "Content-Type: application/json" -d "{\"username\":\"admin\",\"password\":\"Admin2024!\"}"
```

### Variables en Vercel (frontend)

| Variable | Valor |
|----------|-------|
| `VITE_API_BASE_URL` | `https://bridge.wspreminder.online` |

## Notas

- Baileys no necesita Chrome, funciona en free tiers (Render, Railway, etc.)
- Los datos de sesión persisten en disco (`WHATSAPP_REMINDERS_DATA_DIR`)
- En entornos efímeros (Render free), las sesiones se pierden al reiniciar el servicio
- WhatsApp bloquea IPs de datacenter para vincular dispositivos nuevos (el QR se muestra pero puede fallar al escanear)
