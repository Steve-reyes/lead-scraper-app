# Lead Scraper App — Status

**Date:** 2026-05-20
**Built by:** Kulas (fullstack-webdev agent)

## What's Done

### Backend (Node.js/TypeScript)
- Express server on port 4000 (configurable via `PORT` env)
- WebSocket server for live streaming leads (port 4001 via `WS_PORT`)
- Google Maps search service (stub — needs API key)
- Directory fallback service (Yelp, YellowPages, Yell stubs)
- Website email/social scraper service
- Deduplicator (Business Name + Postal Code normalization)
- Enrichment worker with background queue
- Rate limiter + user-agent rotation
- CORS configured for localhost:3000/3001
- **Boots clean** — `npm install && PORT=4000 npx tsx src/index.ts`
- Health endpoint: `GET /api/health → {"status":"ok"}`

### Frontend (Next.js 14 + Tailwind + Lucide)
- Apollo.io-inspired dark sidebar + light main panel
- TopBar: Keyword, Location inputs + Find Leads button + country dropdown
- MetricsRibbon: 4 live counters (Total, Emails, Phones, Fallbacks)
- LeadsTable: Checkbox, Name, Category, Phone, Email (copy), Website, Source badges, Enrichment status
- ExportFooter: Sticky on row selection with CSV export + Save to List
- **Compiled** — `npm run build` succeeded
- **Standalone output** in `.next/standalone/`

## What Needs Work

### Backend
- [ ] Google Maps API key — service is a stub, no actual Places API calls
- [ ] Yelp API integration — directoryFallback.ts has placeholder HTTP calls
- [ ] YellowPages scraper — same, needs real selectors
- [ ] Yell (UK) scraper — same
- [ ] Website scraping needs more robust email regex + social handle extraction
- [ ] WebSocket auth/security
- [ ] Error handling in enrichment worker
- [ ] Rate limiter needs configurable thresholds

### Frontend
- [ ] Real-time SSE/WebSocket integration with backend (api.ts has fetch stubs, not wired)
- [ ] Saved Lists page (empty layout exists)
- [ ] Export History page (empty)
- [ ] API/Settings page (empty)
- [ ] Loading states / spinners for row enrichment
- [ ] Copy-to-clipboard buttons need actual clipboard API calls
- [ ] CSV export needs to call backend or generate client-side

### Infrastructure
- [ ] Dockerfile / docker-compose
- [ ] Environment variable configuration (.env.example)
- [ ] Production deployment guide

## How to Run

```bash
# Backend
cd backend
npm install
PORT=4000 npx tsx src/index.ts

# Frontend (dev)
cd frontend
npm install --legacy-peer-deps
npm run dev

# Frontend (prod)
cd frontend
npm run build
PORT=3000 node .next/standalone/server.js
```

Backend runs on port 4000 (avoid port 3001 — used by OpenClaw gateway).
Frontend runs on port 3000.

## Kulas Notes
- Model kept hitting context execution limits during large file generation
- Both spawn attempts failed mid-execution (6m18s and 1m37s)
- Code is structurally complete but service stubs need real API integrations
