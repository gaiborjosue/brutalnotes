// BRUTAL NOTES - Sync Service
// Handles offline-first synchronization between IndexedDB and backend API

import ApiService from './api-service'
import { db } from './database'
import type { Todo } from './types'

interface SyncResult {
  success: boolean
  syncedCount: number
  errorCount: number
  errors: string[]
}

class SyncService {
  private static isOnline(): boolean {
    return navigator.onLine
  }

  private static async isBackendReachable(): Promise<boolean> {
    try {
      return await ApiService.isBackendReachable()
    } catch {
      return false
    }
  }

  // =================
  // TODO SYNC METHODS
  // =================

  // Sync all pending todos with backend using bulk sync
  static async syncTodos(): Promise<SyncResult> {
    const result: SyncResult = {
      success: false,
      syncedCount: 0,
      errorCount: 0,
      errors: []
    }

    // Check connectivity first
    if (!this.isOnline()) {
      result.errors.push('Device is offline')
      return result
    }

    // Wait a bit if we just came online to let network stabilize
    await new Promise(resolve => setTimeout(resolve, 2000))

    const backendReachable = await this.isBackendReachable()
    if (!backendReachable) {
      result.errors.push('Backend server is not reachable - network may still be connecting')
      return result
    }

    try {
      // Get all pending todos from local database
      const pendingTodos = await db.todos
        .where('syncStatus')
        .equals('pending')
        .toArray()

      if (pendingTodos.length === 0) {
        console.log('📤 No pending todos to sync')
        result.success = true
        return result
      }

      console.log(`📤 Found ${pendingTodos.length} pending todos for bulk sync`)

      // Separate todos by operation type
      const todosToSync = pendingTodos.filter(todo => !todo.deleted)
      const deletedTodos = pendingTodos.filter(todo => todo.deleted)

      // Handle deleted todos separately (they need individual DELETE calls)
      const deletedClientIds: number[] = []
      for (const deletedTodo of deletedTodos) {
        try {
          if (deletedTodo.serverId) {
            await this.syncDeletedTodo(deletedTodo)
            result.syncedCount++
          } else if (deletedTodo.clientId) {
            // Local-only todo - add to deletion list and remove immediately
            deletedClientIds.push(deletedTodo.clientId)
            if (deletedTodo.id) {
              await db.todos.delete(deletedTodo.id)
            }
            result.syncedCount++
          }
        } catch (error) {
          console.error('Failed to sync deleted todo:', deletedTodo, error)
          result.errorCount++
          result.errors.push(`Failed to delete "${deletedTodo.text}": ${error}`)
        }
      }

      // Bulk sync remaining todos (creates + updates)
      if (todosToSync.length > 0) {
        try {
          // Ensure all todos have clientId set (for legacy todos)
          for (const todo of todosToSync) {
            if (!todo.clientId && todo.id) {
              await db.todos.update(todo.id, { clientId: todo.id })
              todo.clientId = todo.id
            }
          }
          
          const bulkResult = await ApiService.bulkSyncTodos(todosToSync, deletedClientIds)
          
          if (bulkResult.success && bulkResult.data) {
            // Update local todos with server data
            for (const serverTodo of bulkResult.data) {
              const localTodo = todosToSync.find(t => 
                t.clientId === serverTodo.clientId || t.id === serverTodo.clientId
              )
              
              if (localTodo && localTodo.id) {
                await db.todos.update(localTodo.id, {
                  serverId: serverTodo.serverId,
                  syncStatus: 'synced',
                  updatedAt: new Date()
                })
                result.syncedCount++
              }
            }
          } else {
            result.errorCount += todosToSync.length
            result.errors.push(bulkResult.error || 'Bulk sync failed')
          }
        } catch (error) {
          console.error('Bulk sync failed:', error)
          result.errorCount += todosToSync.length
          result.errors.push(`Bulk sync failed: ${error}`)
        }
      }

      result.success = result.errorCount === 0
      console.log(`✅ Bulk sync complete: ${result.syncedCount} synced, ${result.errorCount} errors`)
      
      return result
    } catch (error) {
      result.errors.push(`Sync failed: ${error}`)
      console.error('Todo sync failed:', error)
      return result
    }
  }

  // NOTE: Legacy individual sync methods removed in favor of bulk sync for better performance

  // Sync a deleted todo to backend
  private static async syncDeletedTodo(localTodo: Todo): Promise<void> {
    if (!localTodo.serverId) {
      throw new Error('Cannot delete todo on server without server ID')
    }

    const apiResult = await ApiService.deleteTodo(localTodo.serverId)
    
    if (!apiResult.success) {
      throw new Error(apiResult.error || 'Failed to delete todo on server')
    }

    // Delete from local database after successful server deletion
    if (localTodo.id) {
      await db.todos.delete(localTodo.id)
    }
  }

  // =================
  // PULL SYNC (Server -> Local)
  // =================

