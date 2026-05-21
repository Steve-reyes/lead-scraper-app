# LeadScraper Pro

A modern, production-ready lead scraping web application inspired by the Apollo.io aesthetic. Find local business leads with an intelligent Waterfall Enrichment engine that automatically discovers emails, phone numbers, and social profiles.

![Tech Stack](https://img.shields.io/badge/Next.js-14-black?logo=next.js)
![Tech Stack](https://img.shields.io/badge/Tailwind_CSS-3.4-38bdf8?logo=tailwindcss)
![Tech Stack](https://img.shields.io/badge/Node.js-20-339933?logo=node.js)
![Tech Stack](https://img.shields.io/badge/WebSocket-Streaming-010101?logo=socket.io)

---

## ✨ Features

### Core Lead Finding
- **Keyword + Location Search** — Find local businesses by keyword and city
- **Country Selector** — Target specific countries for localized results
- **Real-Time Streaming** — Leads appear in the table as they're found, no page refresh needed

### Waterfall Enrichment Engine
The app uses a strict three-tier enrichment strategy:

1. **Primary Source (Google Maps)** — Extracts name, address, rating, phone, and website
2. **Website Scrape Fallback** — If no email/socials found, automatically scrapes the business website's homepage, `/contact`, and `/about` pages
3. **Directory Fallback** — If no phone, website, or email at all, queries:
   - **Global/US**: Yelp, YellowPages
   - **UK-specific**: Yell (Yell.com)
   - Matches by normalized business name + city

### Data Quality
- **Deduplication** — Uses normalized business name + postal code
- **Rate Limiting** — Token-bucket rate limiter per-domain to avoid blocks
- **User-Agent Rotation** — 12 rotating user agents for anti-bot evasion

### UI/UX (Apollo.io Inspired)
- **Deep Navy Sidebar** with navigation, credits indicator, collapse toggle
- **Metrics Ribbon** — Real-time counters: Total Found, Enriched with Email, Phones Found, Fallback Sites Scraped
- **Feature-Rich Data Table** — Selection checkboxes, copy buttons, source badges, enrichment status indicators, star ratings
- **Sticky Export Footer** — Appears when leads are selected. Export to CSV or Save to Lists
- **Streaming Progress** — Visual loading spinners during enrichment with incremental row updates
- **Empty State** — Helpful guidance when no search has been run

---

## 🏗 Architecture

```
lead-scraper-app/
├── backend/                    # Node.js/TypeScript API Server
│   ├── src/
│   │   ├── index.ts            # Express + WebSocket server entry
│   │   ├── types/              # TypeScript type definitions
│   │   ├── routes/             # REST API routes (/api/search, /api/enrich)
│   │   ├── services/
│   │   │   ├── googleMaps.ts   # Primary data source (Google Maps)
│   │   │   ├── scraper.ts      # Website scraping (#contact, #about)
│   │   │   ├── directoryFallback.ts  # Yelp, YellowPages, Yell
│   │   │   └── deduplicator.ts # Business dedup by name+postal
│   │   ├── workers/
│   │   │   └── enrichmentWorker.ts   # Waterfall orchestration
│   │   └── utils/
│   │       ├── rateLimiter.ts  # Token-bucket rate limiter
│   │       ├── userAgents.ts   # 12 rotating user agents
│   │       └── validators.ts   # Email/phone extraction, normalization
│   └── package.json
├── frontend/                   # Next.js 14 App Router
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx      # Root layout with Inter font
│   │   │   ├── page.tsx        # Main dashboard with WebSocket streaming
│   │   │   └── globals.css     # Tailwind + custom animations
│   │   ├── components/
│   │   │   ├── Sidebar.tsx     # Apollo-style navigation sidebar
│   │   │   ├── TopBar.tsx      # Search inputs + Find Leads button
│   │   │   ├── MetricsRibbon.tsx  # 4-metric counter row
│   │   │   ├── LeadsTable.tsx  # Feature-rich data table
│   │   │   └── ExportFooter.tsx   # Sticky export actions
│   │   └── lib/
│   │       ├── types.ts        # Shared TypeScript types
│   │       └── api.ts          # API client + WebSocket helper
│   ├── tailwind.config.ts      # Apollo-inspired color palette
│   └── package.json
└── package.json                # Root workspace scripts
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ (recommended: Node 20+)
- npm 9+

### 1. Install Dependencies

```bash
# From the lead-scraper-app directory
cd lead-scraper-app

# Install backend dependencies
cd backend && npm install && cd ..

# Install frontend dependencies
cd frontend && npm install && cd ..

# Install root dev dependency (concurrently)
npm install
```

### 2. Start the Development Servers

```bash
# Start both backend and frontend concurrently (from root directory)
npm run dev
```

Or start them separately in two terminals:

```bash
# Terminal 1 — Backend (port 3001, WebSocket 3002)
cd backend && npm run dev

# Terminal 2 — Frontend (port 3000)
cd frontend && npm run dev
```

### 3. Open the App

Open [http://localhost:3000](http://localhost:3000) in your browser.

- Default search is pre-filled: "Dentist" in "Austin, TX"
- Click **"Find Leads"** to start searching
- Watch leads stream into the table in real-time
- Enrichment happens automatically in the background

---

## 🔌 API Endpoints

### REST API (port 3001)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/search` | Search leads (returns all at once) |
| POST | `/api/enrich` | Enrich a single lead |
| POST | `/api/batch-enrich` | Enrich multiple leads |

### WebSocket (port 3002)

Send a JSON message with `type: "search"` to start a streaming search:

```json
{
  "type": "search",
  "payload": {
    "keyword": "Dentist",
    "location": "Austin, TX",
    "country": "United States",
    "maxResults": 30
  }
}
```

Receives messages of types: `lead_found`, `lead_enriched`, `progress`, `complete`, `error`

---

## ⚙️ Configuration

Environment variables (optional, defaults work out of the box):

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Backend HTTP API port |
| `WS_PORT` | `3002` | WebSocket server port |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001` | Backend API URL (for frontend) |
| `NEXT_PUBLIC_WS_PORT` | `3002` | WebSocket port (for frontend) |

---

## 🧪 Demo Data

The current implementation includes a **simulated Google Maps data layer** that generates realistic business data for demo purposes. To connect real data sources:

1. **Google Places API** — Replace `services/googleMaps.ts` with the official Places API
2. **Puppeteer/Playwright** — Add headless browser scraping for Google Maps
3. **Third-party APIs** — Connect Apify, BrightData, or other data providers

The enrichment fallback (website scraping + directory lookup) works against live URLs and is fully functional.

---

## 🔒 Rate Limiting & Anti-Bot

- **Token-bucket rate limiter**: Per-domain, configurable tokens per interval
- **12 rotating user agents**: Chrome, Firefox, Safari, Edge, mobile
- **Request timeouts**: 15s per request with 2 retries
- **Exponential backoff**: Increases delay between retries
- **Concurrency control**: Enrichment processes 3 leads at a time

---

## 📄 License

MIT — Built for Leadzap.io
