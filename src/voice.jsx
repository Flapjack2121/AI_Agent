import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

export const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window
export const recognitionSupported = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

const SR = recognitionSupported ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null

export function cleanForSpeech(text) {
  if (!text) return ''
  return String(text)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/^#+\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^>\s+/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/[—–]/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()
}

const DEFAULT_SETTINGS = {
  voiceName: '',
  gender: 'female',
  rate: 1.0,
  pitch: 1.0,
  volume: 1.0,
  autoRead: false,
  wakeWord: 'hey atlas',
  wakeWordEnabled: false,
}

const VoiceContext = createContext(null)

export function useVoice() {
  const ctx = useContext(VoiceContext)
  if (!ctx) throw new Error('useVoice must be used inside VoiceProvider')
  return ctx
}

export function VoiceProvider({ children, onWakeWord }) {
  const [settings, setSettingsRaw] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('voice_settings') || '{}')
      return { ...DEFAULT_SETTINGS, ...saved }
    } catch {
      return DEFAULT_SETTINGS
    }
  })
  const [voices, setVoices] = useState([])
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')

  const wakeRecRef = useRef(null)
  const chatRecRef = useRef(null)
  const onWakeWordRef = useRef(onWakeWord)
  const settingsRef = useRef(settings)

  useEffect(() => { onWakeWordRef.current = onWakeWord }, [onWakeWord])
  useEffect(() => { settingsRef.current = settings }, [settings])

  const setSettings = useCallback((updates) => {
    setSettingsRaw((prev) => {
      const next = typeof updates === 'function' ? updates(prev) : { ...prev, ...updates }
      try { localStorage.setItem('voice_settings', JSON.stringify(next)) } catch {}
      return next
    })
  }, [])

  useEffect(() => {
    if (!speechSupported) return
    const load = () => setVoices(window.speechSynthesis.getVoices() || [])
    load()
    window.speechSynthesis.onvoiceschanged = load
    return () => { try { window.speechSynthesis.onvoiceschanged = null } catch {} }
  }, [])

  useEffect(() => {
    return () => {
      if (speechSupported) { try { window.speechSynthesis.cancel() } catch {} }
      if (wakeRecRef.current) { try { wakeRecRef.current.stop() } catch {} }
      if (chatRecRef.current) { try { chatRecRef.current.stop() } catch {} }
    }
  }, [])

  const findVoice = useCallback(() => {
    if (!voices.length) return null
    if (settings.voiceName) {
      const v = voices.find((v) => v.name === settings.voiceName)
      if (v) return v
    }
    const en = voices.filter((v) => v.lang && v.lang.toLowerCase().startsWith('en'))
    const pool = en.length ? en : voices
    const maleRx = /\b(male|david|alex|daniel|fred|jorge|tom|ralph|aaron|arthur|brian|gordon|james|matthew|oliver|mark|paul|george)\b/i
    const femaleRx = /\b(female|samantha|victoria|karen|moira|tessa|fiona|alice|allison|ava|catherine|kate|nicky|serena|susan|veena|zoe|emma|sophia|olivia)\b/i
    if (settings.gender === 'male') {
      const m = pool.find((v) => maleRx.test(v.name) && !/female/i.test(v.name))
      if (m) return m
    } else {
      const f = pool.find((v) => femaleRx.test(v.name))
      if (f) return f
    }
    return pool[0]
  }, [voices, settings.voiceName, settings.gender])

  const speakChunks = useCallback((chunks, opts = {}) => {
    if (!speechSupported) { opts.onUnsupported?.(); return }
    try { window.speechSynthesis.cancel() } catch {}
    const cleaned = chunks.map(cleanForSpeech).filter(Boolean)
    if (!cleaned.length) return
    const voice = findVoice()
    setIsSpeaking(true)
    let i = 0
    let cancelled = false
    const speakNext = () => {
      if (cancelled) return
      if (i >= cleaned.length) {
        setIsSpeaking(false)
        opts.onEnd?.()
        return
      }
      const u = new SpeechSynthesisUtterance(cleaned[i])
      if (voice) u.voice = voice
      u.rate = settings.rate
      u.pitch = settings.pitch
      u.volume = settings.volume
      u.onend = () => { i++; setTimeout(speakNext, opts.pauseMs ?? 350) }
      u.onerror = () => { i++; setTimeout(speakNext, 50) }
      try { window.speechSynthesis.speak(u) } catch { setIsSpeaking(false) }
    }
    speakNext()
    return () => { cancelled = true }
  }, [findVoice, settings.rate, settings.pitch, settings.volume])

  const speak = useCallback((text, opts) => speakChunks([text], opts), [speakChunks])

  const stopSpeaking = useCallback(() => {
    if (!speechSupported) return
    try { window.speechSynthesis.cancel() } catch {}
    setIsSpeaking(false)
  }, [])

  const startWakeListener = useCallback(() => {
    if (!recognitionSupported || !SR) return
    if (wakeRecRef.current || chatRecRef.current) return
    const rec = new SR()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = 'en-US'
    wakeRecRef.current = rec

    rec.onresult = (e) => {
      const last = e.results[e.results.length - 1]
      const text = last[0].transcript.toLowerCase().trim()
      const wake = (settingsRef.current.wakeWord || 'hey atlas').toLowerCase().trim()
      if (text.includes(wake)) {
        try { rec.stop() } catch {}
        wakeRecRef.current = null
        onWakeWordRef.current?.()
      }
    }
    rec.onend = () => {
      wakeRecRef.current = null
      if (settingsRef.current.wakeWordEnabled && !chatRecRef.current) {
        setTimeout(() => startWakeListener(), 300)
      }
    }
    rec.onerror = (e) => {
      wakeRecRef.current = null
      if (e.error !== 'not-allowed' && e.error !== 'service-not-allowed' && settingsRef.current.wakeWordEnabled) {
        setTimeout(() => startWakeListener(), 1000)
      }
    }
    try { rec.start() } catch { wakeRecRef.current = null }
  }, [])

  const stopWakeListener = useCallback(() => {
    if (wakeRecRef.current) {
      try { wakeRecRef.current.stop() } catch {}
      wakeRecRef.current = null
    }
  }, [])

  useEffect(() => {
    if (settings.wakeWordEnabled && !chatRecRef.current) startWakeListener()
    else stopWakeListener()
    return () => stopWakeListener()
  }, [settings.wakeWordEnabled, settings.wakeWord, startWakeListener, stopWakeListener])

  const startListening = useCallback((onFinal) => {
    if (!recognitionSupported || !SR) return
    if (chatRecRef.current) { try { chatRecRef.current.stop() } catch {} }
    stopWakeListener()
    const rec = new SR()
    rec.continuous = false
    rec.interimResults = true
    rec.lang = 'en-US'
    chatRecRef.current = rec
    setTranscript('')
    setIsListening(true)

    rec.onresult = (e) => {
      let text = ''
      let hasFinal = false
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript
        if (e.results[i].isFinal) hasFinal = true
      }
      setTranscript(text)
      if (hasFinal && onFinal) onFinal(text.trim())
    }
    rec.onend = () => {
      setIsListening(false)
      chatRecRef.current = null
      if (settingsRef.current.wakeWordEnabled) setTimeout(() => startWakeListener(), 300)
    }
    rec.onerror = () => {
      setIsListening(false)
      chatRecRef.current = null
      if (settingsRef.current.wakeWordEnabled) setTimeout(() => startWakeListener(), 500)
    }
    try { rec.start() } catch {
      setIsListening(false)
      chatRecRef.current = null
    }
  }, [startWakeListener, stopWakeListener])

  const stopListening = useCallback(() => {
    if (chatRecRef.current) {
      try { chatRecRef.current.stop() } catch {}
    }
  }, [])

  return (
    <VoiceContext.Provider value={{
      settings, setSettings, voices,
      isSpeaking, speak, speakChunks, stopSpeaking,
      isListening, transcript, startListening, stopListening,
      speechSupported, recognitionSupported,
    }}>
      {children}
    </VoiceContext.Provider>
  )
}
