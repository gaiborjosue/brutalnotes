import { useState, useEffect } from 'react'

/**
 * Hook for detecting online/offline status
 * Returns current online status and triggers sync when coming back online
 */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(() => {
    // Initialize with current navigator status, defaulting to true in SSR
    return typeof navigator !== 'undefined' ? navigator.onLine : true
  })

  const [wasOffline, setWasOffline] = useState(false)

  useEffect(() => {
    // Only run in browser environment
    if (typeof window === 'undefined') return

    const handleOnline = () => {
      console.log('Network: Connection restored')
      setIsOnline(true)
      setWasOffline(false)
    }

    const handleOffline = () => {
      console.log('Network: Connection lost')
      setIsOnline(false)
      setWasOffline(true)
    }

    // Add event listeners
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Initial check
    setIsOnline(navigator.onLine)

    // Cleanup
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return {
    isOnline,
    wasOffline,
    isOnlineAfterOffline: isOnline && wasOffline
  }
}

export default useOnlineStatus
