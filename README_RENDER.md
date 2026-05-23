# Deploy to Render

This workspace contains two separate services:

- `whatsapp-reminders-backend`: Node/Express + `whatsapp-web.js` backend.
- `whatsapp-reminders-frontend`: Vite React frontend.

## Render setup

1. Push this repo to a Git provider (GitHub, GitLab, Bitbucket).
2. Create a Render account and connect the repo.
3. Import the `render.yaml` file in the repo root.

## What is configured

### Backend service

- `root`: `whatsapp-reminders-backend`
- `buildCommand`: `npm install`
- `startCommand`: `npm start`
- `HOST`: `0.0.0.0`
- `PORT`: `3177`
- `WHATSAPP_REMINDERS_DATA_DIR`: `/tmp/whatsapp-reminders-data`

### Frontend service

- `root`: `whatsapp-reminders-frontend`
- `buildCommand`: `npm install && npm run build`
- `publishPath`: `dist`
- `VITE_API_BASE_URL`: `https://whatsapp-reminders-backend.onrender.com`

> Replace the placeholder backend URL with the actual Render backend URL after deployment.

## Notes for testing

- The backend is configured to listen on all interfaces so it can be reached from other machines.
- The frontend can point to the backend URL via `VITE_API_BASE_URL`.
- Because Render uses ephemeral filesystem, WhatsApp session data may not persist across deploys or service restarts.

## Local env override

If you want to test locally with the same settings, use:

```bash
cd whatsapp-reminders-backend
HOST=0.0.0.0 PORT=3177 node index.js
```
