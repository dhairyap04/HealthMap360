# HealthMap360 frontend

React + TypeScript + Vite workspace. See the [project README](../README.md) for complete setup, roles, data contracts, deployment and checks.

```bash
npm ci
npm run dev
```

Requires Node 22.12+. The development server proxies `/api` to `http://127.0.0.1:8000`. Override with `API_PROXY_TARGET`; use `VITE_API_URL` at build time for a separately hosted API.

```bash
npm run build
npm run lint
npm run format:check
npm test
npx playwright install chromium
npm run test:e2e
```
