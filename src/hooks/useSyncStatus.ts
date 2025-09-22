import { useState, useEffect, useCallback } from 'react'
import { SyncService, type SyncStatus } from '../services/syncService'
import { IndexedDBService } from '../services/indexedDBService'

/**
 * Hook for monitoring sync status and providing sync controls
 */
export function useSyncStatus() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null)
  const [isInProgress, setIsInProgress] = useState(false)
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null)
  const [pendingItems, setPendingItems] = useState(0)
  const [failedItems, setFailedItems] = useState(0)

  // Update status from SyncService
  const updateStatus = useCallback(async () => {
    try {
      const status = await SyncService.getSyncStatus()
      setIsInProgress(status.inProgress)
      setLastSyncTime(status.lastSyncTime)
      setPendingItems(status.pendingItems)
      setFailedItems(status.failedItems)
    } catch (error) {
      console.error('Error getting sync status:', error)
    }
  }, [])

  // Listen to sync events
  useEffect(() => {
    const handleSyncStatusChange = (status: SyncStatus) => {
      setSyncStatus(status)
      
      switch (status.type) {
        case 'sync_started':
          setIsInProgress(true)
          break
          
        case 'sync_completed':
          setIsInProgress(false)
          if (status.data?.lastSyncTime) {
            setLastSyncTime(new Date(status.data.lastSyncTime as string))
          }
          updateStatus() // Refresh counts
          break
          
        case 'sync_error':
          setIsInProgress(false)
          updateStatus() // Refresh counts
          break
      }
    }

    // Add listener
    SyncService.addSyncListener(handleSyncStatusChange)
    
    // Initial status update
    updateStatus()
    
    // Cleanup
    return () => {
      SyncService.removeSyncListener(handleSyncStatusChange)
    }
  }, [updateStatus])

  // Manual sync trigger
  const triggerSync = useCallback(async () => {
    return await SyncService.sync()
  }, [])

  // Retry failed items
  const retryFailedItems = useCallback(async () => {
    return await SyncService.retryFailedItems()
  }, [])

  // Get detailed sync statistics
  const getDetailedStats = useCallback(async () => {
    return await IndexedDBService.getStats()
  }, [])

  return {
    // Status
    syncStatus,
    isInProgress,
    lastSyncTime,
    pendingItems,
    failedItems,
    
    // Actions
    triggerSync,
    retryFailedItems,
    getDetailedStats,
    refresh: updateStatus,
    
    // Computed
    hasPendingChanges: pendingItems > 0,
    hasErrors: failedItems > 0,
    canRetry: failedItems > 0,
    
    // Status messages
    statusMessage: (() => {
      if (isInProgress) return 'Syncing...'
      if (failedItems > 0) return `${failedItems} items failed to sync`
      if (pendingItems > 0) return `${pendingItems} changes pending sync`
      if (lastSyncTime) return `Last synced: ${lastSyncTime.toLocaleTimeString()}`
      return 'Ready to sync'
    })()
  }
}

export default useSyncStatus
