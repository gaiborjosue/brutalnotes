import { SyncService } from '../services/syncService'
import { DataSeedingService } from '../services/dataSeedingService'

/**
 * Offline-first app initialization
 * Sets up sync service, network listeners, and initial data seeding
 */
export class OfflineFirstApp {
  private static initialized = false
  private static syncInterval: NodeJS.Timeout | null = null

  /**
   * Initialize the offline-first architecture
   */
  static async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('OfflineFirstApp: Already initialized')
      return
    }

    try {
      console.log('OfflineFirstApp: Initializing offline-first architecture...')

      // Setup network sync
      SyncService.setupNetworkSync()

      // Setup periodic sync (every 5 minutes when online)
      this.syncInterval = setInterval(() => {
        if (navigator.onLine) {
          SyncService.periodicSync().catch(error => {
            console.error('OfflineFirstApp: Periodic sync failed:', error)
          })
        }
      }, 5 * 60 * 1000) // 5 minutes

      this.initialized = true
      console.log('OfflineFirstApp: Initialization complete')

    } catch (error) {
      console.error('OfflineFirstApp: Initialization failed:', error)
      throw error
    }
  }

  /**
   * Cleanup resources
   */
  static cleanup(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
      this.syncInterval = null
    }
    this.initialized = false
    console.log('OfflineFirstApp: Cleanup complete')
  }

  /**
   * Force sync now
   */
  static async forceSync(): Promise<void> {
    try {
      await SyncService.sync()
    } catch (error) {
      console.error('OfflineFirstApp: Force sync failed:', error)
      throw error
    }
  }

  /**
   * Get initialization status
   */
  static isInitialized(): boolean {
    return this.initialized
  }

  /**
   * Perform initial data migration from Supabase if needed
   */
  static async performInitialMigration(): Promise<{
    success: boolean
    totalTodos: number
    totalNotes: number
    error?: string
  }> {
    try {
      console.log('OfflineFirstApp: Checking for initial migration...')
      return await DataSeedingService.performInitialSync()
    } catch (error) {
      console.error('OfflineFirstApp: Initial migration failed:', error)
      return {
        success: false,
        totalTodos: 0,
        totalNotes: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Check if app is ready for offline-first operation
   */
  static async isReady(): Promise<boolean> {
    try {
      if (!this.initialized) return false
      
      const seedingStatus = await DataSeedingService.getSeedingStatus()
      return seedingStatus.hasData || !seedingStatus.needsSync
    } catch (error) {
      console.error('OfflineFirstApp: Error checking ready status:', error)
      return false
    }
  }
}

export default OfflineFirstApp
