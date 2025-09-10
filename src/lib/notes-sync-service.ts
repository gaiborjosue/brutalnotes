// BRUTAL NOTES - Notes Sync Service
// Handles offline-first synchronization between IndexedDB and backend API for notes

import ApiService from './api-service'
import { db } from './database'
import type { Note } from './types'

interface SyncResult {
  success: boolean
  syncedCount: number
  errorCount: number
  errors: string[]
}

class NotesSyncService {
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
  // NOTES SYNC METHODS
  // =================

  // Sync all pending notes with backend using bulk sync
  static async syncNotes(): Promise<SyncResult> {
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
      // Get all pending notes from local database
      const pendingNotes = await db.notes
        .where('syncStatus')
        .equals('pending')
        .toArray()

      if (pendingNotes.length === 0) {
        console.log('📤 No pending notes to sync')
        result.success = true
        return result
      }

      console.log(`📤 Found ${pendingNotes.length} pending notes for bulk sync`)

      // Separate notes by operation type
      const notesToSync = pendingNotes.filter(note => !note.deleted)
      const deletedNotes = pendingNotes.filter(note => note.deleted)

      // Handle deleted notes separately (they need individual DELETE calls)
      const deletedClientIds: number[] = []
      for (const deletedNote of deletedNotes) {
        try {
          if (deletedNote.serverId) {
            await this.syncDeletedNote(deletedNote)
            result.syncedCount++
          } else if (deletedNote.clientId) {
            // Local-only note - add to deletion list and remove immediately
            deletedClientIds.push(deletedNote.clientId)
            if (deletedNote.id) {
              await db.notes.delete(deletedNote.id)
            }
            result.syncedCount++
          }
        } catch (error) {
          console.error('Failed to sync deleted note:', deletedNote, error)
          result.errorCount++
          result.errors.push(`Failed to delete "${deletedNote.title}": ${error}`)
        }
      }

      // Bulk sync remaining notes (creates + updates)
      if (notesToSync.length > 0) {
        try {
          // Ensure all notes have clientId set (for legacy notes)
          for (const note of notesToSync) {
            if (!note.clientId && note.id) {
              await db.notes.update(note.id, { clientId: note.id })
              note.clientId = note.id
            }
          }
          
          const bulkResult = await ApiService.bulkSyncNotes(notesToSync, deletedClientIds)
          
          if (bulkResult.success && bulkResult.data) {
            // Update local notes with server data
            for (const serverNote of bulkResult.data) {
              const localNote = notesToSync.find(n => 
                n.clientId === serverNote.clientId || n.id === serverNote.clientId
              )
              
              if (localNote && localNote.id) {
                await db.notes.update(localNote.id, {
                  serverId: serverNote.serverId,
                  serverParentId: serverNote.serverParentId,
                  syncStatus: 'synced',
                  updatedAt: new Date()
                })
                result.syncedCount++
              }
            }
          } else {
            result.errorCount += notesToSync.length
            result.errors.push(bulkResult.error || 'Bulk sync failed')
          }
        } catch (error) {
          console.error('Bulk sync failed:', error)
          result.errorCount += notesToSync.length
          result.errors.push(`Bulk sync failed: ${error}`)
        }
      }

      result.success = result.errorCount === 0
      console.log(`✅ Bulk sync complete: ${result.syncedCount} synced, ${result.errorCount} errors`)
      
      return result
    } catch (error) {
      result.errors.push(`Sync failed: ${error}`)
      console.error('Notes sync failed:', error)
      return result
    }
  }

  // Sync a deleted note to backend
  private static async syncDeletedNote(localNote: Note): Promise<void> {
    if (!localNote.serverId) {
      throw new Error('Cannot delete note on server without server ID')
    }

    console.log(`🗑️ Syncing deletion of note "${localNote.title}" to server (ID: ${localNote.serverId})`)
    const apiResult = await ApiService.deleteNote(localNote.serverId)
    
    if (!apiResult.success) {
      console.error(`❌ Failed to delete note "${localNote.title}" on server:`, apiResult.error)
      throw new Error(apiResult.error || 'Failed to delete note on server')
    }

    console.log(`✅ Successfully deleted note "${localNote.title}" on server`)

    // Delete from local database after successful server deletion
    if (localNote.id) {
      console.log(`🧹 Cleaning up local record for deleted note "${localNote.title}"`)
      await db.notes.delete(localNote.id)
    }
  }

  // =================
  // PULL SYNC (Server -> Local)
  // =================

  // Pull all notes from server and merge with local data
  static async pullNotesFromServer(): Promise<SyncResult> {
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
      // Get all notes from server (backend already filters out soft-deleted)
      const apiResult = await ApiService.getAllNotes()
      
      if (!apiResult.success || !apiResult.data) {
        result.errors.push(apiResult.error || 'Failed to fetch notes from server')
        return result
      }

      const serverNotes = apiResult.data
      console.log(`📥 Pulling ${serverNotes.length} active notes from server`)

      // Merge server notes with local data
      for (const serverNote of serverNotes) {
        try {
          await this.mergeServerNote(serverNote)
          result.syncedCount++
        } catch (error) {
          result.errorCount++
          result.errors.push(`Failed to merge note "${serverNote.title}": ${error}`)
        }
      }

      // Clean up local notes that no longer exist on server
      // (i.e., were soft-deleted on server and are no longer returned)
      await this.cleanupDeletedServerNotes(serverNotes)

      result.success = result.errorCount === 0
      console.log(`✅ Pull complete: ${result.syncedCount} merged, ${result.errorCount} errors`)
      
      return result
    } catch (error) {
      result.errors.push(`Pull failed: ${error}`)
      console.error('Notes pull failed:', error)
      return result
    }
  }

  // Merge a server note with local data
  private static async mergeServerNote(serverNote: Note): Promise<void> {
    const serverId = serverNote.serverId
    if (!serverId) {
      throw new Error('Server note missing ID')
    }

    // Check if we already have this note locally
    const existingNote = await db.notes.where('serverId').equals(serverId).first()

    if (existingNote) {
      // Don't overwrite local deletions that are pending sync
      if (existingNote.deleted && existingNote.syncStatus === 'pending') {
        console.log(`🚫 Skipping server update for locally deleted note: ${existingNote.title}`)
        return
      }
      
      // Update existing local note if server version is newer
      const serverDate = new Date(serverNote.updatedAt)
      const localDate = new Date(existingNote.updatedAt)
      
      if (serverDate > localDate && existingNote.syncStatus !== 'pending') {
        await db.notes.update(existingNote.id!, {
          title: serverNote.title,
          content: serverNote.content,
          path: serverNote.path,
          isFolder: serverNote.isFolder,
          serverParentId: serverNote.serverParentId,
          updatedAt: serverDate,
          syncStatus: 'synced',
          deleted: false // Only set to false if not locally deleted
        })
      }
    } else {
      // Create new local note from server data
      // Since backend already filters out soft-deleted notes,
      // any note we receive from server is guaranteed to be active
      await db.notes.add({
        serverId: serverId,
        serverParentId: serverNote.serverParentId,
        clientId: serverNote.clientId,
        title: serverNote.title,
        content: serverNote.content,
        path: serverNote.path,
        isFolder: serverNote.isFolder,
        createdAt: new Date(serverNote.createdAt),
        updatedAt: new Date(serverNote.updatedAt),
        syncStatus: 'synced',
        deleted: false // Explicitly mark as not deleted
      })
    }
  }

  // Clean up local notes that no longer exist on server (were soft-deleted on server)
  private static async cleanupDeletedServerNotes(serverNotes: Note[]): Promise<void> {
    try {
      // Get all local notes that have server IDs and are synced
      const localSyncedNotes = await db.notes
        .where('syncStatus')
        .equals('synced')
        .and(note => !!note.serverId && !note.deleted)
        .toArray()

      // Get server IDs from the received notes
      const serverIds = new Set(
        serverNotes.map(note => note.serverId).filter(Boolean) as string[]
      )

      // Find local notes that are no longer on server
      const notesToRemove = localSyncedNotes.filter(
        local => local.serverId && !serverIds.has(local.serverId)
      )

      if (notesToRemove.length > 0) {
        console.log(`🧹 Removing ${notesToRemove.length} locally synced notes that were deleted on server`)
        
        // Hard delete these notes since they're already soft-deleted on server
        for (const note of notesToRemove) {
          if (note.id) {
            await db.notes.delete(note.id)
          }
        }
      }
    } catch (error) {
      console.warn('Failed to cleanup deleted server notes:', error)
    }
  }

  // =================
  // FULL SYNC
  // =================

  // Perform full bidirectional sync (push local changes, then pull server changes)
  static async performFullSync(): Promise<SyncResult> {
    console.log('🔄 Starting full bidirectional notes sync...')

    // First push local changes to server
    const pushResult = await this.syncNotes()
    
    // Then pull server changes to local
    const pullResult = await this.pullNotesFromServer()

    // Combine results
    const combinedResult: SyncResult = {
      success: pushResult.success && pullResult.success,
      syncedCount: pushResult.syncedCount + pullResult.syncedCount,
      errorCount: pushResult.errorCount + pullResult.errorCount,
      errors: [...pushResult.errors, ...pullResult.errors]
    }

    console.log(`🔄 Full notes sync complete:`, combinedResult)
    return combinedResult
  }

  // =================
  // AUTO SYNC
  // =================

  // Setup automatic sync when online
  static setupAutoSync(): void {
    // Sync on page load if online
    if (this.isOnline()) {
      setTimeout(() => this.performFullSync(), 3000) // 3 second delay for notes (longer than todos)
    }

    // Listen for online/offline events
    window.addEventListener('online', () => {
      console.log('📶 Device came online - waiting for network to stabilize (notes)...')
      // Wait longer for network to fully stabilize after coming online
      setTimeout(async () => {
        console.log('🔄 Network should be stable now, attempting notes sync...')
        try {
          await this.performFullSync()
        } catch (error) {
          console.warn('Notes sync after coming online failed:', error)
          // Retry once more after additional delay
          setTimeout(() => {
            console.log('🔄 Retrying notes sync...')
            this.performFullSync().catch(err => 
              console.error('Retry notes sync also failed:', err)
            )
          }, 5000)
        }
      }, 4000) // Increased from 3 to 4 seconds for notes
    })

    window.addEventListener('offline', () => {
      console.log('📵 Device went offline - notes sync disabled')
    })

    // Periodic sync every 15 minutes when online (less aggressive than todos)
    setInterval(async () => {
      if (this.isOnline()) {
        try {
          console.log('⏰ Performing periodic notes sync...')
          await this.performFullSync()
        } catch (error) {
          console.warn('Periodic notes sync failed (this is normal):', error)
        }
      }
    }, 15 * 60 * 1000) // 15 minutes
  }
}

export default NotesSyncService