import { useState, useEffect } from 'react'
import en from './en.ts'
import tr from './tr.ts'

export const SUPPORTED_LOCALES = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'tr', label: 'Türkçe', flag: '🇹🇷' },
]

export const messages: Record<string, any> = { en, tr }

let currentLocale = typeof localStorage !== 'undefined' ? localStorage.getItem('locale') || 'en' : 'en'
const listeners = new Set<() => void>()

export function getLocale(): string {
  return currentLocale
}

export function setLocale(code: string) {
  currentLocale = code
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('locale', code)
  }
  listeners.forEach((fn) => fn())
}

export function t(key: string, params?: Record<string, any>, locale?: string): string {
  const loc = locale || currentLocale
  const dict = messages[loc] || messages['en']
  const parts = key.split('.')
  let res: any = dict
  for (const p of parts) {
    if (res && typeof res === 'object' && p in res) {
      res = res[p]
    } else {
      res = null
      break
    }
  }
  if (res == null) {
    let fallbackRes: any = messages['en']
    for (const p of parts) {
      if (fallbackRes && typeof fallbackRes === 'object' && p in fallbackRes) {
        fallbackRes = fallbackRes[p]
      } else {
        fallbackRes = null
        break
      }
    }
    res = fallbackRes ?? key
  }
  if (typeof res !== 'string') return String(res ?? key)
  let out = res.replace(/\{'@'\}/g, '@')
  if (params) {
    out = out.replace(/\{(\w+)\}/g, (_, k) => (k in params ? String(params[k]) : `{${k}}`))
  }
  return out
}

export function tm(key: string, locale?: string): any {
  const loc = locale || currentLocale
  const dict = messages[loc] || messages['en']
  const parts = key.split('.')
  let res: any = dict
  for (const p of parts) {
    if (res && typeof res === 'object' && p in res) {
      res = res[p]
    } else {
      res = null
      break
    }
  }
  if (res == null) {
    let fallbackRes: any = messages['en']
    for (const p of parts) {
      if (fallbackRes && typeof fallbackRes === 'object' && p in fallbackRes) {
        fallbackRes = fallbackRes[p]
      } else {
        fallbackRes = null
        break
      }
    }
    res = fallbackRes
  }
  return res
}

export function useI18n() {
  const [, setTick] = useState(0)

  useEffect(() => {
    const handler = () => setTick((v) => v + 1)
    listeners.add(handler)
    return () => {
      listeners.delete(handler)
    }
  }, [])

  return {
    t: (key: string, params?: Record<string, any>) => t(key, params, currentLocale),
    tm: (key: string) => tm(key, currentLocale),
    locale: {
      value: currentLocale,
      toString() {
        return currentLocale
      },
    },
    setLocale,
  }
}

export default { t, tm, getLocale, setLocale, useI18n, SUPPORTED_LOCALES }
