/**
 * Global Sync Coordinator
 * Prevents duplicate initial sync calls when multiple hooks initialize
 */

import { DataSeedingService } from './dataSeedingService'

export class GlobalSyncCoordinator {
  private static isInitialSyncInProgress = false
  private static isInitialSyncCompleted = false
  private static initialSyncPromise: Promise<any> | null = null

  /**
   * Perform initial sync only once, regardless of how many hooks call it
   */
  static async performInitialSyncOnce(): Promise<{
    success: boolean
    totalTodos: number
    totalNotes: number
    error?: string
  }> {
    // If already completed, return success immediately
    if (this.isInitialSyncCompleted) {
      // Reduced logging to prevent spam during development
      return { success: true, totalTodos: 0, totalNotes: 0 }
    }

    // If in progress, wait for the existing promise
    if (this.isInitialSyncInProgress && this.initialSyncPromise) {
      // Reduced logging to prevent spam during development  
      return await this.initialSyncPromise
    }

    // Start new initial sync
    console.log('GlobalSyncCoordinator: Starting coordinated initial sync...')
    this.isInitialSyncInProgress = true
    
    this.initialSyncPromise = this.doInitialSync()
    
    try {
      const result = await this.initialSyncPromise
      this.isInitialSyncCompleted = true
      console.log('GlobalSyncCoordinator: Initial sync completed successfully')
      return result
    } catch (error) {
      console.error('GlobalSyncCoordinator: Initial sync failed:', error)
      throw error
    } finally {
      this.isInitialSyncInProgress = false
      this.initialSyncPromise = null
    }
  }

  private static async doInitialSync() {
    // Check if initial sync is actually needed
    const needsSync = await DataSeedingService.isInitialSyncNeeded()
    
    if (needsSync) {
      console.log('GlobalSyncCoordinator: Initial sync needed, performing...')
      return await DataSeedingService.performInitialSync()
    } else {
      console.log('GlobalSyncCoordinator: Initial sync not needed')
      return { success: true, totalTodos: 0, totalNotes: 0 }
    }
  }

  /**
   * Reset sync state (for testing or re-initialization)
   */
  static reset() {
    this.isInitialSyncCompleted = false
    this.isInitialSyncInProgress = false
    this.initialSyncPromise = null
    console.log('GlobalSyncCoordinator: Reset sync state')
  }

  /**
   * Check if initial sync has been completed
   */
  static isCompleted(): boolean {
    return this.isInitialSyncCompleted
  }

  /**
   * Check if initial sync is currently in progress
   */
  static isInProgress(): boolean {
    return this.isInitialSyncInProgress
  }
}

export default GlobalSyncCoordinator
