import { useState, useEffect, useRef, useCallback } from 'react'
import { VoiceProvider, useVoice, speechSupported, recognitionSupported } from './voice.jsx'

const MODEL = 'claude-sonnet-4-20250514'
const API_URL = 'https://api.anthropic.com/v1/messages'

const SYSTEM_PROMPT = `You are a personal AI command center assistant. You have access to web search and should use it for ALL market and news queries to get live data. You are an expert in global financial markets, trading, and geopolitics. When asked about markets, always search for current prices and conditions first, then give a clear analysis. When identifying trade opportunities, be specific about the asset, direction, and reasoning — but always include a brief risk disclaimer. Keep responses concise but insightful. Today's date context should be included in every market query.`

function getDateContext() {
  const now = new Date()
  return now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

async function callClaude({ apiKey, messages, system = SYSTEM_PROMPT, maxTokens = 4096, useWebSearch = true }) {
  const body = {
    model: MODEL,
    max_tokens: maxTokens,
    system: `${system}\n\nToday's date: ${getDateContext()}`,
    messages,
  }

  if (useWebSearch) {
    body.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }]
  }

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text()
    let msg = errText
    try {
      const json = JSON.parse(errText)
      msg = json.error?.message || errText
    } catch {}
    throw new Error(`API error ${res.status}: ${msg}`)
  }

  const data = await res.json()
  return data
}

function extractText(response) {
  if (!response?.content) return ''
  return response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n\n')
}

function extractCitations(response) {
  if (!response?.content) return []
  const citations = []
  for (const block of response.content) {
    if (block.type === 'text' && block.citations) {
      for (const c of block.citations) {
        if (c.type === 'web_search_result_location' && c.url) {
          citations.push({ url: c.url, title: c.title || c.url })
        }
      }
    }
  }
  const seen = new Set()
  return citations.filter((c) => {
    if (seen.has(c.url)) return false
    seen.add(c.url)
    return true
  })
}

async function fetchJSONFromClaude({ apiKey, prompt, system = SYSTEM_PROMPT, maxTokens = 4096 }) {
  const messages = [{ role: 'user', content: prompt }]
  const res = await callClaude({ apiKey, messages, system, maxTokens })
  const text = extractText(res)
  const match = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/)
  if (!match) throw new Error('No JSON in response')
  const jsonStr = match[1] || match[0]
  return { data: JSON.parse(jsonStr), citations: extractCitations(res) }
}

function Icon({ name, size = 18 }) {
  const icons = {
    briefing: <><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></>,
    chat: <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></>,
    market: <><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></>,
    news: <><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8M15 18h-5M10 6h8v4h-8z"/></>,
    reminders: <><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" x2="21" y1="6" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></>,
    refresh: <><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></>,
    send: <><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    trash: <><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></>,
    key: <><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></>,
    sparkle: <><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/></>,
    search: <><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></>,
    external: <><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></>,
    arrowUp: <><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></>,
    arrowDown: <><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></>,
    menu: <><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></>,
    close: <><path d="M18 6 6 18M6 6l12 12"/></>,
    globe: <><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></>,
    play: <><polygon points="6 3 20 12 6 21 6 3"/></>,
    stop: <><rect x="5" y="5" width="14" height="14" rx="1"/></>,
    mic: <><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></>,
    micOff: <><line x1="2" x2="22" y1="2" y2="22"/><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/><path d="M5 10v2a7 7 0 0 0 12 5"/><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12"/><line x1="12" x2="12" y1="19" y2="22"/></>,
    speaker: <><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></>,
    speakerOff: <><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/></>,
    settings: <><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/><circle cx="12" cy="12" r="3"/></>,
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {icons[name]}
    </svg>
  )
}

function Spinner({ size = 16 }) {
  return (
    <div style={{
      width: size, height: size,
      border: `2px solid var(--border)`,
      borderTopColor: 'var(--accent)',
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
      display: 'inline-block',
    }} />
  )
}

function Sidebar({ activeTab, setActiveTab, onResetKey, mobileOpen, setMobileOpen }) {
  const tabs = [
    { id: 'briefing', label: 'Daily Briefing', icon: 'briefing' },
    { id: 'chat', label: 'AI Assistant', icon: 'chat' },
    { id: 'market', label: 'Market Watch', icon: 'market' },
    { id: 'news', label: 'News Feed', icon: 'news' },
    { id: 'reminders', label: 'Reminders', icon: 'reminders' },
    { id: 'voice', label: 'Voice Settings', icon: 'settings' },
  ]
  return (
    <>
      {mobileOpen && (
        <div onClick={() => setMobileOpen(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 99,
        }} />
      )}
      <aside style={{
        width: 240,
        background: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border-light)',
        display: 'flex',
        flexDirection: 'column',
        padding: '20px 12px',
        position: window.innerWidth <= 768 ? 'fixed' : 'relative',
        zIndex: 100,
        height: '100%',
        transform: window.innerWidth <= 768 && !mobileOpen ? 'translateX(-100%)' : 'translateX(0)',
        transition: 'transform 0.2s ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px 24px', borderBottom: '1px solid var(--border-light)', marginBottom: 16 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: 'linear-gradient(135deg, var(--accent), #0099cc)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#000', fontWeight: 800, fontSize: 14,
            boxShadow: '0 0 20px var(--accent-glow)',
          }}>AI</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: '-0.01em' }}>Command Center</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Powered by Claude</div>
          </div>
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => { setActiveTab(t.id); setMobileOpen(false) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 12px', borderRadius: 8,
                color: activeTab === t.id ? 'var(--accent)' : 'var(--text-secondary)',
                background: activeTab === t.id ? 'var(--accent-glow)' : 'transparent',
                fontSize: 13, fontWeight: activeTab === t.id ? 600 : 500,
                transition: 'all 0.15s ease',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => { if (activeTab !== t.id) e.currentTarget.style.background = 'var(--bg-hover)' }}
              onMouseLeave={(e) => { if (activeTab !== t.id) e.currentTarget.style.background = 'transparent' }}
            >
              <Icon name={t.icon} size={16} />
              {t.label}
            </button>
          ))}
        </nav>
        <button
          onClick={onResetKey}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px', borderRadius: 8,
            color: 'var(--text-muted)', fontSize: 12,
            border: '1px solid var(--border-light)',
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
          <Icon name="key" size={14} />
          Reset API Key
        </button>
      </aside>
    </>
  )
}