  // Pull all todos from server and merge with local data
  static async pullTodosFromServer(): Promise<SyncResult> {
    const result: SyncResult = {
      success: false,
      syncedCount: 0,
      errorCount: 0,
      errors: []
    }

    if (!this.isOnline() || !await this.isBackendReachable()) {
      result.errors.push('Cannot pull from server: offline or unreachable')
      return result
    }

    try {
      // Get all todos from server (backend already filters out soft-deleted)
      const apiResult = await ApiService.getAllTodos()
      
      if (!apiResult.success || !apiResult.data) {
        result.errors.push(apiResult.error || 'Failed to fetch todos from server')
        return result
      }

      const serverTodos = apiResult.data
      console.log(`📥 Pulling ${serverTodos.length} active todos from server`)

      // Merge server todos with local data
      for (const serverTodo of serverTodos) {
        try {
          await this.mergeServerTodo(serverTodo)
          result.syncedCount++
        } catch (error) {
          result.errorCount++
          result.errors.push(`Failed to merge todo "${serverTodo.text}": ${error}`)
        }
      }

      // Clean up local todos that no longer exist on server
      // (i.e., were soft-deleted on server and are no longer returned)
      await this.cleanupDeletedServerTodos(serverTodos)

      result.success = result.errorCount === 0
      console.log(`✅ Pull complete: ${result.syncedCount} merged, ${result.errorCount} errors`)
      
      return result
    } catch (error) {
      result.errors.push(`Pull failed: ${error}`)
      console.error('Todo pull failed:', error)
      return result
    }
  }

  // Merge a server todo with local data
  private static async mergeServerTodo(serverTodo: Todo): Promise<void> {
    const serverId = serverTodo.id || serverTodo.serverId
    if (!serverId) {
      throw new Error('Server todo missing ID')
    }

    // Check if we already have this todo locally
    const existingTodo = await db.todos.where('serverId').equals(String(serverId)).first()

    if (existingTodo) {
      // Update existing local todo if server version is newer
      const serverDate = new Date(serverTodo.updatedAt)
      const localDate = new Date(existingTodo.updatedAt)
      
      if (serverDate > localDate && existingTodo.syncStatus !== 'pending') {
        await db.todos.update(existingTodo.id!, {
          text: serverTodo.text,
          completed: serverTodo.completed,
          updatedAt: serverDate,
          syncStatus: 'synced',
          deleted: false // Ensure not marked as deleted since it came from server
        })
      }
    } else {
      // Create new local todo from server data
      // Since backend already filters out soft-deleted todos,
      // any todo we receive from server is guaranteed to be active
      await db.todos.add({
        serverId: String(serverId),
        text: serverTodo.text,
        completed: serverTodo.completed,
        createdAt: new Date(serverTodo.createdAt),
        updatedAt: new Date(serverTodo.updatedAt),
        syncStatus: 'synced',
        deleted: false // Explicitly mark as not deleted
      })
    }
  }

  // Clean up local todos that no longer exist on server (were soft-deleted on server)
  private static async cleanupDeletedServerTodos(serverTodos: Todo[]): Promise<void> {
    try {
      // Get all local todos that have server IDs and are synced
      const localSyncedTodos = await db.todos
        .where('syncStatus')
        .equals('synced')
        .and(todo => !!todo.serverId && !todo.deleted)
        .toArray()

      // Get server IDs from the received todos
      const serverIds = new Set(
        serverTodos.map(todo => String(todo.id || todo.serverId)).filter(Boolean)
      )

      // Find local todos that are no longer on server
      const todosToRemove = localSyncedTodos.filter(
        local => local.serverId && !serverIds.has(local.serverId)
      )

      if (todosToRemove.length > 0) {
        console.log(`🧹 Removing ${todosToRemove.length} locally synced todos that were deleted on server`)
        
        // Hard delete these todos since they're already soft-deleted on server
        for (const todo of todosToRemove) {
          if (todo.id) {
            await db.todos.delete(todo.id)
          }
        }
      }
    } catch (error) {
      console.warn('Failed to cleanup deleted server todos:', error)
    }
  }

  // =================
  // FULL SYNC
  // =================

  // Perform full bidirectional sync (push local changes, then pull server changes)
  static async performFullSync(): Promise<SyncResult> {
    console.log('🔄 Starting full bidirectional sync...')

    // First push local changes to server
    const pushResult = await this.syncTodos()
    
    // Then pull server changes to local
    const pullResult = await this.pullTodosFromServer()

    // Combine results
    const combinedResult: SyncResult = {
      success: pushResult.success && pullResult.success,
      syncedCount: pushResult.syncedCount + pullResult.syncedCount,
      errorCount: pushResult.errorCount + pullResult.errorCount,
      errors: [...pushResult.errors, ...pullResult.errors]
    }

    console.log(`🔄 Full sync complete:`, combinedResult)
    return combinedResult
  }

  // =================
  // AUTO SYNC
  // =================

  // Setup automatic sync when online
  static setupAutoSync(): void {
    // Sync on page load if online
    if (this.isOnline()) {
      setTimeout(() => this.performFullSync(), 2000) // 2 second delay
    }

    // Listen for online/offline events
    window.addEventListener('online', () => {
      console.log('📶 Device came online - waiting for network to stabilize...')
      // Wait longer for network to fully stabilize after coming online
      setTimeout(async () => {
        console.log('🔄 Network should be stable now, attempting sync...')
        try {
          await this.performFullSync()
        } catch (error) {
          console.warn('Sync after coming online failed:', error)
          // Retry once more after additional delay
          setTimeout(() => {
            console.log('🔄 Retrying sync...')
            this.performFullSync().catch(err => 
              console.error('Retry sync also failed:', err)
            )
          }, 5000)
        }
      }, 3000) // Increased from 1 second to 3 seconds
    })

    window.addEventListener('offline', () => {
      console.log('📵 Device went offline - sync disabled')
    })

    // Periodic sync every 10 minutes when online (less aggressive)
    setInterval(async () => {
      if (this.isOnline()) {
        // Quick check without full backend reachability test
        try {
          console.log('⏰ Performing periodic sync...')
          await this.performFullSync()
        } catch (error) {
          console.warn('Periodic sync failed (this is normal):', error)
        }
      }
    }, 10 * 60 * 1000) // 10 minutes
  }
}

export default SyncService