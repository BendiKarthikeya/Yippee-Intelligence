# Yippee Intelligence Dashboard

A real-time social listening dashboard for the **ITC Yippee** brand, tracking mentions and engagement across 𝕏 Twitter, Reddit, and Threads.

**Live →** https://bendikarthikeya.github.io/Yippee-Intelligence/

---

## What it does

- Pulls live data from Google Sheets (populated by n8n scraping workflows)
- Displays engagement stats, influencer tier breakdowns, and post-timing charts
- Lets you trigger new keyword scrapes directly from the UI — keywords are sent to n8n via webhook, which queries Twitter API v2 and Reddit and writes results back to the sheet

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite |
| Charts | Recharts |
| Data source | Google Sheets (public CSV) |
| Automation | n8n (self-hosted) |
| Platforms | 𝕏 Twitter API v2 · Reddit API · Threads |

## Running locally

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Triggering a scrape

1. Select a platform tab (𝕏 Twitter or Reddit)
2. Type keywords in the **⚡ Trigger Scrape** panel — comma or newline separated
3. Hit **Trigger Scrape** — the keywords are POSTed to the n8n webhook
4. n8n scrapes, normalises, and writes to the Google Sheet
5. Hit **↻ Refresh** in the dashboard to pull the latest data

## n8n Webhooks

| Platform | Webhook |
|---|---|
| 𝕏 Twitter | `POST /webhook/665abd9e-95ce-4ce6-bfc1-e55b57312130` |
| Reddit | `POST /webhook/6e481b16-9ed5-4e76-91a1-1c0f97e2ceaf` |