function APIKeySetup({ onSave }) {
  const [key, setKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
      background: 'radial-gradient(circle at 20% 30%, rgba(0,212,255,0.08), transparent 50%), radial-gradient(circle at 80% 70%, rgba(167,139,250,0.06), transparent 50%), var(--bg-primary)',
    }}>
      <div style={{
        maxWidth: 480, width: '100%',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 16, padding: 32,
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        animation: 'fadeIn 0.4s ease',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 14,
          background: 'linear-gradient(135deg, var(--accent), #0099cc)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#000', fontWeight: 800, fontSize: 20,
          marginBottom: 20,
          boxShadow: '0 0 30px var(--accent-glow)',
        }}>AI</div>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Welcome to your Command Center</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: 13 }}>
          Enter your Anthropic API key to get started. Your key is stored locally in your browser and never sent anywhere besides Anthropic's API.
        </p>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 12, marginBottom: 6, color: 'var(--text-secondary)' }}>API Key</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
            <Icon name="key" size={14} />
            <input
              type={showKey ? 'text' : 'password'}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="sk-ant-..."
              style={{ flex: 1, fontSize: 13 }}
              onKeyDown={(e) => { if (e.key === 'Enter' && key.trim()) onSave(key.trim()) }}
            />
            <button onClick={() => setShowKey(!showKey)} style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>
        <button
          onClick={() => key.trim() && onSave(key.trim())}
          disabled={!key.trim()}
          style={{
            width: '100%', padding: '12px',
            background: key.trim() ? 'linear-gradient(135deg, var(--accent), #0099cc)' : 'var(--bg-hover)',
            color: key.trim() ? '#000' : 'var(--text-muted)',
            borderRadius: 8, fontWeight: 600, fontSize: 13,
            transition: 'all 0.15s ease',
          }}
        >
          Continue
        </button>
        <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          marginTop: 16, color: 'var(--text-muted)', fontSize: 12, textDecoration: 'none',
        }}>
          Get an API key <Icon name="external" size={12} />
        </a>
      </div>
    </div>
  )
}

function StatCard({ label, value, change, loading, color }) {
  const isPositive = change != null && change >= 0
  const changeColor = change == null ? 'var(--text-muted)' : isPositive ? 'var(--green)' : 'var(--red)'
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-light)',
      borderRadius: 10, padding: '14px 16px',
      transition: 'all 0.2s ease',
      animation: 'fadeIn 0.3s ease',
    }}
    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-light)'; e.currentTarget.style.transform = 'translateY(0)' }}
    >
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontWeight: 600 }}>{label}</div>
      {loading ? (
        <div style={{
          height: 22, width: '70%',
          background: 'linear-gradient(90deg, var(--bg-hover) 0%, var(--bg-tertiary) 50%, var(--bg-hover) 100%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.5s infinite',
          borderRadius: 4,
        }} />
      ) : (
        <>
          <div style={{ fontSize: 18, fontWeight: 700, color: color || 'var(--text-primary)', fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums' }}>{value || '—'}</div>
          {change != null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 12, color: changeColor, fontWeight: 600 }}>
              <Icon name={isPositive ? 'arrowUp' : 'arrowDown'} size={11} />
              {isPositive ? '+' : ''}{change}%
            </div>
          )}
        </>
      )}
    </div>
  )
}

function SectionHeader({ title, subtitle, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
      <div>
        <h2 style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)' }}>{title}</h2>
        {subtitle && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

function Card({ children, padding = 20, style = {} }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-light)',
      borderRadius: 12, padding,
      animation: 'fadeIn 0.3s ease',
      ...style,
    }}>{children}</div>
  )
}

function ErrorBanner({ error, onClose }) {
  if (!error) return null
  return (
    <div style={{
      background: 'var(--red-bg)', border: '1px solid var(--red)',
      borderRadius: 8, padding: '10px 14px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 12, marginBottom: 16, fontSize: 12, color: 'var(--red)',
    }}>
      <span>{error}</span>
      {onClose && <button onClick={onClose} style={{ color: 'var(--red)' }}><Icon name="close" size={14} /></button>}
    </div>
  )
}

