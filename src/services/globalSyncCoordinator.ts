/**
 * Global Sync Coordinator
 * Prevents duplicate startup sync calls when multiple hooks initialize
 */

import { DataSeedingService } from './dataSeedingService'
import { IndexedDBService } from './indexedDBService'
import { SyncService } from './syncService'

export interface StartupSyncResult {
  success: boolean
  totalTodos: number
  totalNotes: number
  error?: string
}

export class GlobalSyncCoordinator {
  private static activeUserId: string | null = null
  private static isStartupSyncInProgress = false
  private static isStartupSyncCompleted = false
  private static startupSyncPromise: Promise<StartupSyncResult> | null = null

  /**
   * Perform startup sync only once per authenticated user, regardless of how many hooks call it.
   * When local data already exists, this still reconciles with the server so startup is not seed-only.
   */
  static async performStartupSyncOnce(userId: string): Promise<StartupSyncResult> {
    if (this.activeUserId !== userId) {
      this.reset(userId)
    }

    // If already completed for this user, return current local totals.
    if (this.isStartupSyncCompleted) {
      const stats = await IndexedDBService.getStats()
      return {
        success: true,
        totalTodos: stats.totalTodos,
        totalNotes: stats.totalNotes,
      }
    }

    // If in progress, wait for the existing promise
    if (this.isStartupSyncInProgress && this.startupSyncPromise) {
      return await this.startupSyncPromise
    }

    // Start new startup sync
    console.log('GlobalSyncCoordinator: Starting coordinated startup sync...')
    this.activeUserId = userId
    this.isStartupSyncInProgress = true
    this.startupSyncPromise = this.doStartupSync()

    try {
      const result = await this.startupSyncPromise
      this.isStartupSyncCompleted = result.success
      if (result.success) {
        console.log('GlobalSyncCoordinator: Startup sync completed successfully')
      } else {
        console.warn('GlobalSyncCoordinator: Startup sync finished with errors')
      }
      return result
    } catch (error) {
      console.error('GlobalSyncCoordinator: Startup sync failed:', error)
      throw error
    } finally {
      this.isStartupSyncInProgress = false
      this.startupSyncPromise = null
    }
  }

  private static async doStartupSync(): Promise<StartupSyncResult> {
    const needsSync = await DataSeedingService.isInitialSyncNeeded()

    if (needsSync) {
      console.log('GlobalSyncCoordinator: Initial seed needed, performing...')
      return await DataSeedingService.performInitialSync()
    }

    console.log('GlobalSyncCoordinator: Local data exists, reconciling with server...')
    const syncResult = await SyncService.sync()
    const stats = await IndexedDBService.getStats()

    return {
      success: syncResult.success,
      totalTodos: stats.totalTodos,
      totalNotes: stats.totalNotes,
      error: syncResult.error,
    }
  }

  /**
   * Reset startup sync state (for testing or re-initialization)
   */
  static reset(userId: string | null = null) {
    this.activeUserId = userId
    this.isStartupSyncCompleted = false
    this.isStartupSyncInProgress = false
    this.startupSyncPromise = null
    console.log('GlobalSyncCoordinator: Reset sync state')
  }

  /**
   * Check if startup sync has been completed
   */
  static isCompleted(): boolean {
    return this.isStartupSyncCompleted
  }

  /**
   * Check if startup sync is currently in progress
   */
  static isInProgress(): boolean {
    return this.isStartupSyncInProgress
  }
}

export default GlobalSyncCoordinator
