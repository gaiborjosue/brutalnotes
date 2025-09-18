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

export class NotesSyncService {
  private static isOnline(): boolean {
    return navigator.onLine
  }

  private static normalizePath(path?: string | null): string {
    if (!path) {
      return ''
    }
    return path.replace(/^\/+|\/+$/g, '')
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

      // Ensure folders sync before their child notes so parents exist server-side
      notesToSync.sort((a, b) => Number(!a.isFolder) - Number(!b.isFolder))

      // Make sure legacy notes have parentClientId populated before syncing
      for (const note of notesToSync) {
        if (note.parentId !== undefined && note.parentClientId === undefined) {
          note.parentClientId = note.parentId
          if (note.id) {
            await db.notes.update(note.id, { parentClientId: note.parentId })
          }
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
                  parentClientId: localNote.parentClientId ?? localNote.parentId,
                  syncStatus: 'synced',
                  updatedAt: serverNote.updatedAt
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
      // Ensure parent folders are processed before their children
      serverNotes.sort((a, b) => Number(!a.isFolder) - Number(!b.isFolder))
      console.log(`📥 Pulling ${serverNotes.length} active notes from server`)

      // Merge server notes with local data and map server IDs to local IDs
      const serverIdToLocalId = new Map<string, number>()
      const clientIdToLocalId = new Map<number, number>()

      // Pre-seed with any already known mappings to reduce lookups
      const serverIds = serverNotes.map(note => note.serverId).filter(Boolean) as string[]
      if (serverIds.length > 0) {
        const knownLocalNotes = await db.notes
          .where('serverId')
          .anyOf(serverIds)
          .toArray()
        for (const local of knownLocalNotes) {
          if (local.serverId && local.id) {
            serverIdToLocalId.set(local.serverId, local.id)
          }
          if (local.clientId !== undefined && local.id !== undefined) {
            clientIdToLocalId.set(local.clientId, local.id)
          }
        }
      }

      // Merge server notes with local data
      const staleServerRecords: Array<{ serverId: string; clientId?: number }> = []

      for (const serverNote of serverNotes) {
        try {
          const localId = await this.mergeServerNote(serverNote, staleServerRecords)
          if (serverNote.serverId && localId) {
            serverIdToLocalId.set(serverNote.serverId, localId)
          }
          if (localId !== undefined) {
            const localNote = await db.notes.get(localId)
            if (localNote?.clientId !== undefined) {
              clientIdToLocalId.set(localNote.clientId, localId)
            }
          }
          result.syncedCount++
        } catch (error) {
          result.errorCount++
          result.errors.push(`Failed to merge note "${serverNote.title}": ${error}`)
        }
      }

      await this.deleteStaleServerRecords(staleServerRecords)

      // Once all notes exist locally, reconnect parent/child relationships
      await this.updateLocalParentReferences(serverNotes, serverIdToLocalId, clientIdToLocalId)

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
  private static async mergeServerNote(
    serverNote: Note,
    staleRecords: Array<{ serverId: string; clientId?: number }>
  ): Promise<number | undefined> {
    const serverId = serverNote.serverId
    if (!serverId) {
      throw new Error('Server note missing ID')
    }

    // Check if we already have this note locally
    let existingNote = await db.notes.where('serverId').equals(serverId).first()

    if (existingNote) {
      // Don't overwrite local deletions that are pending sync
      if (existingNote.deleted && existingNote.syncStatus === 'pending') {
        console.log(`🚫 Skipping server update for locally deleted note: ${existingNote.title}`)
        return existingNote.id ?? undefined
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
      return existingNote.id ?? undefined
    } else {
      // Fallback: match by path to reuse existing local record before creating a duplicate
      const normalizedPath = this.normalizePath(serverNote.path)
      const noteByPath = normalizedPath
        ? await db.notes.where('path').equals(normalizedPath).first()
        : undefined

      if (noteByPath?.id !== undefined) {
        const parentFromPath = await this.getParentFromPath(normalizedPath)
        const localUpdatedAt = new Date(noteByPath.updatedAt)
        const serverDate = new Date(serverNote.updatedAt)
        const differentServerId = Boolean(noteByPath.serverId && noteByPath.serverId !== serverId)
        const incomingClientId = serverNote.clientId
        const existingClientId = noteByPath.clientId
        const differentClientIds =
          incomingClientId !== undefined && existingClientId !== undefined && incomingClientId !== existingClientId

        if (differentServerId && (differentClientIds || localUpdatedAt >= serverDate)) {
          console.log('⏭️ Skipping stale server note judged older than local copy', {
            path: normalizedPath,
            localUpdatedAt: localUpdatedAt.toISOString(),
            serverUpdatedAt: serverDate.toISOString(),
            localServerId: noteByPath.serverId,
            incomingServerId: serverId,
            incomingClientId,
            localClientId: existingClientId
          })

          if (serverId) {
            staleRecords.push({
              serverId,
              clientId:
                incomingClientId !== undefined && incomingClientId !== existingClientId
                  ? incomingClientId
                  : undefined
            })
          }

          return noteByPath.id
        }

        existingNote = noteByPath
        await db.notes.update(noteByPath.id, {
          serverId: serverId,
          clientId: serverNote.clientId ?? noteByPath.clientId,
          serverParentId: serverNote.serverParentId,
          title: serverNote.title,
          content: serverNote.content,
          path: normalizedPath,
          isFolder: serverNote.isFolder,
          updatedAt: serverDate,
          createdAt: new Date(serverNote.createdAt),
          syncStatus: 'synced',
          deleted: false,
          parentId: parentFromPath?.parentId,
          parentClientId: parentFromPath?.parentClientId
        })
        return noteByPath.id
      }

      // Create new local note from server data
      // Since backend already filters out soft-deleted notes,
      // any note we receive from server is guaranteed to be active
      const parentFromPath = await this.getParentFromPath(this.normalizePath(serverNote.path))
      const localId = await db.notes.add({
        serverId: serverId,
        serverParentId: serverNote.serverParentId,
        clientId: serverNote.clientId,
        title: serverNote.title,
        content: serverNote.content,
        path: this.normalizePath(serverNote.path),
        isFolder: serverNote.isFolder,
        createdAt: new Date(serverNote.createdAt),
        updatedAt: new Date(serverNote.updatedAt),
        syncStatus: 'synced',
        deleted: false, // Explicitly mark as not deleted
        parentId: parentFromPath?.parentId,
        parentClientId: parentFromPath?.parentClientId
      })
      return localId
    }

    return existingNote?.id ?? undefined
  }

  private static async getParentFromPath(path: string): Promise<{ parentId?: number; parentClientId?: number }> {
    if (!path) {
      return {}
    }
    const segments = path.split('/').filter(Boolean)
    if (segments.length <= 1) {
      return {}
    }
    const parentPath = segments.slice(0, -1).join('/')
    const parentNote = await db.notes.where('path').equals(parentPath).first()
    if (parentNote?.id !== undefined) {
      return {
        parentId: parentNote.id,
        parentClientId: parentNote.clientId ?? parentNote.id
      }
    }
    return {}
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

  private static async deleteStaleServerRecords(
    records: Array<{ serverId: string; clientId?: number }>
  ): Promise<void> {
    if (records.length === 0) {
      return
    }

    const serverIdsNeedingDelete = Array.from(
      new Set(
        records
          .map(record => record.serverId)
          .filter((serverId): serverId is string => Boolean(serverId))
      )
    )

    for (const serverId of serverIdsNeedingDelete) {
      try {
        console.log('🧹 Deleting stale server note by ID', serverId)
        await ApiService.deleteNote(serverId)
      } catch (error) {
        console.warn('Failed to delete stale server note by ID:', serverId, error)
      }
    }
  }

  // After merging server notes, ensure local parent/child relationships mirror server state
  private static async updateLocalParentReferences(
    serverNotes: Note[],
    serverIdToLocalId: Map<string, number>,
    clientIdToLocalId: Map<number, number>
  ): Promise<void> {
    for (const serverNote of serverNotes) {
      if (!serverNote.serverId) {
        continue
      }

      console.log('🔁 Resolving parent linkage', {
        title: serverNote.title,
        serverId: serverNote.serverId,
        serverParentId: serverNote.serverParentId,
        parentClientId: serverNote.parentClientId,
        path: serverNote.path
      })

      const localId = serverIdToLocalId.get(serverNote.serverId)
      if (!localId) {
        continue
      }

      const localNote = await db.notes.get(localId)
      if (!localNote || localNote.syncStatus === 'pending') {
        // Skip notes with local edits pending sync
        continue
      }

      let parentLocalId: number | undefined
      let parentClientId: number | undefined

      if (serverNote.serverParentId) {
        parentLocalId = serverIdToLocalId.get(serverNote.serverParentId)

        if (parentLocalId === undefined) {
          const existingParent = await db.notes.where('serverId').equals(serverNote.serverParentId).first()
          if (existingParent?.id !== undefined) {
            parentLocalId = existingParent.id
            serverIdToLocalId.set(serverNote.serverParentId, existingParent.id)
            if (existingParent.clientId !== undefined) {
              clientIdToLocalId.set(existingParent.clientId, existingParent.id)
            }
          }
        }
      }

      if (parentLocalId === undefined && serverNote.parentClientId !== undefined) {
        parentLocalId = clientIdToLocalId.get(serverNote.parentClientId)
      }

      if (parentLocalId === undefined && serverNote.path) {
        const segments = this.normalizePath(serverNote.path).split('/').filter(Boolean)
        if (segments.length > 1) {
          const parentPath = segments.slice(0, -1).join('/')
          const parentNote = await db.notes.where('path').equals(parentPath).first()
          if (parentNote?.id !== undefined && parentNote.isFolder) {
            parentLocalId = parentNote.id
            if (parentNote.serverId) {
              serverIdToLocalId.set(parentNote.serverId, parentNote.id)
            }
            if (parentNote.clientId !== undefined) {
              clientIdToLocalId.set(parentNote.clientId, parentNote.id)
            }
          } else {
            console.warn('⚠️ Unable to resolve parent by path', {
              noteTitle: serverNote.title,
              path: serverNote.path,
              parentPath,
              parentNote
            })
          }
        }
      }

      if (parentLocalId !== undefined && parentLocalId !== localId) {
        const parentNote = await db.notes.get(parentLocalId)
        parentClientId = parentNote?.clientId ?? parentLocalId
      } else {
        if (serverNote.serverParentId) {
          console.warn('⚠️ Missing parent mapping for note', {
            noteTitle: serverNote.title,
            serverParentId: serverNote.serverParentId,
            clientParentId: serverNote.parentClientId,
            path: serverNote.path
          })
        }
        parentLocalId = undefined
        parentClientId = undefined
      }

      const parentUpdate: Partial<Note> = {
        parentId: parentLocalId,
        parentClientId,
        serverParentId: serverNote.serverParentId
      }

      await db.notes.update(localId, parentUpdate)
    }
  }

  // =================
  // FULL SYNC
  // =================

  private static createEmptyResult(): SyncResult {
    return {
      success: true,
      syncedCount: 0,
      errorCount: 0,
      errors: []
    }
  }

  private static async shouldPullBeforePush(): Promise<boolean> {
    try {
      const totalNotes = await db.notes.count()

      if (totalNotes === 0) {
        // Nothing cached locally yet; default push-first behaviour works best
        return false
      }

      const notesLinkedToServer = await db.notes.filter(note => !!note.serverId).count()

      // When we have local data but none of it is associated with a server ID
      // (typical on a fresh install that only has the seeded defaults), pull
      // from the backend before we push anything to avoid overwriting remote
      // content with placeholders.
      return notesLinkedToServer === 0
    } catch (error) {
      console.warn('Failed to determine notes sync strategy – defaulting to push-first:', error)
      return false
    }
  }

  private static combineResults(...results: SyncResult[]): SyncResult {
    return results.reduce<SyncResult>((combined, current) => ({
      success: combined.success && current.success,
      syncedCount: combined.syncedCount + current.syncedCount,
      errorCount: combined.errorCount + current.errorCount,
      errors: [...combined.errors, ...current.errors]
    }), this.createEmptyResult())
  }

  // Perform full bidirectional sync (push local changes, then pull server changes)
  static async performFullSync(): Promise<SyncResult> {
    console.log('🔄 Starting full bidirectional notes sync...')
    window.dispatchEvent(new CustomEvent('notesSyncStart'))

    const pullFirst = await this.shouldPullBeforePush()
    const operationOrder = pullFirst ? 'pull-first' : 'push-first'
    console.log(`🧭 Notes sync strategy: ${operationOrder}`)

    let pushResult = this.createEmptyResult()
    let pullResult = this.createEmptyResult()

    if (pullFirst) {
      pullResult = await this.pullNotesFromServer()
      pushResult = await this.syncNotes()
    } else {
      pushResult = await this.syncNotes()
      pullResult = await this.pullNotesFromServer()
    }

    // Combine results from both operations
    const combinedResult = this.combineResults(pushResult, pullResult)

    console.log(`🔄 Full notes sync complete:`, combinedResult)

    const eventDetail = { success: combinedResult.success, timestamp: Date.now() }

    if (combinedResult.success) {
      console.log('🔔 Notes sync finished - emitting notesSynced event')
      window.dispatchEvent(new CustomEvent('notesSynced', { detail: eventDetail }))
    }

    window.dispatchEvent(new CustomEvent('notesSyncFinished', { detail: eventDetail }))

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
