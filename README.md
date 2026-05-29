# LeadScraper Pro

> A production-grade lead scraping and enrichment platform — search Google Maps in real-time, extract contact information through a intelligent two-pass enrichment engine with Cloudflare bypass, score and manage leads in a modern Apollo.io-inspired UI.

<div align="center">

![Tech Stack](https://img.shields.io/badge/Next.js-14-black?logo=next.js)
![Tech Stack](https://img.shields.io/badge/Tailwind_CSS-3.4-38bdf8?logo=tailwindcss)
![Tech Stack](https://img.shields.io/badge/Express-4-000000?logo=express)
![Tech Stack](https://img.shields.io/badge/Node.js-24-339933?logo=node.js)
![Tech Stack](https://img.shields.io/badge/WebSocket-Streaming-010101?logo=socket.io)
![Tech Stack](https://img.shields.io/badge/Puppeteer-25-40B5A4?logo=puppeteer)
![Tech Stack](https://img.shields.io/badge/SQLite-WAL-003B57?logo=sqlite)
![Tech Stack](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker)

</div>

---

## Table of Contents

- [Features](#-features)
- [Screens & Routes](#-screens--routes)
- [Architecture](#-architecture)
- [Tech Stack](#-tech-stack)
- [Quick Start](#-quick-start)
  - [Development Mode](#development-mode)
  - [Docker (Production)](#docker-production)
- [API Reference](#-api-reference)
  - [REST Endpoints](#rest-endpoints)
  - [WebSocket Protocol](#websocket-protocol)
- [Enrichment Engine](#-enrichment-engine)
  - [Pass 1: Standard Enrichment](#pass-1-standard-enrichment)
  - [Pass 2: FlareSolverr Bypass](#pass-2-flaresolverr-bypass)
  - [Deep Directory Lookup](#deep-directory-lookup)
- [Configuration](#-configuration)
  - [Environment Variables](#environment-variables)
  - [Required Services](#required-services)
- [Deployment](#-deployment)
  - [VPS Setup (Ubuntu)](#vps-setup-ubuntu)
  - [Docker Compose](#docker-compose)
  - [Nginx Reverse Proxy](#nginx-reverse-proxy)
- [Data Persistence](#-data-persistence)
- [Troubleshooting](#-troubleshooting)
- [Development Notes](#-development-notes)

---

## ✨ Features

### Core Lead Finding
- **Google Maps Browser Search** — Real headless Chrome (Puppeteer) scrapes Google Maps listings: business name, address, rating, review count, and website
- **Keyword + Location Search** — Search any business category in any city/region
- **Radius Targeting** — Restrict results to a km radius around a specific street address
- **Country Selector** — Country-aware directory lookups (US, UK, Canada, Australia, Spain, EU)
- **Real-Time Streaming** — Leads appear in the table as they're found via WebSocket — no page refresh needed
- **Aggressive Scrolling** — Automatic feed scrolling with exponential scroll passes to collect hundreds of results per search

### Waterfall Enrichment Engine (Two-Pass)

The enrichment engine uses a strict multi-tier strategy:

**Pass 1 — Standard Enrichment:**
1. **Google Search** — Find the best matching business website via Google
2. **Website Scrape** — Scrape homepage, `/contact`, `/about`, `/contact-us`, and `/about-us` pages using:
   - Fast HTTP fetch (cheerio) 
   - Headless Chrome CDP fallback for JS-rendered sites
3. **Directory Lookup** — Query Google Maps detail pages for phone + website via Puppeteer

**Pass 2 — FlareSolverr Bypass:**
- Automatically retries leads that hit Cloudflare challenges during Pass 1
- Routes all requests through [FlareSolverr](https://github.com/FlareSolverr/FlareSolverr) to bypass Cloudflare/anti-bot protections

**Deep Directory Lookup (optional):**
Queries 10+ directory sites in parallel based on detected country:
- **Global**: Google Search, Bing Maps, Cylex, Hotfrog, Chamber of Commerce, Buzzfile, LinkedIn
- **UK**: Yell.com
- **Spain**: Páginas Amarillas
- **Canada**: Canada411, YellowPages.ca
- **Australia**: YellowPages.com.au, TrueLocal

### Data Quality
- **Deduplication** — Normalized business name + postal code dedup key
- **Token-Bucket Rate Limiting** — Per-domain rate limiter to avoid IP blocks
- **User-Agent Rotation** — 12 rotating user agents (Chrome, Firefox, Safari, Edge, mobile)
- **Request Timeouts + Retries** — 15s timeout with 2 retries and exponential backoff
- **Concurrency Control** — Enrichment processes 3 leads at a time (configurable)
- **Email Scoring** — Prefers domain-emails over generic providers (gmail, yahoo, etc.)

### UI/UX (Apollo.io Inspired)
- **Deep Navy Sidebar** — Navigation with collapse toggle, mobile hamburger menu, and sign-out
- **Search & Scrape Page** — Keyword, location, radius, and country inputs + streaming results table
- **Enrich Leads Page** — Import leads from search, batch enrich with real-time per-lead streaming, stop/clear/cancel controls
- **Lead Score Page** — Score leads by website quality, reviews, maps rank, social media presence, and responsiveness
- **Lead Kanban (Pipeline)** — Drag-and-drop lead pipeline management
- **Enriched Businesses Page** — View, manage, and re-import enriched lead groups
- **Saved Lists Page** — Persisted lead lists stored in localStorage
- **Export Footer** — Sticky bar when leads are selected: CSV export + save to lists
- **Table/Card View Toggle** — Desktop table view and mobile-friendly card view
- **Metrics Ribbon** — Real-time counters for total found, emails, phones, and fallback sites
- **Password Auth** — Simple password-based authentication
- **Copy Buttons** — One-click copy icons on phone and email fields

---

## 🖥 Screens & Routes

| Route | Page | Description |
|-------|------|-------------|
| `/` | Search & Scrape | Google Maps search with real-time streaming results |
| `/enrich` | Enrich Leads | Batch enrichment with 2-pass waterfall engine |
| `/enriched-businesses` | Enriched Businesses | View/manage saved enriched lead groups |
| `/saved-lists` | Saved Lists | Browser-local lead lists |
| `/lead-kanban` | Lead Pipeline | Kanban-style lead pipeline management |
| `/lead-score` | Lead Score | Score leads with quality metrics |
| `/analytics` | Analytics | Lead data analytics dashboard |
| `/settings` | Settings | Change app password and configuration |
| `/login` | Login | Simple password authentication screen |

---

## 🏗 Architecture

```
lead-scraper-app/
│
├── backend/                          # Node.js + Express + WebSocket API
│   ├── src/
│   │   ├── index.ts                  # Express + WebSocket server entry point
│   │   ├── store.ts                  # SQLite persistence (better-sqlite3, WAL mode)
│   │   ├── types/index.ts            # TypeScript type definitions (Lead, SearchRequest, etc.)
│   │   ├── routes/
│   │   │   ├── search.ts             # POST /api/search — trigger Google Maps search
│   │   │   ├── enrich.ts             # POST /api/enrich, /api/enrich/batch
│   │   │   ├── enrichDeep.ts         # POST /api/enrich/deep — FlareSolverr directory search
│   │   │   ├── leadScores.ts         # CRUD /api/lead-scores — scored leads persistence
│   │   │   └── enrichedGroups.ts     # CRUD /api/enriched-groups — saved lead groups
│   │   ├── services/
│   │   │   ├── googleMaps.ts         # Browser-based Google Maps scraper (Puppeteer + CDP)
│   │   │   ├── googleSearch.ts       # Google Search via headless Chrome for business websites
│   │   │   ├── scraper.ts            # HTTP website scraper (cheerio) for email/phone/socials
│   │   │   ├── browserScraper.ts     # Puppeteer-based JS-rendered website scraper
│   │   │   ├── directoryFallback.ts  # Google Maps detail panel lookup for contact info
│   │   │   ├── directoryFlare.ts     # Deep directory scraper (FlareSolverr, 10+ directories)
│   │   │   └── deduplicator.ts       # Business name + postal code dedup
│   │   ├── workers/
│   │   │   └── enrichmentWorker.ts   # Two-pass enrichment orchestration with abort support
│   │   └── utils/
│   │       ├── rateLimiter.ts        # Token-bucket rate limiter per domain
│   │       ├── userAgents.ts         # 12 rotating user agents
│   │       └── validators.ts         # Email/phone/social extraction, normalization, country detection
│   ├── Dockerfile                    # Multi-stage Docker build (node:24-alpine)
│   └── package.json
│
├── frontend/                         # Next.js 14 App Router (standalone build)
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx            # Root layout (AuthGuard, Inter font, globals.css)
│   │   │   ├── page.tsx              # Main dashboard (Search & Scrape)
│   │   │   ├── globals.css           # Tailwind + custom animations (.lead-row-enter, spinner)
│   │   │   ├── enrich/page.tsx       # Enrich Leads page with WebSocket streaming
│   │   │   ├── enriched-businesses/page.tsx
│   │   │   ├── saved-lists/page.tsx
│   │   │   ├── lead-kanban/page.tsx
│   │   │   ├── lead-score/page.tsx
│   │   │   ├── analytics/page.tsx
│   │   │   ├── settings/page.tsx
│   │   │   └── login/page.tsx
│   │   ├── components/
│   │   │   ├── Sidebar.tsx           # Navigation (desktop sidebar + mobile overlay)
│   │   │   ├── TopBar.tsx            # Search inputs (keyword, location, radius, country)
│   │   │   ├── MetricsRibbon.tsx     # Live streaming counters
│   │   │   ├── LeadsTable.tsx        # Table + card view with copy/select/badges
│   │   │   ├── ExportFooter.tsx      # Sticky CSV export + save-to-list
│   │   │   └── AuthGuard.tsx         # Simple password-based auth guard
│   │   └── lib/
│   │       ├── types.ts              # Shared TypeScript types + WS message types
│   │       └── api.ts                # REST client + WebSocket manager with auto-reconnect
│   ├── Dockerfile                    # Multi-stage Docker build (node:24-alpine)
│   ├── next.config.js                # standalone output, strict mode
│   ├── tailwind.config.ts            # Apollo.io-inspired color palette
│   └── package.json
│
├── docker-compose.yml                # Backend + Frontend + FlareSolverr services
├── Dockerfile.backend                # Backend Docker build
├── Dockerfile.frontend               # Frontend Docker build
├── .env.example                      # Environment variable template
├── package.json                      # Root workspace (concurrently)
└── README.md
```

---

## 🛠 Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | Next.js 14 (App Router) | Full-stack React framework |
| | Tailwind CSS 3.4 | Styling (Apollo.io-inspired theme) |
| | Lucide React | Icon library |
| **Backend** | Express 4 | HTTP API server |
| | ws (WebSocket) | Real-time streaming |
| | Puppeteer 25 | Headless Chrome automation (Google Maps, website scrape) |
| | Cheerio | Lightweight HTML parsing for fast HTTP scrapes |
| | better-sqlite3 | SQLite persistence (WAL mode) |
| | uuid | Unique ID generation |
| **Infrastructure** | Docker + Compose | Container orchestration |
| | FlareSolverr | Cloudflare/anti-bot bypass |
| | Chrome/Chromium | Browser engine for Puppeteer |

---

## 🚀 Quick Start

### Prerequisites

- **Node.js 20+** (recommended: Node 24)
- **npm 9+**
- **Docker + Docker Compose** (for production)
- **Chromium** (for Puppeteer — required for Google Maps scraping and enrichment)

### Development Mode

#### 1. Install Dependencies

```bash
cd lead-scraper-app

# Install backend dependencies
cd backend && npm install && cd ..

# Install frontend dependencies
cd frontend && npm install --legacy-peer-deps && cd ..

# Install root dev dependency (concurrently)
npm install
```

#### 2. Start a Chromium Instance (Required)

The backend connects to a running Chromium instance via Chrome DevTools Protocol (CDP). You need one running:

```bash
# Option A: Docker Chromium
docker run -d --rm --name chrome \
  -p 3012:3000 \
  --cap-add=SYS_ADMIN \
  ghcr.io/chromedp/docker-headless-shell:latest

# Option B: Direct install
chromium-browser --headless --no-sandbox --remote-debugging-port=3012
```

#### 3. (Optional) Start FlareSolverr

For Cloudflare bypass during enrichment (Pass 2):

```bash
docker run -d --rm --name flaresolverr \
  -p 8191:8191 \
  -e LOG_LEVEL=info \
  ghcr.io/flaresolverr/flaresolverr:latest
```

#### 4. Configure Environment

```bash
# Copy default env
cp .env.example .env

# Or use environment variables (defaults work if ports don't conflict)
export PORT=4000
export WS_PORT=4001
export CHROME_CDP_URL=ws://127.0.0.1:3012
export FLARESOLVER_URL=http://127.0.0.1:8191/v1
export NEXT_PUBLIC_API_URL=http://localhost:4000
export NEXT_PUBLIC_WS_PORT=4001
```

#### 5. Start the Development Servers

```bash
# From root — starts both backend and frontend concurrently
npm run dev
```

Or start them separately:

```bash
# Terminal 1 — Backend (port 4000, WebSocket 4001)
cd backend && npm run dev

# Terminal 2 — Frontend (port 3000)
cd frontend && npm run dev
```

#### 6. Open the App

Open **[http://localhost:3000](http://localhost:3000)** in your browser.

- Default password: `leadscraper2024`
- Default search: "Dentist" in "Austin, TX"
- Click **"Find Leads"** to start scraping Google Maps
- Watch leads stream into the table in real-time
- Navigate to **Enrich Leads** to run the enrichment engine on found leads

### Docker (Production)

```bash
# Build and start all services (backend, frontend, FlareSolverr)
docker-compose up --build -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

The app will be available at:
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:4000
- **WebSocket**: ws://localhost:4001

---

## 📡 API Reference

### REST Endpoints

All REST endpoints live on the HTTP server (default port **4000**).

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check — returns `{"status":"ok","timestamp":"..."}` |
| `GET` | `/api/leads` | List all persisted leads from SQLite |
| `DELETE` | `/api/leads` | Clear all persisted leads |
| `POST` | `/api/search` | Trigger a Google Maps search (results stream via WebSocket) |
| `POST` | `/api/enrich` | Enrich a single lead (synchronous) |
| `POST` | `/api/enrich/batch` | Batch enrich leads (streams progress via WebSocket) |
| `POST` | `/api/enrich/deep` | Deep enrich using FlareSolverr directory lookups |
| `GET` | `/api/lead-scores` | List all scored leads |
| `POST` | `/api/lead-scores` | Save scored leads (batch upsert) |
| `DELETE` | `/api/lead-scores/:id` | Remove a scored lead |
| `GET` | `/api/enriched-groups` | List saved enriched groups |
| `POST` | `/api/enriched-groups` | Save an enriched group (upsert by `listName`) |
| `DELETE` | `/api/enriched-groups/:name` | Remove an enriched group |

---

### POST /api/search

Triggers an asynchronous Google Maps search. Returns immediately with a `searchId`. Results stream to all connected WebSocket clients (or to a specific client if `clientId` is provided).

**Request:**
```json
{
  "keyword": "Dentist",
  "location": "Austin, TX",
  "country": "United States",
  "radius": 0,
  "maxResults": 500,
  "clientId": "abc12345"
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `keyword` | string | *required* | Business category/search term |
| `location` | string | *required* | City, region, or street address |
| `country` | string | `"United States"` | Country for directory lookups |
| `radius` | number | `0` | Search radius in km (0 = no radius). Requires street address in `location`. Max: 50. |
| `maxResults` | number | `500` | Maximum number of leads to collect. Max: 2000. |
| `clientId` | string | *optional* | WebSocket client ID for targeted streaming |

**Response (immediate):**
```json
{
  "success": true,
  "searchId": "a1b2c3d4e5f6",
  "status": "started",
  "message": "Searching Google Maps for \"Dentist\" in \"Austin, TX\"..."
}
```

Results stream via WebSocket as described in the [WebSocket Protocol](#websocket-protocol) section below.

---

### POST /api/enrich (single lead)

Enriches a single lead synchronously. Returns when enrichment completes.

**Request:**
```json
{
  "lead": {
    "id": "uuid",
    "businessName": "Example Dental",
    "website": "https://example.com",
    "address": "123 Main St, Austin, TX",
    ...
  }
}
```

**Response:**
```json
{
  "success": true,
  "lead": {
    "id": "uuid",
    "businessName": "Example Dental",
    "phone": "+1-512-555-0100",
    "email": "info@exampledental.com",
    "website": "https://exampledental.com",
    "sources": ["google_search", "website_scrape"],
    "enrichmentStatus": "complete",
    ...
  }
}
```

---

### POST /api/enrich/batch

Batch enrich multiple leads. Results stream via WebSocket.

**Request:**
```json
{
  "leads": [{ ...lead1 }, { ...lead2 }],
  "clientId": "abc12345"
}
```

**Response (immediate):**
```json
{
  "success": true,
  "total": 2,
  "status": "started",
  "message": "Enriching 2 leads..."
}
```

---

### POST /api/enrich/deep

Deep enrichment via FlareSolverr. Queries 10+ directory sites based on country.

**Request:**
```json
{
  "leads": [{ ...lead1 }, { ...lead2 }],
  "clientId": "abc12345"
}
```

**Response (immediate):**
```json
{
  "success": true,
  "total": 2,
  "status": "started",
  "message": "Deep enriching 2 leads through directory sites..."
}
```

---

### POST /api/lead-scores

Save scored leads in batch (upsert by ID).

**Request:**
```json
{
  "entries": [
    {
      "id": "uuid",
      "businessName": "Example Dental",
      "phone": "512-555-0100",
      "email": "info@exampledental.com",
      "website": "https://exampledental.com",
      "address": "123 Main St, Austin, TX",
      "reviewCount": 45,
      "rating": 4.5,
      "socialLinks": {},
      "scores": {
        "websiteQuality": 8,
        "reviewCount": 7,
        "googleMapsRank": 6,
        "socialMedia": 4,
        "responsiveness": 5
      },
      "totalScore": 75,
      "tier": "hot",
      "notes": "Great reviews, but no LinkedIn"
    }
  ]
}
```

---

### WebSocket Protocol

WebSocket server runs on a separate port (default **4001**). All real-time streaming is done through WebSocket messages.

#### Connection

```javascript
const ws = new WebSocket('ws://localhost:4001');

ws.onopen = () => {
  ws.send(JSON.stringify({ type: 'register', payload: {} }));
};
```

On connection, the server sends:
```json
{
  "type": "connected",
  "payload": {
    "clientId": "a1b2c3d4",
    "message": "Connected to Lead Scraper backend"
  }
}
```

#### Client → Server Messages

| Type | Payload | Description |
|------|---------|-------------|
| `register` | `{ clientId?: string }` | Register for targeted delivery. If `clientId` matches a previous search request, results will be sent to this client. |
| `search` | `{ keyword, location, country?, maxResults? }` | Trigger a Google Maps search directly via WebSocket (alternative to POST /api/search). |
| `enrich_batch` | `{ leads: Lead[] }` | Start batch enrichment. Results stream back as `lead_enriched` events. Pass `{ leads: [], signal: new AbortController() }` to support cancel. |
| `cancel_enrich` | `{}` | Stop the currently running enrichment batch. |
| `ping` | `{}` | Keepalive ping. Server responds with `pong`. |

#### Server → Client Messages

| Type | Payload | Description |
|------|---------|-------------|
| `connected` | `{ clientId, message }` | Initial welcome on connection |
| `registered` | `{ clientId }` | Confirms WebSocket registration |
| `lead_found` | `{ lead, totalFound }` | A new lead was found on Google Maps during search |
| `lead_enriched` | `{ lead, enrichedWithEmail?, phonesFound?, fallbackSitesScraped? }` | A lead was enriched (sent per-lead during batch) |
| `progress` | `{ message, totalFound? }` | Status update during search or enrichment |
| `complete` | `{ totalFound, ... }` | Search completed — all leads collected |
| `enrich_complete` | `{ totalEnriched, message }` | Enrichment batch completed |
| `enrich_cancelled` | `{ message }` | Enrichment was cancelled by user |
| `error` | `{ error }` | An error occurred |
| `pong` | `{ timestamp }` | Response to ping |

#### Example: Stream a Search

```json
// Client sends:
{
  "type": "search",
  "payload": {
    "keyword": "Plumber",
    "location": "Miami, FL",
    "country": "United States",
    "maxResults": 30
  }
}

// Server streams:
{ "type": "progress", "payload": { "message": "Searching Google Maps..." } }
{ "type": "lead_found", "payload": { "lead": {...}, "totalFound": 1 } }
{ "type": "lead_found", "payload": { "lead": {...}, "totalFound": 2 } }
...
{ "type": "complete", "payload": { "totalFound": 30, "message": "Found 30 businesses" } }
```

---

## 🔄 Enrichment Engine

### Pass 1: Standard Enrichment

Every lead submitted to `POST /api/enrich/batch` goes through this pipeline:

```
Lead Submitted
     │
     ▼
┌──────────────────┐
│ Google Search    │──── Find business website via headless Chrome
│ (findBusiness-   │     If best result is a listing site (Yelp, etc.),
│  Website)        │     open the listing page and extract the real
└──────────────────┘     business website URL + email
     │
     ▼ (2-4s human delay)
┌──────────────────┐
│ Website Scrape   │──── Fast HTTP scrape (cheerio) of homepage +
│ (scraper.ts)     │     /contact, /about, /contact-us, /about-us
└──────────────────┘     Extracts emails, phones, social links (LinkedIn,
     │                    Facebook, Instagram, Twitter)
     │
     ├── If no data ──► Chrome CDP scrape for JS-rendered sites
     ▼ (3-5s human delay)
┌──────────────────┐
│ Directory Lookup │──── Open Google Maps detail pages via Puppeteer
│ (directory-      │     for each business. Extracts phone + website
│  Fallback)       │     from the info panel.
└──────────────────┘
     │
     ▼
┌──────────────────┐
│ Email Selection  │──── Prefers same-domain as business website.
│ (pickMainEmail)  │     Falls back to generic providers (gmail, yahoo),
│                  │     then first available.
└──────────────────┘
     │
     ▼
  Lead Complete (or "cloudflare lock")
```

**Concurrency:** 3 leads at a time (configurable).  
**Timeout:** 90 seconds per lead.  
**Human-like delays:** Random 2-6s pauses between steps to avoid rate limiting.

### Pass 2: FlareSolverr Bypass

Leads that get `enrichmentError === 'cloudflare lock'` in Pass 1 are automatically retried through FlareSolverr:

```
Leads with "cloudflare lock"
     │
     ▼ (5-10s human delay)
┌──────────────────┐
│ FlareSolverr     │──── Routes homepage + /contact + /about through
│ Website Scrape   │     FlareSolverr's headless browser (rotating IP,
│ (scrapeWebsite-  │     Cloudflare bypass)
│  ThroughFlare)   │
└──────────────────┘
     │
     ▼
  Lead Complete or Failed
```

**Concurrency:** Same as Pass 1.  
**Timeout:** 60 seconds per lead for FlareSolverr.  
**Source tag:** `flare_bypass` on successfully enriched leads.

### Deep Directory Lookup

The deep enrichment endpoint `/api/enrich/deep` runs all directory searches in parallel per lead:

```
                    ┌──────────────┐
                    │  Cylex (EU)  │
                    ├──────────────┤
                    │  Hotfrog     │
                    ├──────────────┤
                    │ Chamber of   │
                    │ Commerce (US)│
                    ├──────────────┤
                    │  Buzzfile    │
                    ├──────────────┤
          ┌────────►│ Google       │
          │         │ Search       │
          │         ├──────────────┤
          │         │  Bing Maps   │
          │         ├──────────────┤
          │         │  LinkedIn    │
          │         │ (via Google) │
          │         ├──────────────┤
          │         │ Yell (UK)    │◄── Only if country=UK
          │         ├──────────────┤
          │         │ Páginas      │◄── Only if country=Spain
          │         │ Amarillas    │
          │         ├──────────────┤
          │         │ Canada411    │◄── Only if country=Canada
          │         │ + YPCa       │
          │         ├──────────────┤
          │         │ YPAU +       │◄── Only if country=Australia
          │         │ TrueLocal    │
          └────────┴──────────────┘

Best result selected by scoring:
  email=10 points, phone=5 points, website=1 point
```

---

## ⚙️ Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| **Backend** | | |
| `PORT` | `4000` | Backend HTTP API server port |
| `WS_PORT` | `4001` | WebSocket server port (separate from HTTP) |
| `CHROME_CDP_URL` | `ws://127.0.0.1:3012` | Chrome DevTools Protocol endpoint. A headless Chromium instance must be running at this address. |
| `FLARESOLVER_URL` | `http://127.0.0.1:8191/v1` | FlareSolverr API endpoint for Cloudflare bypass |
| `DATA_DIR` | `/app/data` | Directory for SQLite database files (persistent data) |
| `NODE_ENV` | `production` | Node environment (affects Express error handling) |
| **Frontend** | | |
| `PORT` | `3000` | Frontend HTTP server port |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | Backend API URL for the frontend client |
| `NEXT_PUBLIC_WS_PORT` | `4001` | Backend WebSocket port |
| `NEXT_TELEMETRY_DISABLED` | `1` | Disable Next.js telemetry |
| **Application** | | |
| `app-password` (localStorage) | `leadscraper2024` | Default password for UI authentication |

### Required Services

| Service | Port | Purpose |
|---------|------|---------|
| Chromium/Chrome (headless) | `3012` | Puppeteer connects here for Google Maps scraping, Google Search, website JS rendering |
| FlareSolverr (optional) | `8191` | Cloudflare bypass for deep directory lookups and blocked websites |

---

## 🚢 Deployment

### VPS Setup (Ubuntu)

#### 1. Install Dependencies

```bash
# Docker + Compose
curl -fsSL https://get.docker.com | sh
sudo systemctl enable --now docker

# Node.js 24 (for local dev/testing)
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo bash -
sudo apt-get install -y nodejs

# Git
sudo apt-get install -y git
```

#### 2. Clone & Build

```bash
git clone https://github.com/your-org/lead-scraper-app.git
cd lead-scraper-app
cp .env.example .env
# Edit .env with your production values
```

#### 3. Docker Compose

```bash
# Build and run all services
docker-compose up --build -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f
```

### Docker Compose

```yaml
services:
  backend:
    build:
      context: .
      dockerfile: Dockerfile.backend
    container_name: lead-scraper-backend
    network_mode: "host"
    volumes:
      - /root/steves-dev/lead-scraper-data:/app/data
    environment:
      - PORT=4000
      - WS_PORT=4001
      - NODE_ENV=production
      - CHROME_CDP_URL=ws://127.0.0.1:3012
      - FLARESOLVER_URL=http://127.0.0.1:8191/v1
    restart: unless-stopped

  flaresolverr:
    image: ghcr.io/flaresolverr/flaresolverr:latest
    container_name: lead-scraper-flaresolverr
    network_mode: "host"
    environment:
      - LOG_LEVEL=info
      - CAPTCHA_SOLVER=none
    restart: unless-stopped

  frontend:
    build:
      context: .
      dockerfile: Dockerfile.frontend
    container_name: lead-scraper-frontend
    network_mode: "host"
    environment:
      - PORT=3000
      - NEXT_PUBLIC_API_URL=http://localhost:4000
      - NEXT_TELEMETRY_DISABLED=1
    depends_on:
      - backend
    restart: unless-stopped
```

> **Note:** `network_mode: "host"` is used so containers can communicate via `localhost` (required for Chrome CDP and FlareSolverr access). On Linux, host networking is well-supported.

#### 4. Run Chromium Separately

The Puppeteer-based scraping requires a shared Chromium instance. Run it on the host:

```bash
# Using Docker (recommended)
docker run -d --restart unless-stopped --name chrome --network host \
  ghcr.io/chromedp/docker-headless-shell:latest

# Or with puppeteer's bundled Chromium
docker run -d --restart unless-stopped --name chrome --network host \
  --cap-add=SYS_ADMIN \
  zenika/alpine-chrome:latest \
  chromium-browser --headless --no-sandbox --remote-debugging-address=0.0.0.0 --remote-debugging-port=3012
```

### Nginx Reverse Proxy

For production with a domain name, set up Nginx as a reverse proxy:

```nginx
server {
    listen 80;
    server_name leads.example.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name leads.example.com;

    ssl_certificate /etc/letsencrypt/live/leads.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/leads.example.com/privkey.pem;

    # Frontend
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket proxy
    location /ws {
        proxy_pass http://127.0.0.1:4001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }

    # Backend API
    location /api/ {
        proxy_pass http://127.0.0.1:4000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

---

## 💾 Data Persistence

The application uses **SQLite** (via `better-sqlite3`) for persistent data storage.

### Database Schema

The SQLite database file (`leads.db`) is stored in the `DATA_DIR` directory (default: `/app/data`). It contains three tables:

#### `leads` table

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER (PK) | Auto-increment ID |
| `business_name` | TEXT (NOT NULL) | Business name |
| `address` | TEXT | Full address |
| `phone` | TEXT | Phone number |
| `email` | TEXT | Email address |
| `website` | TEXT | Website URL |
| `rating` | REAL | Google Maps star rating |
| `reviews` | INTEGER | Review count |
| `category` | TEXT | Business category |
| `source` | TEXT | Original source |
| `enriched_phone` | TEXT | Phone from enrichment |
| `enriched_email` | TEXT | Email from enrichment |
| `city` | TEXT | City parsed from address |
| `country` | TEXT | Country |
| `zip_code` | TEXT | ZIP/postal code |
| `social_links` | TEXT | JSON array of social links |
| `sources` | TEXT | JSON array of source objects |
| `enrichment_status` | TEXT | Current enrichment status |
| `enrichment_error` | TEXT | Error message if enrichment failed |
| `raw_data` | TEXT | JSON blob of raw scraped data |
| `created_at` | TEXT (datetime) | Insert timestamp |
| `updated_at` | TEXT (datetime) | Last update timestamp |

**Unique index:** `(business_name, address)`

#### `lead_scores` table

Stores scored leads for the Lead Score page.

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (PK) | UUID |
| `business_name` | TEXT | Business name |
| `phone`, `email`, `website`, `address` | TEXT | Contact info |
| `review_count` | INTEGER/null | Google Maps review count |
| `rating` | REAL/null | Google Maps star rating |
| `social_links` | TEXT | JSON object of social links |
| `website_quality` | INTEGER (0-10) | Website quality score |
| `review_score` | INTEGER (0-10) | Review quality score |
| `maps_rank` | INTEGER (0-10) | Google Maps ranking score |
| `social_score` | INTEGER (0-10) | Social media presence score |
| `resp_score` | INTEGER (0-10) | Responsiveness score |
| `total_score` | INTEGER (0-40) | Sum of all scores |
| `tier` | TEXT | Tier: hot/warm/cold/lead |
| `notes` | TEXT | User notes |
| `created_at`, `updated_at` | TEXT | Timestamps |

#### `enriched_groups` table

Stores saved enriched lead groups.

| Column | Type | Description |
|--------|------|-------------|
| `list_name` | TEXT (PK) | Group/list name |
| `leads` | TEXT | JSON array of lead objects |
| `enriched_at` | TEXT | When enrichment completed |
| `updated_at` | TEXT | Last update timestamp |

### Backups

To backup the database:

```bash
# SQLite is file-based — just copy the WAL files atomically
sqlite3 /app/data/leads.db ".backup /backup/leads-$(date +%Y%m%d).db"
```

Or add a cron job:

```bash
0 3 * * * sqlite3 /app/data/leads.db ".backup /backup/leads-$(date +\%Y\%m\%d).db"
```

---

## 🔧 Troubleshooting

### Common Issues

#### WebSocket Connection Failed

**Symptom:** "WS reconnecting" message in the status bar; leads don't stream.

**Causes:**
- Backend not running on the expected port
- Firewall blocking port 4001
- Wrong `NEXT_PUBLIC_WS_PORT` in `.env`
- Browser using HTTPS while backend serves WS (non-wss)

**Solutions:**
```bash
# Verify backend is running
curl http://localhost:4000/api/health

# Check WebSocket port is listening
ss -tlnp | grep 4001

# Frontend uses same-host logic: if served via HTTPS,
# it will use WSS. Ensure your proxy handles this.
```

#### Chrome CDP Connection Error

**Symptom:** `[GMaps] Error: Cannot connect to Chrome CDP` — search returns empty results.

**Causes:**
- Chromium not running
- Wrong `CHROME_CDP_URL` in environment
- Port 3012 not accessible

**Solutions:**
```bash
# Verify Chromium is running
curl http://127.0.0.1:3012/json/version

# Ensure Chromium started with --remote-debugging-port=3012
docker ps | grep chrome
```

#### Cloudflare Block on Websites

**Symptom:** Leads marked as `cloudflare_locked` or enrichment status "failed" with Cloudflare errors.

**Solutions:**
1. **Install FlareSolverr:** The app is designed to retry blocked leads through FlareSolverr automatically in Pass 2.
2. **Install FlareSolverr manually:**
   ```bash
   docker run -d --restart unless-stopped --name flaresolverr -p 8191:8191 \
     ghcr.io/flaresolverr/flaresolverr:latest
   ```
3. **Set `FLARESOLVER_URL`** in your environment.
4. Or use the "Deep Enrich" button on the Enrich page to route through FlareSolverr directly.

#### Google Maps Rate Limiting

**Symptom:** Fewer results than expected; "collected X/Y" logs stop increasing.

**Solutions:**
- The app already includes random human-like delays (2-5s between scrolls)
- Add residential proxies or rotate IPs for production use
- The rate limiter is per-domain; reduce concurrency for slow networks

#### No Results Found

**Symptom:** Empty results from Google Maps search.

**Solutions:**
- Check that Chromium is running and accessible at `CHROME_CDP_URL`
- Verify your search keyword isn't too specific
- Try a different location (Google Maps blocks certain VPN IPs)
- Check Chromium logs: `docker logs chrome`
- Google Maps may present a CAPTCHA or cookie consent page — the app handles these but may need updates for new Google UI changes

#### Docker Build Fails

**Symptom:** `docker-compose up --build` fails with npm errors.

**Solutions:**
```bash
# Rebuild without cache
docker-compose build --no-cache

# Check Node version in Dockerfile matches your system
# The frontend uses --legacy-peer-deps for compatibility

# If puppeteer download fails during Docker build, the backend
# uses an external Chromium, so puppeteer won't download its own.
# Ensure the backend package.json has PUPPETEER_SKIP_DOWNLOAD=true.
```

#### Database Issues

**Symptom:** Leads not persisting; errors in logs with "SQLITE_BUSY" or "database is locked".

**Solutions:**
- The app uses WAL mode (Write-Ahead Logging) for concurrent access
- Ensure `DATA_DIR` mount is correct: `ls -la /app/data/`
- Check disk space: `df -h /app/data`
- If database is corrupted: `sqlite3 /app/data/leads.db "PRAGMA integrity_check;"`
- Restore from backup if needed

#### Enrichment Timeout

**Symptom:** "Lead enrichment timed out after 90s" in logs.

**Solutions:**
- Reduce batch size (try 5-10 leads at a time)
- Check internet connectivity to external sites
- FlareSolverr can be slow for Cloudflare-heavy sites; reduce concurrency to 2
- Increase timeout by modifying `enrichmentWorker.ts` if needed

---

## 📄 Development Notes

### Adding a New Directory Source

1. Create a new search function in `backend/src/services/directoryFlare.ts` following the existing pattern (e.g., `searchYell`)
2. Add it to the `findInDirectoriesDeep()` function with appropriate country targeting
3. Add the source type to `types/index.ts` `LeadSource.type` union

### Customizing the Enrichment Pipeline

The enrichment logic lives in `backend/src/workers/enrichmentWorker.ts`:

- `enrichLead()` — Single lead enrichment (Pass 1)
- `enrichWithFlare()` — FlareSolverr retry (Pass 2)
- `enrichLeadBatch()` — Batch orchestration with concurrency control, abort support, and two-pass logic

### Modifying the UI Theme

The Apollo.io-inspired color palette is in `frontend/tailwind.config.ts`:

```typescript
colors: {
  'accent': { 50: '#e6f0ff', ..., 500: '#0061FF', ... },
  'sidebar': { DEFAULT: '#0f172a', hover: '#1e293b', active: '#1e3a5f' },
}
```

### Building for Production

```bash
# Backend
cd backend && npm run build
# Output: backend/dist/

# Frontend
cd frontend && npm run build
# Output: frontend/.next/standalone/ (includes server.js)
```

---

## License

MIT — Built for internal lead generation operations.
