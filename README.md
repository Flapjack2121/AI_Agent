# AI Command Center

A personal financial/markets command center powered by Claude with live web search.

## Features

- **Daily Briefing** — Date/time, top global headlines, US/Europe/Asia indices, crypto snapshot. Auto-refreshes every 30 minutes. Click "Play Briefing" to hear it read aloud.
- **AI Assistant** — Full conversational chat with Claude, web search enabled. Mic button for voice input (click to toggle, or hold to record). Auto-read toggle for spoken replies. Speaker icon on each reply to read on demand.
- **Market Watch** — Live indices and stock cards, AI market mood summary, identified trade opportunities.
- **News Feed** — Top 10 global stories with category filters. Click any story for an AI deep-dive with market implications.
- **Reminders** — Personal reminder list (stored locally) plus this week's earnings and economic events.
- **Voice Settings** — Pick male/female voice or a specific system voice, tune speed/pitch/volume, toggle auto-read, and configure an optional "Hey Atlas" wake word for hands-free activation.

## Stack

- React 18 + Vite
- Claude API (`claude-sonnet-4-20250514`) called directly from the browser with the web search tool
- Web Speech API (`speechSynthesis` + `SpeechRecognition`) — fully browser-native voice, no extra API keys
- LocalStorage for API key, reminders, and voice settings
- No backend

## Running

```bash
npm install
npm run dev
```

Open the URL printed by Vite, paste your Anthropic API key (get one at https://console.anthropic.com/settings/keys), and you're in.

## Notes

The Anthropic API key is stored in your browser's localStorage and only sent to `api.anthropic.com`. The app sends the `anthropic-dangerous-direct-browser-access` header so the API accepts browser-origin requests.
