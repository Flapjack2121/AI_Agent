# AI Command Center

A personal financial/markets command center powered by Claude with live web search.

## Features

- **Daily Briefing** — Date/time, top global headlines, US/Europe/Asia indices, crypto snapshot. Auto-refreshes every 30 minutes.
- **AI Assistant** — Full conversational chat with Claude, web search enabled, financial markets expertise.
- **Market Watch** — Live indices and stock cards, AI market mood summary, identified trade opportunities.
- **News Feed** — Top 10 global stories with category filters. Click any story for an AI deep-dive with market implications.
- **Reminders** — Personal reminder list (stored locally) plus this week's earnings and economic events.

## Stack

- React 18 + Vite
- Claude API (`claude-sonnet-4-20250514`) called directly from the browser with the web search tool
- LocalStorage for API key and reminders
- No backend

## Running

```bash
npm install
npm run dev
```

Open the URL printed by Vite, paste your Anthropic API key (get one at https://console.anthropic.com/settings/keys), and you're in.

## Notes

The Anthropic API key is stored in your browser's localStorage and only sent to `api.anthropic.com`. The app sends the `anthropic-dangerous-direct-browser-access` header so the API accepts browser-origin requests.
