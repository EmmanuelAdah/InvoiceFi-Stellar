import { useState, useEffect } from 'react'

export interface NetworkStatus {
  isOnline: boolean
  lastChecked: number
}

const OFFLINE_THRESHOLD_MS = 3000

export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline] = useState(() => {
    if (typeof window === 'undefined') return true
    return navigator.onLine
  })
  const [lastChecked, setLastChecked] = useState(() => Date.now())

  useEffect(() => {
    let timeoutId: NodeJS.Timeout | null = null

    const handleOnline = () => {
      setIsOnline(true)
      setLastChecked(Date.now())
    }

    const handleOffline = () => {
      timeoutId = setTimeout(() => {
        setIsOnline(false)
        setLastChecked(Date.now())
      }, OFFLINE_THRESHOLD_MS)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      if (timeoutId) clearTimeout(timeoutId)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return { isOnline, lastChecked }
}
