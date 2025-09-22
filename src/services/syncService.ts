import { IndexedDBService, type LocalTodo, type LocalNote } from './indexedDBService'
import { TodoService, NoteService } from '../lib/database-service'
import { supabase } from '../lib/supabase'

/**
 * Sync service for managing background synchronization between IndexedDB and Supabase
 * Handles conflict resolution, retry logic, and maintains data consistency
 */
export class SyncService {
  private static syncInProgress = false
  private static syncEventListeners: Array<(status: SyncStatus) => void> = []
  private static lastSyncTime: Date | null = null

  // Configuration
  private static readonly SYNC_BATCH_SIZE = 10
  private static readonly CONFLICT_RESOLUTION_STRATEGY: 'last-write-wins' | 'manual' = 'last-write-wins'

  /**
   * Main sync method - processes all pending changes
   */
  static async sync(): Promise<SyncResult> {
    if (this.syncInProgress) {
      console.log('SyncService: Sync already in progress, skipping...')
      return {
        success: false,
        error: 'Sync already in progress',
        processed: 0,
        failed: 0
      }
    }

    this.syncInProgress = true
    this.notifyListeners({ type: 'sync_started' })

    try {
      console.log('SyncService: Starting sync process...')

      // Check authentication
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        throw new Error('User not authenticated')
      }

      // First, pull changes from server
      await this.pullChangesFromServer()

      // Then, push local changes to server
      const pushResult = await this.pushChangesToServer()

      this.lastSyncTime = new Date()
      this.notifyListeners({ 
        type: 'sync_completed', 
        data: { 
          processed: pushResult.processed, 
          failed: pushResult.failed,
          lastSyncTime: this.lastSyncTime
        } 
      })

      console.log(`SyncService: Sync completed. Processed: ${pushResult.processed}, Failed: ${pushResult.failed}`)

      return pushResult

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown sync error'
      console.error('SyncService: Sync failed:', errorMessage)
      
      this.notifyListeners({ 
        type: 'sync_error', 
        data: { error: errorMessage } 
      })

      return {
        success: false,
        error: errorMessage,
        processed: 0,
        failed: 0
      }
    } finally {
      this.syncInProgress = false
    }
  }

  /**
   * Pull changes from server and update local database
   */
  private static async pullChangesFromServer(): Promise<void> {
    console.log('SyncService: Pulling changes from server...')

    try {
      // Fetch all data from Supabase
      const [todosResult, notesResult] = await Promise.all([
        TodoService.getAllTodos(),
        NoteService.getAllNotes()
      ])

      if (!todosResult.success || !notesResult.success) {
        throw new Error('Failed to fetch data from server')
      }

      const serverTodos = todosResult.data || []
      const serverNotes = notesResult.data || []

      // Get local data
      const localTodos = await IndexedDBService.getAllTodos(true) // Include deleted
      const localNotes = await IndexedDBService.getAllNotes(true) // Include deleted

      // Process todos
      await this.mergeServerData('todo', serverTodos as unknown as Array<Record<string, unknown>>, localTodos)
      
      // Process notes
      await this.mergeServerData('note', serverNotes as unknown as Array<Record<string, unknown>>, localNotes)

      console.log(`SyncService: Successfully pulled ${serverTodos.length} todos and ${serverNotes.length} notes from server`)

    } catch (error) {
      console.error('SyncService: Error pulling changes from server:', error)
      throw error
    }
  }

  /**
   * Merge server data with local data, handling conflicts
   */
  private static async mergeServerData(
    entityType: 'todo' | 'note',
    serverItems: Array<Record<string, unknown>>,
    localItems: Array<LocalTodo | LocalNote>
  ): Promise<void> {
    const serverItemsMap = new Map()
    const localItemsMap = new Map()

    // Create maps for efficient lookup
    serverItems.forEach(item => {
      const id = (item.serverId as string) || (item.id as string)
      if (id) {
        serverItemsMap.set(id, item)
      }
    })

    localItems.forEach(item => {
      if (item.serverId) {
        localItemsMap.set(item.serverId, item)
      }
    })

    // Process server items
    for (const serverItem of serverItems) {
      const serverId = (serverItem.serverId as string) || (serverItem.id as string)
      const localItem = localItemsMap.get(serverId)

      if (!localItem) {
        // New item from server - add to local
        await this.addServerItemToLocal(entityType, serverItem)
      } else if (localItem.syncStatus !== 'pending') {
        // Item exists locally and is synced - check for updates
        const serverUpdatedAt = new Date(serverItem.updatedAt as string)
        const localUpdatedAt = new Date(localItem.updatedAt)

        if (serverUpdatedAt > localUpdatedAt) {
          // Server is newer - update local
          await this.updateLocalItemFromServer(entityType, localItem.id!, serverItem)
        }
      } else {
        // Item has pending local changes - handle conflict
        await this.resolveConflict(entityType, localItem, serverItem)
      }
    }

    // Handle items that exist locally but not on server (deleted on server)
    for (const localItem of localItems) {
      if (localItem.serverId && !serverItemsMap.has(localItem.serverId)) {
        if (localItem.syncStatus !== 'pending') {
          // Item was deleted on server and no local changes - remove locally
          if (localItem.id) {
            if (entityType === 'todo') {
              await IndexedDBService.deleteTodo(localItem.id)
            } else {
              await IndexedDBService.deleteNote(localItem.id)
            }
          }
        }
        // If item has pending changes, we'll let the push handle it
      }
    }
  }  /**
   * Add server item to local database
   */
  private static async addServerItemToLocal(entityType: 'todo' | 'note', serverItem: Record<string, unknown>): Promise<void> {
    try {
      if (entityType === 'todo') {
        const localTodo: LocalTodo = {
          serverId: (serverItem.serverId as string) || (serverItem.id as string),
          clientId: (serverItem.clientId as number) || (serverItem.id as number),
          text: serverItem.text as string,
          completed: serverItem.completed as boolean,
          deleted: (serverItem.deleted as boolean) || false,
          createdAt: new Date(serverItem.createdAt as string),
          updatedAt: new Date(serverItem.updatedAt as string),
          syncStatus: 'synced',
          needSync: false
        }
        await IndexedDBService.bulkUpsertTodos([localTodo])
      } else {
        const localNote: LocalNote = {
          serverId: (serverItem.serverId as string) || (serverItem.id as string),
          clientId: (serverItem.clientId as number) || (serverItem.id as number),
          title: serverItem.title as string,
          content: serverItem.content as string,
          path: serverItem.path as string,
          isFolder: serverItem.isFolder as boolean,
          parentId: serverItem.parentId as number,
          serverParentId: serverItem.serverParentId as string,
          parentClientId: serverItem.parentClientId as number,
          deleted: (serverItem.deleted as boolean) || false,
          createdAt: new Date(serverItem.createdAt as string),
          updatedAt: new Date(serverItem.updatedAt as string),
          syncStatus: 'synced',
          needSync: false
        }
        await IndexedDBService.bulkUpsertNotes([localNote])
      }
    } catch (error) {
      console.error(`SyncService: Error adding server ${entityType} to local:`, error)
    }
  }

  /**
   * Update local item with server data
   */
  private static async updateLocalItemFromServer(entityType: 'todo' | 'note', localId: number, serverItem: Record<string, unknown>): Promise<void> {
    try {
      if (entityType === 'todo') {
        await IndexedDBService.updateTodo(localId, {
          text: serverItem.text as string,
          completed: serverItem.completed as boolean,
          deleted: (serverItem.deleted as boolean) || false,
          updatedAt: new Date(serverItem.updatedAt as string),
          syncStatus: 'synced',
          needSync: false
        })
      } else {
        await IndexedDBService.updateNote(localId, {
          title: serverItem.title as string,
          content: serverItem.content as string,
          path: serverItem.path as string,
          isFolder: serverItem.isFolder as boolean,
          parentId: serverItem.parentId as number,
          serverParentId: serverItem.serverParentId as string,
          parentClientId: serverItem.parentClientId as number,
          deleted: (serverItem.deleted as boolean) || false,
          updatedAt: new Date(serverItem.updatedAt as string),
          syncStatus: 'synced',
          needSync: false
        })
      }
    } catch (error) {
      console.error(`SyncService: Error updating local ${entityType} from server:`, error)
    }
  }

  /**
   * Resolve conflicts between local and server data
   */
  private static async resolveConflict(
    entityType: 'todo' | 'note', 
    localItem: LocalTodo | LocalNote, 
    serverItem: Record<string, unknown>
  ): Promise<void> {
    console.log(`SyncService: Resolving conflict for ${entityType} ${localItem.id}`)

    switch (this.CONFLICT_RESOLUTION_STRATEGY) {
      case 'last-write-wins': {
        const serverUpdatedAt = new Date(serverItem.updatedAt as string)
        const localUpdatedAt = new Date(localItem.updatedAt)

        if (serverUpdatedAt > localUpdatedAt) {
          // Server wins - update local
          if (localItem.id) {
            await this.updateLocalItemFromServer(entityType, localItem.id, serverItem)
          }
        }
        // If local is newer or equal, we'll push local changes to server
        break
      }

      case 'manual': {
        // Store conflict for manual resolution
        // This would require additional UI components
        console.log('Manual conflict resolution not implemented yet')
        break
      }

      default:
        console.warn(`Unknown conflict resolution strategy: ${this.CONFLICT_RESOLUTION_STRATEGY}`)
    }
  }

  /**
   * Push local changes to server
   */
  private static async pushChangesToServer(): Promise<SyncResult> {
    console.log('SyncService: Pushing changes to server...')

    let processed = 0
    let failed = 0

    try {
      // Get pending items
      const { todos: pendingTodos, notes: pendingNotes } = await IndexedDBService.getPendingItems()
      
      console.log(`SyncService: Found ${pendingTodos.length} pending todos and ${pendingNotes.length} pending notes`)

      // Process todos in batches
      for (let i = 0; i < pendingTodos.length; i += this.SYNC_BATCH_SIZE) {
        const batch = pendingTodos.slice(i, i + this.SYNC_BATCH_SIZE)
        for (const todo of batch) {
          try {
            await this.pushTodoToServer(todo)
            processed++
          } catch (error) {
            console.error(`SyncService: Failed to sync todo ${todo.id}:`, error)
            failed++
            if (todo.id) {
              await IndexedDBService.markSyncError('todo', todo.id, error instanceof Error ? error.message : 'Unknown error')
            }
          }
        }
      }

      // Sort notes to sync folders before files, and parents before children
      const sortedNotes = this.sortNotesForSync(pendingNotes)

      // Process notes in batches
      for (let i = 0; i < sortedNotes.length; i += this.SYNC_BATCH_SIZE) {
        const batch = sortedNotes.slice(i, i + this.SYNC_BATCH_SIZE)
        for (const note of batch) {
          try {
            await this.pushNoteToServer(note)
            processed++
          } catch (error) {
            console.error(`SyncService: Failed to sync note ${note.id}:`, error)
            failed++
            if (note.id) {
              await IndexedDBService.markSyncError('note', note.id, error instanceof Error ? error.message : 'Unknown error')
            }
          }
        }
      }

      return {
        success: failed === 0,
        processed,
        failed
      }

    } catch (error) {
      console.error('SyncService: Error during push to server:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        processed,
        failed: failed + 1
      }
    }
  }

  /**
   * Push a single todo to server
   */
  /**
   * Sort notes for optimal sync order: folders first, then files, parents before children
   */
  private static sortNotesForSync(notes: LocalNote[]): LocalNote[] {
    const noteMap = new Map<number, LocalNote>()
    notes.forEach(note => {
      if (note.id) noteMap.set(note.id, note)
    })

    const visited = new Set<number>()
    const result: LocalNote[] = []

    const visit = (note: LocalNote) => {
      if (!note.id || visited.has(note.id)) return
      
      // Visit parent first if it exists and is in our pending list
      if (note.parentId && noteMap.has(note.parentId)) {
        visit(noteMap.get(note.parentId)!)
      }
      
      if (!visited.has(note.id)) {
        visited.add(note.id)
        result.push(note)
      }
    }

    // First pass: folders (they're likely to be parents)
    const folders = notes.filter(note => note.isFolder)
    const files = notes.filter(note => !note.isFolder)

    folders.forEach(visit)
    files.forEach(visit)

    return result
  }

  private static async pushTodoToServer(todo: LocalTodo): Promise<void> {
    if (!todo.id) return

    if (todo.deleted) {
      // Handle deletion
      if (todo.serverId && todo.clientId) {
        // Only try to delete from server if it has both serverId and clientId
        // This means it was successfully created on the server
        try {
          await TodoService.deleteTodo(todo.clientId)
        } catch (error) {
          // If deletion fails, it might already be deleted on server
          console.warn(`SyncService: Failed to delete todo ${todo.clientId} from server:`, error)
        }
      }
      // Mark as synced regardless of whether server deletion succeeded
      await IndexedDBService.updateTodo(todo.id, {
        syncStatus: 'synced',
        needSync: false,
        updatedAt: new Date()
      })
    } else if (todo.serverId) {
      // Update existing todo - make sure we have clientId
      if (!todo.clientId) {
        throw new Error(`Cannot update todo ${todo.id}: missing clientId`)
      }
      const result = await TodoService.updateTodo(todo.clientId, {
        text: todo.text,
        completed: todo.completed
      })
      if (result.success) {
        await IndexedDBService.updateTodo(todo.id, {
          syncStatus: 'synced',
          needSync: false,
          updatedAt: new Date()
        })
      } else {
        throw new Error(result.error || 'Failed to update todo')
      }
    } else {
      // Create new todo
      const result = await TodoService.addTodo(todo.text)
      if (result.success && result.data) {
        // Update local todo with both serverId and clientId from server
        await IndexedDBService.updateTodo(todo.id, {
          serverId: result.data.serverId,
          clientId: result.data.clientId,
          syncStatus: 'synced',
          needSync: false,
          updatedAt: new Date()
        })
      } else {
        throw new Error(result.error || 'Failed to create todo')
      }
    }
  }

  /**
   * Push a single note to server
   */
  private static async pushNoteToServer(note: LocalNote): Promise<void> {
    if (!note.id) return

    if (note.deleted) {
      // Handle deletion
      if (note.serverId && note.clientId) {
        // Only try to delete from server if it has both serverId and clientId
        // This means it was successfully created on the server
        try {
          await NoteService.deleteNote(note.clientId)
        } catch (error) {
          // If deletion fails, it might already be deleted on server
          console.warn(`SyncService: Failed to delete note ${note.clientId} from server:`, error)
        }
      }
      // Mark as synced regardless of whether server deletion succeeded
      await IndexedDBService.updateNote(note.id, {
        syncStatus: 'synced',
        needSync: false,
        updatedAt: new Date()
      })
    } else if (note.serverId) {
      // Update existing note - make sure we have clientId
      if (!note.clientId) {
        throw new Error(`Cannot update note ${note.id}: missing clientId`)
      }
      const result = await NoteService.updateNote(note.clientId, {
        title: note.title,
        content: note.content,
        path: note.path,
        isFolder: note.isFolder,
        parentId: note.parentId
      })
      if (result.success) {
        await IndexedDBService.updateNote(note.id, {
          syncStatus: 'synced',
          needSync: false,
          updatedAt: new Date()
        })
      } else {
        throw new Error(result.error || 'Failed to update note')
      }
    } else {
      // Create new note - need to resolve parent client ID
      let parentClientId: number | undefined = undefined
      
      if (note.parentId) {
        // Get parent note from IndexedDB to find its client ID
        const parentNote = await IndexedDBService.getNoteById(note.parentId)
        if (parentNote && parentNote.clientId) {
          parentClientId = parentNote.clientId
          console.log(`SyncService: Resolved parent ID ${note.parentId} to client ID ${parentClientId}`)
        } else if (parentNote && !parentNote.clientId) {
          console.warn(`SyncService: Parent note ${note.parentId} exists but has no clientId (not synced yet). Creating note without parent for now.`)
          // TODO: We could implement a deferred sync queue for these cases
        } else {
          console.warn(`SyncService: Could not find parent note with ID ${note.parentId}`)
        }
      }
      
      console.log(`SyncService: Creating note on server:`, {
        title: note.title,
        isFolder: note.isFolder,
        parentClientId,
        path: note.path
      })
      
      const result = await NoteService.createNote(
        note.title,
        note.content,
        note.path,
        note.isFolder,
        parentClientId // Pass parent's client ID, not local ID (may be undefined)
      )
      
      if (result.success && result.data) {
        console.log(`SyncService: Successfully created note on server with serverId: ${result.data.serverId}`)
        // Update local note with both serverId and clientId from server
        await IndexedDBService.updateNote(note.id, {
          serverId: result.data.serverId,
          clientId: result.data.clientId,
          syncStatus: 'synced',
          needSync: false,
          updatedAt: new Date()
        })
      } else {
        console.error(`SyncService: Failed to create note on server:`, result.error)
        throw new Error(result.error || 'Failed to create note')
      }
    }
  }

  /**
   * Automatic sync when network comes back online
   */
  static setupNetworkSync(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        console.log('SyncService: Network connection restored, triggering sync...')
        this.sync().catch(error => {
          console.error('SyncService: Auto-sync on network restore failed:', error)
        })
      })
    }
  }

  /**
   * Periodic sync (call this with setInterval)
   */
  static async periodicSync(): Promise<void> {
    if (navigator.onLine) {
      await this.sync()
    }
  }

  /**
   * Event system for sync status updates
   */
  static addSyncListener(listener: (status: SyncStatus) => void): void {
    this.syncEventListeners.push(listener)
  }

  static removeSyncListener(listener: (status: SyncStatus) => void): void {
    const index = this.syncEventListeners.indexOf(listener)
    if (index > -1) {
      this.syncEventListeners.splice(index, 1)
    }
  }

  private static notifyListeners(status: SyncStatus): void {
    this.syncEventListeners.forEach(listener => {
      try {
        listener(status)
      } catch (error) {
        console.error('SyncService: Error in sync listener:', error)
      }
    })
  }

  /**
   * Get sync status and statistics
   */
  static async getSyncStatus(): Promise<{
    inProgress: boolean
    lastSyncTime: Date | null
    pendingItems: number
    failedItems: number
  }> {
    const stats = await IndexedDBService.getStats()
    const pendingItems = stats.pendingTodos + stats.pendingNotes

    // Count failed items (items with sync status 'error')
    const todos = await IndexedDBService.getAllTodos()
    const notes = await IndexedDBService.getAllNotes()
    const failedItems = todos.filter(t => t.syncStatus === 'error').length + 
                       notes.filter(n => n.syncStatus === 'error').length

    return {
      inProgress: this.syncInProgress,
      lastSyncTime: this.lastSyncTime,
      pendingItems,
      failedItems
    }
  }

  /**
   * Clear sync errors and retry failed items
   */
  static async retryFailedItems(): Promise<SyncResult> {
    console.log('SyncService: Retrying failed items...')
    
    // Reset error status for failed items
    const todos = await IndexedDBService.getAllTodos()
    const notes = await IndexedDBService.getAllNotes()

    for (const todo of todos) {
      if (todo.syncStatus === 'error' && todo.id) {
        await IndexedDBService.updateTodo(todo.id, {
          syncStatus: 'pending',
          needSync: true
        })
      }
    }

    for (const note of notes) {
      if (note.syncStatus === 'error' && note.id) {
        await IndexedDBService.updateNote(note.id, {
          syncStatus: 'pending',
          needSync: true
        })
      }
    }

    // Trigger sync
    return await this.sync()
  }
}

// Type definitions
export interface SyncResult {
  success: boolean
  processed: number
  failed: number
  error?: string
}

export interface SyncStatus {
  type: 'sync_started' | 'sync_completed' | 'sync_error' | 'sync_progress'
  data?: Record<string, unknown>
}

export default SyncService
