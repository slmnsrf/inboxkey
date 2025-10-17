import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react'

type ThemeChoice = 'light' | 'dark' | 'system'
type ResolvedTheme = 'light' | 'dark'

interface ThemeContextValue {
  theme: ThemeChoice
  resolvedTheme: ResolvedTheme
  setTheme: (choice: ThemeChoice) => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

const THEME_STORAGE_KEY = 'ui.theme'
const MATCH_MEDIA_QUERY = '(prefers-color-scheme: dark)'

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light'
  }
  return window.matchMedia(MATCH_MEDIA_QUERY).matches ? 'dark' : 'light'
}

function setDomTheme(theme: ResolvedTheme) {
  if (typeof document === 'undefined') {
    return
  }
  document.documentElement.dataset.theme = theme
}

async function readStoredTheme(): Promise<ThemeChoice | null> {
  if (typeof chrome === 'undefined' || !chrome.storage?.sync) {
    return null
  }

  try {
    const result = await chrome.storage.sync.get(THEME_STORAGE_KEY)
    const stored = result?.[THEME_STORAGE_KEY]
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored
    }
  } catch (error) {
    console.warn('[ThemeContext] Failed to read theme from storage', error)
  }

  return null
}

async function persistTheme(theme: ThemeChoice) {
  if (typeof chrome === 'undefined' || !chrome.storage?.sync) {
    return
  }

  try {
    await chrome.storage.sync.set({ [THEME_STORAGE_KEY]: theme })
  } catch (error) {
    console.warn('[ThemeContext] Failed to persist theme', error)
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>('system')
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(getSystemTheme)

  useEffect(() => {
    let isMounted = true

    readStoredTheme().then(stored => {
      if (!isMounted || stored === null) {
        setDomTheme(getSystemTheme())
        return
      }

      setThemeState(stored)
    })

    return () => {
      isMounted = false
    }
  }, [])

  // Watch system preference changes
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      setResolvedTheme('light')
      setDomTheme('light')
      return
    }

    const mediaQuery = window.matchMedia(MATCH_MEDIA_QUERY)

    const handleChange = () => {
      const nextResolved: ResolvedTheme =
        theme === 'system' ? (mediaQuery.matches ? 'dark' : 'light') : (theme as ResolvedTheme)
      setResolvedTheme(nextResolved)
      setDomTheme(nextResolved)
    }

    // Initial resolve after listeners ready
    const currentResolved =
      theme === 'system' ? (mediaQuery.matches ? 'dark' : 'light') : (theme as ResolvedTheme)
    setResolvedTheme(currentResolved)
    setDomTheme(currentResolved)

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange)
    } else if (typeof mediaQuery.addListener === 'function') {
      mediaQuery.addListener(handleChange)
    }

    return () => {
      if (typeof mediaQuery.removeEventListener === 'function') {
        mediaQuery.removeEventListener('change', handleChange)
      } else if (typeof mediaQuery.removeListener === 'function') {
        mediaQuery.removeListener(handleChange)
      }
    }
  }, [theme])

  const setTheme = useCallback((choice: ThemeChoice) => {
    setThemeState(choice)
    persistTheme(choice).catch(() => {
      /* handled above */
    })

    const nextResolved: ResolvedTheme =
      choice === 'system' ? getSystemTheme() : (choice as ResolvedTheme)
    setResolvedTheme(nextResolved)
    setDomTheme(nextResolved)
  }, [])

  const value = useMemo(
    () => ({
      theme,
      resolvedTheme,
      setTheme
    }),
    [theme, resolvedTheme, setTheme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