function DailyBriefing({ apiKey }) {
  const [now, setNow] = useState(new Date())
  const [headlines, setHeadlines] = useState(null)
  const [stocks, setStocks] = useState(null)
  const [crypto, setCrypto] = useState(null)
  const [welcomeMsg, setWelcomeMsg] = useState(null)
  const [loading, setLoading] = useState({ headlines: false, stocks: false, crypto: false })
  const [error, setError] = useState(null)
  const [lastRefresh, setLastRefresh] = useState(null)
  const { speakChunks, stopSpeaking, isSpeaking, speechSupported: ttsOk } = useVoice()

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const fetchHeadlines = useCallback(async () => {
    setLoading((l) => ({ ...l, headlines: true }))
    try {
      const { data } = await fetchJSONFromClaude({
        apiKey,
        prompt: `Search the web for the top global news headlines right now (today, ${getDateContext()}). Return ONLY a JSON array of 5 objects with this exact shape, no other text:
[{"headline": "string", "category": "Markets|Geopolitics|Tech|Economy|World", "summary": "one sentence"}]`,
      })
      setHeadlines(data)
    } catch (e) {
      setError(`Headlines: ${e.message}`)
    } finally {
      setLoading((l) => ({ ...l, headlines: false }))
    }
  }, [apiKey])

  const fetchStocks = useCallback(async () => {
    setLoading((l) => ({ ...l, stocks: true }))
    try {
      const { data } = await fetchJSONFromClaude({
        apiKey,
        prompt: `Search the web for current global stock market index levels (as of ${getDateContext()}). I need:
US: S&P 500, NASDAQ, DOW
Europe: DAX, FTSE 100, CAC 40
Asia: Nikkei 225, Hang Seng, Shanghai Composite

Return ONLY a JSON object with this exact shape, no other text:
{
  "us": [{"name": "S&P 500", "value": "5234.18", "change": 0.45}, ...],
  "europe": [{"name": "DAX", "value": "18234.50", "change": -0.32}, ...],
  "asia": [{"name": "Nikkei 225", "value": "38765.21", "change": 0.18}, ...]
}
Change is the daily % change as a number.`,
      })
      setStocks(data)
    } catch (e) {
      setError(`Stocks: ${e.message}`)
    } finally {
      setLoading((l) => ({ ...l, stocks: false }))
    }
  }, [apiKey])

  const fetchCrypto = useCallback(async () => {
    setLoading((l) => ({ ...l, crypto: true }))
    try {
      const { data } = await fetchJSONFromClaude({
        apiKey,
        prompt: `Search the web for current cryptocurrency prices (as of ${getDateContext()}) for BTC (Bitcoin), ETH (Ethereum), and BNB (Binance Coin).

Return ONLY a JSON array with this exact shape, no other text:
[{"symbol": "BTC", "name": "Bitcoin", "price": "65432.10", "change": 1.45}, ...]
Change is the 24h % change as a number.`,
      })
      setCrypto(data)
    } catch (e) {
      setError(`Crypto: ${e.message}`)
    } finally {
      setLoading((l) => ({ ...l, crypto: false }))
    }
  }, [apiKey])

  const fetchAll = useCallback(() => {
    setError(null)
    setWelcomeMsg(`Markets are live — here's your briefing for ${getDateContext()}.`)
    fetchHeadlines()
    fetchStocks()
    fetchCrypto()
    setLastRefresh(new Date())
  }, [fetchHeadlines, fetchStocks, fetchCrypto])

  useEffect(() => {
    fetchAll()
    const t = setInterval(fetchAll, 30 * 60 * 1000)
    return () => clearInterval(t)
  }, [fetchAll])

  const greeting = (() => {
    const h = now.getHours()
    if (h < 12) return 'Good morning'
    if (h < 18) return 'Good afternoon'
    return 'Good evening'
  })()

  const anyLoading = loading.headlines || loading.stocks || loading.crypto

  const playBriefing = () => {
    if (isSpeaking) { stopSpeaking(); return }
    const chunks = []
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    chunks.push(`${greeting}. Here is your briefing for ${dateStr}.`)

    if (headlines && headlines.length) {
      chunks.push('Top headlines.')
      headlines.slice(0, 5).forEach((h, i) => {
        chunks.push(`${i + 1}. ${h.headline}. ${h.summary || ''}`)
      })
    }

    const summarize = (arr, label) => {
      if (!arr || !arr.length) return null
      const parts = arr.map((s) => {
        const ch = Number(s.change)
        const dir = isNaN(ch) ? 'unchanged' : ch > 0 ? 'up' : ch < 0 ? 'down' : 'flat'
        const pct = isNaN(ch) ? '' : ` ${Math.abs(ch).toFixed(2)} percent`
        return `${s.name} ${dir}${pct}`
      })
      return `${label}: ${parts.join('. ')}.`
    }

    if (stocks) {
      const us = summarize(stocks.us, 'U.S. markets')
      const eu = summarize(stocks.europe, 'European markets')
      const as = summarize(stocks.asia, 'Asian markets')
      if (us) chunks.push(us)
      if (eu) chunks.push(eu)
      if (as) chunks.push(as)
    }

    if (crypto && crypto.length) {
      const parts = crypto.map((c) => {
        const ch = Number(c.change)
        const dir = isNaN(ch) ? 'unchanged' : ch > 0 ? 'up' : ch < 0 ? 'down' : 'flat'
        const pct = isNaN(ch) ? '' : ` ${Math.abs(ch).toFixed(2)} percent`
        return `${c.name || c.symbol} at ${c.price ? '$' + c.price : 'unknown'}, ${dir}${pct}`
      })
      chunks.push(`Crypto. ${parts.join('. ')}.`)
    }

    chunks.push(`That is your briefing.`)
    speakChunks(chunks, { pauseMs: 500 })
  }

  const canPlay = ttsOk && !anyLoading && (headlines || stocks || crypto)

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto' }}>
      <ErrorBanner error={error} onClose={() => setError(null)} />
      <div style={{
        background: 'linear-gradient(135deg, var(--bg-card) 0%, var(--bg-tertiary) 100%)',
        border: '1px solid var(--border-light)',
        borderRadius: 14, padding: '24px 28px', marginBottom: 24,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 16,
        animation: 'fadeIn 0.4s ease',
      }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{greeting}</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>
            {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>{welcomeMsg || 'Loading market data…'}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 26, fontWeight: 700, fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums', color: 'var(--accent)' }}>
              {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
            </div>
            {lastRefresh && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Refreshed {lastRefresh.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
          </div>
          {ttsOk && (
            <button
              onClick={playBriefing}
              disabled={!canPlay && !isSpeaking}
              style={{
                padding: '10px 14px',
                background: isSpeaking ? 'var(--red-bg)' : 'linear-gradient(135deg, var(--accent), #0099cc)',
                color: isSpeaking ? 'var(--red)' : '#000',
                border: isSpeaking ? '1px solid var(--red)' : 'none',
                borderRadius: 8, fontWeight: 600, fontSize: 12,
                display: 'flex', alignItems: 'center', gap: 8,
                opacity: (!canPlay && !isSpeaking) ? 0.5 : 1,
                transition: 'all 0.15s ease',
              }}
              title={isSpeaking ? 'Stop playback' : 'Play briefing aloud'}
            >
              <Icon name={isSpeaking ? 'stop' : 'play'} size={12} />
              {isSpeaking ? 'Stop' : 'Play Briefing'}
            </button>
          )}
          <button
            onClick={fetchAll}
            disabled={anyLoading}
            style={{
              padding: '10px',
              background: 'var(--bg-hover)', borderRadius: 8,
              color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: anyLoading ? 0.5 : 1,
            }}
            title="Refresh"
          >
            <div style={{ animation: anyLoading ? 'spin 1s linear infinite' : 'none' }}>
              <Icon name="refresh" size={16} />
            </div>
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 32 }}>
        <SectionHeader title="US Markets" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          {(loading.stocks || !stocks ? [{name:'S&P 500'},{name:'NASDAQ'},{name:'DOW'}] : stocks.us).map((s, i) => (
            <StatCard key={i} label={s.name} value={s.value} change={s.change} loading={loading.stocks} />
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 32 }}>
        <SectionHeader title="European Markets" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          {(loading.stocks || !stocks ? [{name:'DAX'},{name:'FTSE 100'},{name:'CAC 40'}] : stocks.europe).map((s, i) => (
            <StatCard key={i} label={s.name} value={s.value} change={s.change} loading={loading.stocks} />
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 32 }}>
        <SectionHeader title="Asian Markets" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          {(loading.stocks || !stocks ? [{name:'Nikkei 225'},{name:'Hang Seng'},{name:'Shanghai'}] : stocks.asia).map((s, i) => (
            <StatCard key={i} label={s.name} value={s.value} change={s.change} loading={loading.stocks} />
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 32 }}>
        <SectionHeader title="Crypto" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          {(loading.crypto || !crypto ? [{name:'BTC'},{name:'ETH'},{name:'BNB'}] : crypto).map((c, i) => (
            <StatCard key={i} label={`${c.symbol || ''} ${c.name || ''}`.trim()} value={c.price ? `$${c.price}` : '—'} change={c.change} loading={loading.crypto} />
          ))}
        </div>
      </div>

      <div>
        <SectionHeader title="Top Global Headlines" />
        <Card padding={0}>
          {loading.headlines && !headlines ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <Spinner /> Fetching latest headlines…
            </div>
          ) : headlines && headlines.length ? (
            headlines.map((h, i) => (
              <div key={i} style={{
                padding: '14px 18px',
                borderBottom: i < headlines.length - 1 ? '1px solid var(--border-light)' : 'none',
                display: 'flex', gap: 12, alignItems: 'flex-start',
              }}>
                <div style={{
                  fontSize: 10, padding: '3px 8px', borderRadius: 12,
                  background: 'var(--bg-tertiary)', color: 'var(--accent)',
                  fontWeight: 600, letterSpacing: '0.03em', textTransform: 'uppercase',
                  whiteSpace: 'nowrap', marginTop: 2,
                }}>{h.category}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 3 }}>{h.headline}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{h.summary}</div>
                </div>
              </div>
            ))
          ) : (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>No headlines available</div>
          )}
        </Card>
      </div>
    </div>
  )
}

function ChatAssistant({ apiKey, wakePending, onWakeHandled }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const scrollRef = useRef(null)
  const inputRef = useRef(null)
  const loadingRef = useRef(false)
  const {
    settings: voiceSettings, setSettings: setVoiceSettings,
    speak, stopSpeaking, isSpeaking,
    isListening, transcript, startListening, stopListening,
    speechSupported: ttsOk, recognitionSupported: sttOk,
  } = useVoice()

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, loading])

  useEffect(() => { loadingRef.current = loading }, [loading])

  useEffect(() => {
    if (isListening && transcript) setInput(transcript)
  }, [isListening, transcript])

  const send = async (overrideText) => {
    const text = (overrideText ?? input).trim()
    if (!text || loadingRef.current) return
    setInput('')
    setError(null)
    const newMessages = [...messages, { role: 'user', content: text }]
    setMessages(newMessages)
    setLoading(true)
    try {
      const apiMessages = newMessages.map((m) => ({ role: m.role, content: m.content }))
      const res = await callClaude({ apiKey, messages: apiMessages })
      const reply = extractText(res)
      const citations = extractCitations(res)
      setMessages([...newMessages, { role: 'assistant', content: reply, citations }])
      if (voiceSettings.autoRead && reply) speak(reply)
    } catch (e) {
      setError(e.message)
      setMessages(newMessages)
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  const beginListening = () => {
    stopSpeaking()
    startListening((finalText) => {
      if (finalText) {
        setInput(finalText)
        setTimeout(() => send(finalText), 100)
      }
    })
  }

  const endAndSend = () => {
    const textToSend = (transcript || input).trim()
    stopListening()
    if (textToSend) setTimeout(() => send(textToSend), 50)
  }

  const pressStartRef = useRef(0)
  const wasListeningOnDownRef = useRef(false)

  const onMicDown = (e) => {
    e.preventDefault()
    if (!sttOk || loading) return
    pressStartRef.current = Date.now()
    wasListeningOnDownRef.current = isListening
    if (!isListening) beginListening()
  }

  const onMicUp = (e) => {
    e.preventDefault()
    if (!sttOk) return
    const duration = Date.now() - pressStartRef.current
    if (duration > 250 || wasListeningOnDownRef.current) {
      endAndSend()
    }
  }

  useEffect(() => {
    if (!wakePending) return
    onWakeHandled?.()
    if (sttOk && !isListening && !loadingRef.current) {
      stopSpeaking()
      startListening((finalText) => {
        if (finalText) {
          setInput(finalText)
          setTimeout(() => send(finalText), 100)
        }
      })
    }
  }, [wakePending])

  const suggestions = [
    'What happened in markets today?',
    'Any good trade setups right now?',
    'Summarize today\'s top news',
    'How is BTC trending?',
  ]

  return (
    <div style={{
      maxWidth: 900, margin: '0 auto',
      height: '100%', display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>AI Assistant</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            Ask anything about markets, news, or trade ideas. Web search is enabled.
          </p>
        </div>
        {ttsOk && (
          <button
            onClick={() => setVoiceSettings({ autoRead: !voiceSettings.autoRead })}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: voiceSettings.autoRead ? 'var(--accent-glow)' : 'var(--bg-card)',
              border: voiceSettings.autoRead ? '1px solid var(--accent)' : '1px solid var(--border)',
              color: voiceSettings.autoRead ? 'var(--accent)' : 'var(--text-secondary)',
              transition: 'all 0.15s ease',
            }}
            title="Read assistant replies aloud automatically"
          >
            <Icon name={voiceSettings.autoRead ? 'speaker' : 'speakerOff'} size={14} />
            Auto-read {voiceSettings.autoRead ? 'on' : 'off'}
          </button>
        )}
      </div>

      <ErrorBanner error={error} onClose={() => setError(null)} />

      <div ref={scrollRef} style={{
        flex: 1, overflowY: 'auto',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-light)',
        borderRadius: 12, padding: 20, marginBottom: 12,
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        {messages.length === 0 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 20 }}>
            <div style={{
              width: 56, height: 56, borderRadius: 14,
              background: 'linear-gradient(135deg, var(--accent), var(--purple))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 16, color: '#000',
            }}>
              <Icon name="sparkle" size={24} />
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>How can I help?</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 24 }}>
              I'll search the web for real-time market and news data.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8, width: '100%', maxWidth: 600 }}>
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  style={{
                    padding: '10px 14px',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-light)',
                    borderRadius: 8, textAlign: 'left',
                    fontSize: 12, color: 'var(--text-secondary)',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--text-primary)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-light)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{
            display: 'flex', flexDirection: 'column',
            alignItems: m.role === 'user' ? 'flex-end' : 'flex-start',
            animation: 'slideIn 0.2s ease',
          }}>
            <div style={{
              maxWidth: '85%',
              padding: '10px 14px', borderRadius: 12,
              background: m.role === 'user' ? 'var(--accent-glow)' : 'var(--bg-tertiary)',
              border: m.role === 'user' ? '1px solid rgba(0,212,255,0.3)' : '1px solid var(--border-light)',
              color: 'var(--text-primary)',
              fontSize: 13, lineHeight: 1.6,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {m.content}
              {m.citations && m.citations.length > 0 && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-light)' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Sources</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {m.citations.slice(0, 5).map((c, j) => (
                      <a key={j} href={c.url} target="_blank" rel="noreferrer" style={{
                        fontSize: 11, color: 'var(--accent)', textDecoration: 'none',
                        display: 'flex', alignItems: 'center', gap: 4,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        <Icon name="external" size={10} />
                        {c.title}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {m.role === 'assistant' && ttsOk && (
              <button
                onClick={() => isSpeaking ? stopSpeaking() : speak(m.content)}
                style={{
                  marginTop: 4, padding: '4px 8px',
                  display: 'flex', alignItems: 'center', gap: 5,
                  fontSize: 10, color: 'var(--text-muted)',
                  background: 'transparent', borderRadius: 4,
                  transition: 'color 0.15s ease',
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent)'}
                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                title={isSpeaking ? 'Stop' : 'Read aloud'}
              >
                <Icon name={isSpeaking ? 'stop' : 'speaker'} size={11} />
                {isSpeaking ? 'Stop' : 'Read aloud'}
              </button>
            )}
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 12 }}>
            <Spinner /> Thinking & searching the web…
          </div>
        )}
      </div>

      <div style={{
        background: 'var(--bg-card)', border: isListening ? '1px solid var(--red)' : '1px solid var(--border)',
        borderRadius: 12, padding: 8,
        display: 'flex', alignItems: 'flex-end', gap: 8,
        transition: 'border-color 0.15s ease',
      }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder={isListening ? 'Listening…' : 'Ask about markets, news, or trade ideas… (Enter to send)'}
          rows={1}
          style={{
            flex: 1, padding: '10px 12px',
            fontSize: 13, resize: 'none',
            maxHeight: 120, minHeight: 24,
          }}
          onInput={(e) => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px' }}
        />
        {sttOk && (
          <button
            onPointerDown={onMicDown}
            onPointerUp={onMicUp}
            onPointerLeave={(e) => { if (isListening && Date.now() - pressStartRef.current > 250) onMicUp(e) }}
            disabled={loading}
            style={{
              padding: '10px',
              background: isListening ? 'var(--red-bg)' : 'var(--bg-hover)',
              border: isListening ? '1px solid var(--red)' : 'none',
              color: isListening ? 'var(--red)' : 'var(--text-primary)',
              borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
              position: 'relative',
              opacity: loading ? 0.5 : 1,
              transition: 'all 0.15s ease',
              touchAction: 'none',
              userSelect: 'none',
            }}
            title={isListening ? 'Click or release to send' : 'Click to toggle, or hold to record'}
          >
            <Icon name={isListening ? 'micOff' : 'mic'} size={16} />
            {isListening && (
              <span style={{
                position: 'absolute', top: 4, right: 4,
                width: 6, height: 6, borderRadius: '50%',
                background: 'var(--red)',
                animation: 'pulse 1s ease-in-out infinite',
              }} />
            )}
          </button>
        )}
        <button
          onClick={() => send()}
          disabled={!input.trim() || loading}
          style={{
            padding: '10px 14px',
            background: input.trim() && !loading ? 'linear-gradient(135deg, var(--accent), #0099cc)' : 'var(--bg-hover)',
            color: input.trim() && !loading ? '#000' : 'var(--text-muted)',
            borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s ease',
          }}
        >
          <Icon name="send" size={16} />
        </button>
      </div>
    </div>
  )
}

function MarketWatch({ apiKey }) {
  const [data, setData] = useState(null)
  const [mood, setMood] = useState(null)
  const [opportunities, setOpportunities] = useState(null)
  const [oppCitations, setOppCitations] = useState([])
  const [loading, setLoading] = useState({ data: false, mood: false, opps: false })
  const [error, setError] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading((l) => ({ ...l, data: true }))
    setError(null)
    try {
      const { data: marketData } = await fetchJSONFromClaude({
        apiKey,
        prompt: `Search the web for current market data (as of ${getDateContext()}). I need major indices and notable stocks.

Return ONLY a JSON object with this exact shape, no other text:
{
  "indices": [
    {"symbol": "SPX", "name": "S&P 500", "value": "5234.18", "change": 0.45},
    {"symbol": "IXIC", "name": "NASDAQ", "value": "16432.50", "change": 0.78},
    {"symbol": "DJI", "name": "DOW", "value": "39123.45", "change": 0.12},
    {"symbol": "VIX", "name": "VIX", "value": "14.23", "change": -2.10}
  ],
  "stocks": [
    {"symbol": "AAPL", "name": "Apple", "value": "182.45", "change": 1.20},
    {"symbol": "MSFT", "name": "Microsoft", "value": "412.30", "change": 0.85},
    {"symbol": "NVDA", "name": "Nvidia", "value": "892.10", "change": 2.45},
    {"symbol": "TSLA", "name": "Tesla", "value": "245.60", "change": -1.30},
    {"symbol": "GOOGL", "name": "Alphabet", "value": "168.20", "change": 0.55},
    {"symbol": "META", "name": "Meta", "value": "498.75", "change": 1.10},
    {"symbol": "AMZN", "name": "Amazon", "value": "183.40", "change": 0.32},
    {"symbol": "JPM", "name": "JPMorgan", "value": "198.50", "change": 0.18}
  ]
}`,
      })
      setData(marketData)
    } catch (e) {
      setError(`Market data: ${e.message}`)
    } finally {
      setLoading((l) => ({ ...l, data: false }))
    }
  }, [apiKey])

  const fetchMood = useCallback(async () => {
    setLoading((l) => ({ ...l, mood: true }))
    try {
      const res = await callClaude({
        apiKey,
        messages: [{ role: 'user', content: `Search the web for current market conditions (as of ${getDateContext()}). In 2-3 sentences, give me a "market mood" summary — overall sentiment, what's driving it, and key things to watch. Be direct and tight.` }],
      })
      setMood(extractText(res))
    } catch (e) {
      setError(`Mood: ${e.message}`)
    } finally {
      setLoading((l) => ({ ...l, mood: false }))
    }
  }, [apiKey])

  const fetchOpportunities = useCallback(async () => {
    setLoading((l) => ({ ...l, opps: true }))
    try {
      const res = await callClaude({
        apiKey,
        messages: [{ role: 'user', content: `Search the web for current market conditions (as of ${getDateContext()}). Identify 3 notable potential trade setups happening right now. For each, give: asset/ticker, direction (long/short), brief reasoning (1-2 sentences), and key level to watch. End with a one-line risk disclaimer.

Format as plain text with clear separators. Be specific and concise.` }],
      })
      setOpportunities(extractText(res))
      setOppCitations(extractCitations(res))
    } catch (e) {
      setError(`Opportunities: ${e.message}`)
    } finally {
      setLoading((l) => ({ ...l, opps: false }))
    }
  }, [apiKey])

  const refreshAll = useCallback(() => {
    fetchData()
    fetchMood()
    fetchOpportunities()
  }, [fetchData, fetchMood, fetchOpportunities])

  useEffect(() => { refreshAll() }, [refreshAll])

  const anyLoading = loading.data || loading.mood || loading.opps

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto' }}>
      <ErrorBanner error={error} onClose={() => setError(null)} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Market Watch</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Live market data and AI-driven analysis</p>
        </div>
        <button
          onClick={refreshAll}
          disabled={anyLoading}
          style={{
            padding: '8px 14px', background: 'var(--bg-card)',
            border: '1px solid var(--border)', borderRadius: 8,
            display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
            opacity: anyLoading ? 0.5 : 1, fontWeight: 600,
          }}
        >
          <div style={{ animation: anyLoading ? 'spin 1s linear infinite' : 'none' }}>
            <Icon name="refresh" size={14} />
          </div>
          Refresh
        </button>
      </div>

      <Card style={{ marginBottom: 24, background: 'linear-gradient(135deg, rgba(0,212,255,0.05), rgba(167,139,250,0.05))' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Icon name="sparkle" size={16} />
          <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent)' }}>Market Mood</h3>
        </div>
        {loading.mood && !mood ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Spinner /> Analyzing current conditions…
          </div>
        ) : (
          <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
            {mood || 'No data available'}
          </p>
        )}
      </Card>

      <div style={{ marginBottom: 32 }}>
        <SectionHeader title="Major Indices" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          {(loading.data || !data ? Array(4).fill({}) : data.indices).map((s, i) => (
            <StatCard key={i} label={s.name || '—'} value={s.value} change={s.change} loading={loading.data} />
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 32 }}>
        <SectionHeader title="Notable Stocks" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          {(loading.data || !data ? Array(8).fill({}) : data.stocks).map((s, i) => (
            <StatCard key={i} label={`${s.symbol || ''} ${s.name || ''}`.trim() || '—'} value={s.value ? `$${s.value}` : '—'} change={s.change} loading={loading.data} />
          ))}
        </div>
      </div>

      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Icon name="sparkle" size={16} />
          <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent)' }}>Potential Trade Opportunities</h3>
        </div>
        {loading.opps && !opportunities ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Spinner /> Scanning for setups…
          </div>
        ) : (
          <>
            <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
              {opportunities || 'No setups identified right now'}
            </div>
            {oppCitations.length > 0 && (
              <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border-light)' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Sources</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {oppCitations.slice(0, 6).map((c, i) => (
                    <a key={i} href={c.url} target="_blank" rel="noreferrer" style={{
                      fontSize: 11, color: 'var(--accent)', textDecoration: 'none',
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '4px 8px', background: 'var(--bg-tertiary)', borderRadius: 4,
                    }}>
                      <Icon name="external" size={10} />
                      {c.title.length > 40 ? c.title.slice(0, 40) + '…' : c.title}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  )
}

function NewsFeed({ apiKey }) {
  const [stories, setStories] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [filter, setFilter] = useState('All')

  const fetchStories = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await fetchJSONFromClaude({
        apiKey,
        prompt: `Search the web for the top 10 most important global news stories today (${getDateContext()}). Cover a mix of categories.

Return ONLY a JSON array with this exact shape, no other text:
[{"headline": "string", "summary": "2-3 sentence summary", "category": "Markets|Geopolitics|Tech|Economy", "source": "publication name"}]

The category MUST be exactly one of: Markets, Geopolitics, Tech, Economy.`,
      })
      setStories(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [apiKey])

  useEffect(() => { fetchStories() }, [fetchStories])

  const openStory = async (story) => {
    setSelected(story)
    setAnalysis(null)
    setAnalysisLoading(true)
    try {
      const res = await callClaude({
        apiKey,
        messages: [{ role: 'user', content: `The story is: "${story.headline}". Summary so far: "${story.summary}".

Search the web for more details on this story (today is ${getDateContext()}). Give me:
1. A deeper, factual summary (4-5 sentences)
2. What it means for markets (2-3 sentences with specific tickers/sectors if relevant)
3. Why it matters / what to watch next

Format with clear section headings.` }],
      })
      setAnalysis({ text: extractText(res), citations: extractCitations(res) })
    } catch (e) {
      setAnalysis({ text: `Error: ${e.message}`, citations: [] })
    } finally {
      setAnalysisLoading(false)
    }
  }

  const categories = ['All', 'Markets', 'Geopolitics', 'Tech', 'Economy']
  const categoryColors = {
    Markets: 'var(--green)',
    Geopolitics: 'var(--yellow)',
    Tech: 'var(--purple)',
    Economy: 'var(--accent)',
  }

  const filtered = stories ? (filter === 'All' ? stories : stories.filter((s) => s.category === filter)) : []

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto' }}>
      <ErrorBanner error={error} onClose={() => setError(null)} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>News Feed</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Top global stories, with AI deep-dives on demand</p>
        </div>
        <button
          onClick={fetchStories}
          disabled={loading}
          style={{
            padding: '8px 14px', background: 'var(--bg-card)',
            border: '1px solid var(--border)', borderRadius: 8,
            display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
            opacity: loading ? 0.5 : 1, fontWeight: 600,
          }}
        >
          <div style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }}>
            <Icon name="refresh" size={14} />
          </div>
          Refresh
        </button>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            style={{
              padding: '6px 12px', borderRadius: 16,
              background: filter === c ? 'var(--accent-glow)' : 'var(--bg-tertiary)',
              color: filter === c ? 'var(--accent)' : 'var(--text-secondary)',
              border: filter === c ? '1px solid var(--accent)' : '1px solid var(--border-light)',
              fontSize: 12, fontWeight: 600,
              transition: 'all 0.15s ease',
            }}
          >
            {c}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 1fr' : '1fr', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {loading && !stories ? (
            <Card>
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <Spinner /> Fetching today's news…
              </div>
            </Card>
          ) : filtered.length === 0 ? (
            <Card>
              <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No stories in this category</div>
            </Card>
          ) : (
            filtered.map((story, i) => (
              <div
                key={i}
                onClick={() => openStory(story)}
                style={{
                  background: selected?.headline === story.headline ? 'var(--bg-hover)' : 'var(--bg-card)',
                  border: selected?.headline === story.headline ? '1px solid var(--accent)' : '1px solid var(--border-light)',
                  borderRadius: 10, padding: 16, cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  animation: 'fadeIn 0.3s ease',
                }}
                onMouseEnter={(e) => { if (selected?.headline !== story.headline) e.currentTarget.style.borderColor = 'var(--border)' }}
                onMouseLeave={(e) => { if (selected?.headline !== story.headline) e.currentTarget.style.borderColor = 'var(--border-light)' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                  <span style={{
                    fontSize: 10, padding: '3px 8px', borderRadius: 12,
                    background: 'var(--bg-tertiary)',
                    color: categoryColors[story.category] || 'var(--accent)',
                    fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase',
                  }}>{story.category}</span>
                  {story.source && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{story.source}</span>}
                </div>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6, lineHeight: 1.4 }}>{story.headline}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{story.summary}</div>
              </div>
            ))
          )}
        </div>

        {selected && (
          <div style={{ position: 'sticky', top: 0, animation: 'fadeIn 0.3s ease' }}>
            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{
                      fontSize: 10, padding: '3px 8px', borderRadius: 12,
                      background: 'var(--bg-tertiary)',
                      color: categoryColors[selected.category] || 'var(--accent)',
                      fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase',
                    }}>{selected.category}</span>
                    <Icon name="sparkle" size={12} />
                    <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>AI Deep Dive</span>
                  </div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}>{selected.headline}</h3>
                </div>
                <button onClick={() => { setSelected(null); setAnalysis(null) }} style={{ padding: 4, color: 'var(--text-muted)' }}>
                  <Icon name="close" size={16} />
                </button>
              </div>
              {analysisLoading ? (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                  <Spinner /> Generating analysis…
                </div>
              ) : analysis ? (
                <>
                  <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
                    {analysis.text}
                  </div>
                  {analysis.citations.length > 0 && (
                    <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border-light)' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Sources</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {analysis.citations.slice(0, 8).map((c, i) => (
                          <a key={i} href={c.url} target="_blank" rel="noreferrer" style={{
                            fontSize: 11, color: 'var(--accent)', textDecoration: 'none',
                            display: 'flex', alignItems: 'center', gap: 4,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            <Icon name="external" size={10} />
                            {c.title}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : null}
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}

function Reminders({ apiKey }) {
  const [reminders, setReminders] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('reminders') || '[]')
    } catch { return [] }
  })
  const [newText, setNewText] = useState('')
  const [newDate, setNewDate] = useState('')
  const [events, setEvents] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    localStorage.setItem('reminders', JSON.stringify(reminders))
  }, [reminders])

  const addReminder = () => {
    if (!newText.trim()) return
    setReminders([...reminders, {
      id: Date.now(),
      text: newText.trim(),
      date: newDate || null,
      created: new Date().toISOString(),
    }])
    setNewText('')
    setNewDate('')
  }

  const removeReminder = (id) => {
    setReminders(reminders.filter((r) => r.id !== id))
  }

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await fetchJSONFromClaude({
        apiKey,
        prompt: `Search the web for major economic events and notable earnings releases this week (week of ${getDateContext()}). Include central bank meetings (Fed, ECB, BOJ, etc), inflation data, jobs data, GDP, and high-profile earnings.

Return ONLY a JSON array with this exact shape, no other text:
[{"date": "Mon, May 27", "event": "string", "type": "Economic|Earnings|Central Bank", "importance": "High|Medium|Low"}]

Order by date ascending. Include 6-12 items.`,
      })
      setEvents(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [apiKey])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  const importanceColors = {
    High: 'var(--red)',
    Medium: 'var(--yellow)',
    Low: 'var(--text-muted)',
  }

  const sortedReminders = [...reminders].sort((a, b) => {
    if (!a.date && !b.date) return b.id - a.id
    if (!a.date) return 1
    if (!b.date) return -1
    return a.date.localeCompare(b.date)
  })

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <ErrorBanner error={error} onClose={() => setError(null)} />
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Reminders & Events</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Your personal reminders and this week's market-moving events</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
        <Card>
          <SectionHeader title="My Reminders" subtitle={`${reminders.length} active`} />
          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            <input
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addReminder() }}
              placeholder="Add a reminder…"
              style={{
                flex: 1, padding: '9px 12px', fontSize: 13,
                background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 6,
              }}
            />
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              style={{
                padding: '9px 10px', fontSize: 12,
                background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 6,
                color: 'var(--text-secondary)', colorScheme: 'dark',
              }}
            />
            <button
              onClick={addReminder}
              disabled={!newText.trim()}
              style={{
                padding: '9px 12px',
                background: newText.trim() ? 'var(--accent)' : 'var(--bg-hover)',
                color: newText.trim() ? '#000' : 'var(--text-muted)',
                borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 600,
              }}
            >
              <Icon name="plus" size={14} />
            </button>
          </div>
          {sortedReminders.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              No reminders yet. Add one above.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {sortedReminders.map((r) => (
                <div key={r.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', background: 'var(--bg-tertiary)',
                  borderRadius: 6, fontSize: 13,
                  animation: 'fadeIn 0.2s ease',
                }}>
                  <div style={{ flex: 1 }}>
                    <div>{r.text}</div>
                    {r.date && (
                      <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 2 }}>
                        {new Date(r.date + 'T00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => removeReminder(r.id)}
                    style={{ padding: 6, color: 'var(--text-muted)', borderRadius: 4 }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--red)'; e.currentTarget.style.background = 'var(--red-bg)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent' }}
                  >
                    <Icon name="trash" size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <SectionHeader
            title="This Week's Events"
            subtitle="Earnings & economic data"
            action={
              <button
                onClick={fetchEvents}
                disabled={loading}
                style={{
                  padding: '6px 10px', background: 'var(--bg-tertiary)',
                  borderRadius: 6, fontSize: 11, color: 'var(--text-secondary)',
                  display: 'flex', alignItems: 'center', gap: 6,
                  opacity: loading ? 0.5 : 1,
                }}
              >
                <div style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }}>
                  <Icon name="refresh" size={11} />
                </div>
                Refresh
              </button>
            }
          />
          {loading && !events ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <Spinner /> Fetching events…
            </div>
          ) : events && events.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {events.map((e, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', background: 'var(--bg-tertiary)',
                  borderRadius: 6, fontSize: 13,
                  animation: 'fadeIn 0.2s ease',
                }}>
                  <div style={{
                    width: 4, alignSelf: 'stretch',
                    background: importanceColors[e.importance] || 'var(--text-muted)',
                    borderRadius: 2,
                  }} />
                  <div style={{ minWidth: 70, fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>{e.date}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13 }}>{e.event}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{e.type}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              No events loaded
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

function VoiceSettings() {
  const {
    settings, setSettings, voices,
    speak, stopSpeaking, isSpeaking,
    speechSupported: ttsOk, recognitionSupported: sttOk,
  } = useVoice()

  const englishVoices = voices.filter((v) => v.lang && v.lang.toLowerCase().startsWith('en'))
  const otherVoices = voices.filter((v) => !v.lang || !v.lang.toLowerCase().startsWith('en'))

  const testPhrase = "Hello. This is your AI command center. Markets are moving — let me know how I can help."

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Voice Settings</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Configure text-to-speech, speech recognition, and wake word</p>
      </div>

      {(!ttsOk || !sttOk) && (
        <Card style={{ marginBottom: 16, background: 'var(--yellow-bg)', border: '1px solid var(--yellow)' }}>
          <div style={{ fontSize: 12, color: 'var(--yellow)', fontWeight: 600, marginBottom: 4 }}>Browser support</div>
          <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>
            {!ttsOk && <>Text-to-speech is not available in this browser. </>}
            {!sttOk && <>Speech recognition is not available. Chrome, Edge, or Safari give the best results.</>}
          </div>
        </Card>
      )}

      <Card style={{ marginBottom: 16 }}>
        <SectionHeader title="Voice" subtitle="Choose how the assistant sounds" />
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {['female', 'male'].map((g) => (
            <button
              key={g}
              onClick={() => setSettings({ gender: g, voiceName: '' })}
              style={{
                flex: 1, padding: '10px 14px',
                background: settings.gender === g ? 'var(--accent-glow)' : 'var(--bg-tertiary)',
                border: settings.gender === g ? '1px solid var(--accent)' : '1px solid var(--border-light)',
                color: settings.gender === g ? 'var(--accent)' : 'var(--text-secondary)',
                borderRadius: 8, fontSize: 13, fontWeight: 600,
                textTransform: 'capitalize',
                transition: 'all 0.15s ease',
              }}
            >
              {g}
            </button>
          ))}
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: 6 }}>
            Specific voice (overrides gender)
          </label>
          <select
            value={settings.voiceName}
            onChange={(e) => setSettings({ voiceName: e.target.value })}
            style={{
              width: '100%', padding: '10px 12px',
              background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
              borderRadius: 8, fontSize: 13, color: 'var(--text-primary)',
              cursor: 'pointer',
            }}
          >
            <option value="">Auto (based on gender)</option>
            {englishVoices.length > 0 && (
              <optgroup label="English">
                {englishVoices.map((v) => (
                  <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>
                ))}
              </optgroup>
            )}
            {otherVoices.length > 0 && (
              <optgroup label="Other languages">
                {otherVoices.map((v) => (
                  <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <SectionHeader title="Speech" subtitle="Tune playback to your preference" />
        <SliderRow
          label="Speed"
          value={settings.rate} min={0.8} max={1.5} step={0.05}
          display={`${settings.rate.toFixed(2)}x`}
          onChange={(v) => setSettings({ rate: v })}
        />
        <SliderRow
          label="Pitch"
          value={settings.pitch} min={0} max={2} step={0.1}
          display={settings.pitch.toFixed(1)}
          onChange={(v) => setSettings({ pitch: v })}
        />
        <SliderRow
          label="Volume"
          value={settings.volume} min={0} max={1} step={0.05}
          display={`${Math.round(settings.volume * 100)}%`}
          onChange={(v) => setSettings({ volume: v })}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button
            onClick={() => isSpeaking ? stopSpeaking() : speak(testPhrase)}
            disabled={!ttsOk}
            style={{
              padding: '10px 16px',
              background: isSpeaking ? 'var(--red-bg)' : 'linear-gradient(135deg, var(--accent), #0099cc)',
              color: isSpeaking ? 'var(--red)' : '#000',
              border: isSpeaking ? '1px solid var(--red)' : 'none',
              borderRadius: 8, fontWeight: 600, fontSize: 13,
              display: 'flex', alignItems: 'center', gap: 8,
              opacity: ttsOk ? 1 : 0.5,
            }}
          >
            <Icon name={isSpeaking ? 'stop' : 'play'} size={12} />
            {isSpeaking ? 'Stop' : 'Test voice'}
          </button>
        </div>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <SectionHeader title="Auto-read" subtitle="Read assistant replies aloud when received" />
        <ToggleRow
          label="Read replies automatically"
          checked={settings.autoRead}
          onChange={(v) => setSettings({ autoRead: v })}
        />
      </Card>

      <Card>
        <SectionHeader
          title="Wake Word"
          subtitle="Always-listening mode (best effort — browser support varies)"
        />
        <ToggleRow
          label="Enable wake word"
          checked={settings.wakeWordEnabled}
          onChange={(v) => setSettings({ wakeWordEnabled: v })}
          disabled={!sttOk}
        />
        <div style={{ marginTop: 14 }}>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: 6 }}>
            Wake phrase
          </label>
          <input
            value={settings.wakeWord}
            onChange={(e) => setSettings({ wakeWord: e.target.value })}
            placeholder="hey atlas"
            disabled={!sttOk}
            style={{
              width: '100%', padding: '10px 12px',
              background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
              borderRadius: 8, fontSize: 13, color: 'var(--text-primary)',
              opacity: sttOk ? 1 : 0.5,
            }}
          />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
            When enabled, the app listens continuously and switches to the assistant when it hears your phrase. Continuous recognition is restarted as needed, but reliability depends on the browser and your microphone. Requires microphone permission.
          </div>
        </div>
      </Card>
    </div>
  )
}

function SliderRow({ label, value, min, max, step, display, onChange }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 12, color: 'var(--accent)', fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{display}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--accent)' }}
      />
    </div>
  )
}

function ToggleRow({ label, checked, onChange, disabled }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
    }}>
      <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{label}</span>
      <button
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        style={{
          width: 40, height: 22, borderRadius: 11,
          background: checked ? 'var(--accent)' : 'var(--bg-hover)',
          position: 'relative',
          transition: 'background 0.15s ease',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        <span style={{
          position: 'absolute', top: 2, left: checked ? 20 : 2,
          width: 18, height: 18, borderRadius: '50%',
          background: '#fff',
          transition: 'left 0.15s ease',
        }} />
      </button>
    </label>
  )
}

function AppShell() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('anthropic_api_key') || '')
  const [activeTab, setActiveTab] = useState('briefing')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [windowWidth, setWindowWidth] = useState(window.innerWidth)
  const [wakePending, setWakePending] = useState(false)

  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const saveKey = (k) => {
    localStorage.setItem('anthropic_api_key', k)
    setApiKey(k)
  }

  const resetKey = () => {
    if (confirm('Reset your API key? You will need to enter it again.')) {
      localStorage.removeItem('anthropic_api_key')
      setApiKey('')
    }
  }

  const handleWakeWord = useCallback(() => {
    setActiveTab('chat')
    setWakePending(true)
  }, [])

  const handleWakeHandled = useCallback(() => setWakePending(false), [])

  if (!apiKey) return <APIKeySetup onSave={saveKey} />

  const isMobile = windowWidth <= 768

  return (
    <VoiceProvider onWakeWord={handleWakeWord}>
      <div style={{
        display: 'flex', width: '100%', height: '100%',
        background: 'var(--bg-primary)',
      }}>
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onResetKey={resetKey}
          mobileOpen={mobileOpen}
          setMobileOpen={setMobileOpen}
        />
        <main style={{
          flex: 1, height: '100%', overflow: 'auto',
          padding: isMobile ? '60px 16px 20px' : '24px 28px',
          position: 'relative',
        }}>
          {isMobile && (
            <button
              onClick={() => setMobileOpen(true)}
              style={{
                position: 'fixed', top: 14, left: 14, zIndex: 90,
                padding: 8, background: 'var(--bg-card)',
                border: '1px solid var(--border)', borderRadius: 8,
              }}
            >
              <Icon name="menu" size={18} />
            </button>
          )}
          <WakeWordBadge />
          {activeTab === 'briefing' && <DailyBriefing apiKey={apiKey} />}
          {activeTab === 'chat' && <ChatAssistant apiKey={apiKey} wakePending={wakePending} onWakeHandled={handleWakeHandled} />}
          {activeTab === 'market' && <MarketWatch apiKey={apiKey} />}
          {activeTab === 'news' && <NewsFeed apiKey={apiKey} />}
          {activeTab === 'reminders' && <Reminders apiKey={apiKey} />}
          {activeTab === 'voice' && <VoiceSettings />}
        </main>
      </div>
    </VoiceProvider>
  )
}

function WakeWordBadge() {
  const { settings } = useVoice()
  if (!settings.wakeWordEnabled) return null
  return (
    <div style={{
      position: 'fixed', bottom: 16, right: 16, zIndex: 50,
      padding: '8px 12px', borderRadius: 20,
      background: 'var(--bg-card)', border: '1px solid var(--accent)',
      fontSize: 11, color: 'var(--accent)',
      display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600,
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: 'var(--accent)',
        animation: 'pulse 1.5s ease-in-out infinite',
      }} />
      Listening for "{settings.wakeWord}"
    </div>
  )
}

export default function App() {
  return <AppShell />
}
