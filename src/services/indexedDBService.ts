import Dexie, { type Table } from 'dexie'
import type { Todo, Note, SyncStatus } from '../lib/types'

// Extend the types to include IndexedDB specific fields
export interface LocalTodo extends Omit<Todo, 'id'> {
  id?: number // Dexie auto-generated ID (local)
  serverId?: string // UUID from backend server
  clientId?: string // Changed to string for new client ID format
  text: string
  completed: boolean
  deleted?: boolean // Soft delete flag for sync purposes
  version: number // Version for conflict resolution
  createdAt: Date
  updatedAt: Date
  syncStatus: SyncStatus // 'pending' | 'synced' | 'error'
  needSync?: boolean // Additional flag for sync queue
  lastSyncAt?: Date // Track when this item was last synced
}

export interface LocalNote extends Omit<Note, 'id'> {
  id?: number // Dexie auto-generated ID (local)
  serverId?: string // UUID from backend server
  clientId?: string // Changed to string for new client ID format
  title: string
  content: string // JSON string from Lexical editor
  path?: string // DEPRECATED: Use generateLogicalPath() instead
  createdAt: Date
  updatedAt: Date
  syncStatus: SyncStatus // 'pending' | 'synced' | 'error'
  isFolder: boolean
  parentId?: number // For nested folder structure (local)
  serverParentId?: string // UUID of parent on server
  parentClientId?: string // Changed to string for consistency
  deleted?: boolean // Soft delete flag for sync purposes
  version: number // Version for conflict resolution
  needSync?: boolean // Additional flag for sync queue
  lastSyncAt?: Date // Track when this item was last synced
}

// Sync queue entry for tracking pending operations
export interface SyncQueueEntry {
  id?: number
  operation: 'create' | 'update' | 'delete'
  entityType: 'todo' | 'note'
  entityId: number // Local ID of the entity
  data?: Partial<LocalTodo | LocalNote> // Operation data
  timestamp: Date
  retryCount: number
  lastError?: string
}

// Sync state tracking for device-specific sync management
export interface SyncState {
  id?: number
  deviceId: string
  lastSyncAt: Date
  conflictCount: number
  totalSynced: number
  totalFailed: number
}

// Database class extending Dexie
export class BrutalNotesDB extends Dexie {
  todos!: Table<LocalTodo>
  notes!: Table<LocalNote>
  syncQueue!: Table<SyncQueueEntry>
  syncState!: Table<SyncState>

  constructor() {
    super('BrutalNotesDB')
    
    this.version(2).stores({
      todos: '++id, serverId, clientId, text, completed, deleted, version, createdAt, updatedAt, syncStatus, needSync, lastSyncAt',
      notes: '++id, serverId, clientId, title, content, path, createdAt, updatedAt, syncStatus, isFolder, parentId, serverParentId, parentClientId, deleted, version, needSync, lastSyncAt',
      syncQueue: '++id, operation, entityType, entityId, timestamp, retryCount',
      syncState: '++id, deviceId, lastSyncAt, conflictCount, totalSynced, totalFailed'
    })

    // Add hooks for automatic timestamp updates
    this.todos.hook('creating', (_, obj) => {
      const now = new Date()
      obj.createdAt = now
      obj.updatedAt = now
      if (obj.version === undefined) {
        obj.version = 1
      }
      if (obj.syncStatus === undefined) {
        obj.syncStatus = 'pending'
      }
      if (obj.needSync === undefined) {
        obj.needSync = true
      }
    })

    this.todos.hook('updating', (modifications, _, obj) => {
      const mods = modifications as Record<string, unknown>
      mods.updatedAt = new Date()
      // Increment version on updates
      if (obj.version !== undefined) {
        mods.version = obj.version + 1
      }
      // Mark as needing sync if it was previously synced
      if (obj.syncStatus === 'synced') {
        mods.syncStatus = 'pending'
        mods.needSync = true
      }
    })

    this.notes.hook('creating', (_, obj) => {
      const now = new Date()
      obj.createdAt = now
      obj.updatedAt = now
      if (obj.version === undefined) {
        obj.version = 1
      }
      if (obj.syncStatus === undefined) {
        obj.syncStatus = 'pending'
      }
      if (obj.needSync === undefined) {
        obj.needSync = true
      }
    })

    this.notes.hook('updating', (modifications, _, obj) => {
      const mods = modifications as Record<string, unknown>
      mods.updatedAt = new Date()
      // Increment version on updates
      if (obj.version !== undefined) {
        mods.version = obj.version + 1
      }
      // Mark as needing sync if it was previously synced
      if (obj.syncStatus === 'synced') {
        mods.syncStatus = 'pending'
        mods.needSync = true
      }
    })
  }
}

// Create database instance
export const db = new BrutalNotesDB()

// Database service class for CRUD operations
export class IndexedDBService {
  
  // ============= TODO OPERATIONS =============
  
  static async getAllTodos(includeDeleted = false): Promise<LocalTodo[]> {
    try {
      const allTodos = await db.todos.toArray()
      const filteredTodos = includeDeleted 
        ? allTodos 
        : allTodos.filter(todo => !todo.deleted)
      
      return filteredTodos
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    } catch (error) {
      console.error('Error fetching todos from IndexedDB:', error)
      return []
    }
  }

  static async getTodoById(id: number): Promise<LocalTodo | undefined> {
    try {
      return await db.todos.get(id)
    } catch (error) {
      console.error('Error fetching todo by ID from IndexedDB:', error)
      return undefined
    }
  }

  static async getTodoByServerId(serverId: string): Promise<LocalTodo | undefined> {
    try {
      return await db.todos.where('serverId').equals(serverId).first()
    } catch (error) {
      console.error('Error fetching todo by server ID from IndexedDB:', error)
      return undefined
    }
  }

  static async getTodoByClientId(clientId: string): Promise<LocalTodo | undefined> {
    try {
      return await db.todos.where('clientId').equals(clientId).first()
    } catch (error) {
      console.error('Error fetching todo by client ID from IndexedDB:', error)
      return undefined
    }
  }

  static async addTodo(text: string): Promise<LocalTodo> {
    try {
      const todo: Omit<LocalTodo, 'id'> = {
        text,
        completed: false,
        deleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        syncStatus: 'pending',
        needSync: true,
        clientId: this.generateClientId()
      }

      const id = await db.todos.add(todo)
      const createdTodo = await db.todos.get(id)
      
      if (!createdTodo) {
        throw new Error('Failed to retrieve created todo')
      }

      // Add to sync queue
      await this.addToSyncQueue('create', 'todo', id)
      
      return createdTodo
    } catch (error) {
      console.error('Error adding todo to IndexedDB:', error)
      throw error
    }
  }

  static async updateTodo(id: number, updates: Partial<LocalTodo>): Promise<LocalTodo> {
    try {
      await db.todos.update(id, {
        ...updates,
        updatedAt: new Date(),
        syncStatus: 'pending',
        needSync: true
      })

      const updatedTodo = await db.todos.get(id)
      if (!updatedTodo) {
        throw new Error('Failed to retrieve updated todo')
      }

      // Add to sync queue
      await this.addToSyncQueue('update', 'todo', id, updates)
      
      return updatedTodo
    } catch (error) {
      console.error('Error updating todo in IndexedDB:', error)
      throw error
    }
  }

  static async deleteTodo(id: number): Promise<void> {
    try {
      console.log('🗑️ IndexedDB: Deleting todo with id:', id)
      
      const todoBeforeUpdate = await db.todos.get(id)
      console.log('🗑️ Todo before deletion:', { id, serverId: todoBeforeUpdate?.serverId, needSync: todoBeforeUpdate?.needSync })
      
      await db.todos.update(id, {
        deleted: true,
        updatedAt: new Date(),
        syncStatus: 'pending',
        needSync: true
      })

      const todoAfterUpdate = await db.todos.get(id)
      console.log('🗑️ Todo after deletion:', { id, deleted: todoAfterUpdate?.deleted, needSync: todoAfterUpdate?.needSync, syncStatus: todoAfterUpdate?.syncStatus })

      // Add to sync queue
      await this.addToSyncQueue('delete', 'todo', id)
      console.log('🗑️ Added todo to sync queue')
    } catch (error) {
      console.error('Error deleting todo in IndexedDB:', error)
      throw error
    }
  }

  static async toggleTodo(id: number): Promise<LocalTodo> {
    try {
      const todo = await db.todos.get(id)
      if (!todo) {
        throw new Error('Todo not found')
      }

      return await this.updateTodo(id, { completed: !todo.completed })
    } catch (error) {
      console.error('Error toggling todo in IndexedDB:', error)
      throw error
    }
  }

  // ============= NOTE OPERATIONS =============

  static async getAllNotes(includeDeleted = false): Promise<LocalNote[]> {
    try {
      const allNotes = await db.notes.toArray()
      const filteredNotes = includeDeleted 
        ? allNotes 
        : allNotes.filter(note => !note.deleted)
      
      return filteredNotes.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    } catch (error) {
      console.error('Error fetching notes from IndexedDB:', error)
      return []
    }
  }

  static async getNoteById(id: number): Promise<LocalNote | undefined> {
    try {
      return await db.notes.get(id)
    } catch (error) {
      console.error('Error fetching note by ID from IndexedDB:', error)
      return undefined
    }
  }

  static async getNoteByServerId(serverId: string): Promise<LocalNote | undefined> {
    try {
      return await db.notes.where('serverId').equals(serverId).first()
    } catch (error) {
      console.error('Error fetching note by server ID from IndexedDB:', error)
      return undefined
    }
  }

  static async getNoteByClientId(clientId: string): Promise<LocalNote | undefined> {
    try {
      return await db.notes.where('clientId').equals(clientId).first()
    } catch (error) {
      console.error('Error fetching note by client ID from IndexedDB:', error)
      return undefined
    }
  }

  // Helper method to find notes by mixed client ID types (for migration)
  static async getNoteByMixedClientId(clientId: string | number): Promise<LocalNote | undefined> {
    try {
      // First try as string
      const stringResult = await db.notes.where('clientId').equals(String(clientId)).first()
      if (stringResult) return stringResult
      
      // Then try as number (for old data)
      if (typeof clientId === 'string' && !isNaN(Number(clientId))) {
        const numericResult = await db.notes.where('clientId').equals(Number(clientId)).first()
        if (numericResult) return numericResult
      }
      
      return undefined
    } catch (error) {
      console.error('Error fetching note by mixed client ID from IndexedDB:', error)
      return undefined
    }
  }

  static async addNote(
    title: string,
    content: string,
    path?: string, // Made optional - will be generated from parent relationships
    isFolder = false,
    parentId?: number
  ): Promise<LocalNote> {
    try {
      // If parentId is provided, resolve it to parentClientId
      let parentClientId: string | undefined = undefined
      let generatedPath = title // Default path is just the title
      
      if (parentId) {
        const parentNote = await this.getNoteById(parentId)
          if (parentNote && parentNote.clientId) {
            parentClientId = parentNote.clientId
            
            // Generate logical path from parent hierarchy
            if (parentNote.path) {
              generatedPath = `${parentNote.path}/${title}`
            } else {
              generatedPath = `${parentNote.title}/${title}`
            }
            
            console.log(`📝 Created "${title}" in "${parentNote.title}" (clientId: ${parentClientId})`)
          } else {
            console.warn(`⚠️ Parent note with ID ${parentId} not found or missing clientId`)
          }
      }

      const note: Omit<LocalNote, 'id'> = {
        title,
        content,
        path: path || this.normalizePath(generatedPath), // Use provided path or generate from hierarchy
        isFolder,
        parentId,
        parentClientId, // Now properly set during creation
        deleted: false,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        syncStatus: 'pending',
        needSync: true,
        clientId: this.generateClientId()
      }

      const id = await db.notes.add(note)
      const createdNote = await db.notes.get(id)
      
      if (!createdNote) {
        throw new Error('Failed to retrieve created note')
      }

      // Add to sync queue
      await this.addToSyncQueue('create', 'note', id)
      
      return createdNote
    } catch (error) {
      console.error('Error adding note to IndexedDB:', error)
      throw error
    }
  }

  static async updateNote(id: number, updates: Partial<LocalNote>): Promise<LocalNote> {
    try {
      const processedUpdates = { ...updates }
      
      if (processedUpdates.path) {
        processedUpdates.path = this.normalizePath(processedUpdates.path)
      }

      // If parentId is being updated, also update parentClientId
      if (processedUpdates.parentId !== undefined) {
        if (processedUpdates.parentId) {
          const parentNote = await this.getNoteById(processedUpdates.parentId)
          if (parentNote && parentNote.clientId) {
            processedUpdates.parentClientId = parentNote.clientId
            console.log(`📝 Updated parent relationship: ID ${processedUpdates.parentId} → ${parentNote.clientId}`)
          } else {
            console.warn(`⚠️ Parent note with ID ${processedUpdates.parentId} not found or missing clientId`)
            processedUpdates.parentClientId = undefined
          }
        } else {
          // parentId is being set to undefined/null, so clear parentClientId too
          processedUpdates.parentClientId = undefined
        }
      }

      await db.notes.update(id, {
        ...processedUpdates,
        updatedAt: new Date(),
        syncStatus: 'pending',
        needSync: true
      })

      const updatedNote = await db.notes.get(id)
      if (!updatedNote) {
        throw new Error('Failed to retrieve updated note')
      }

      // Add to sync queue
      await this.addToSyncQueue('update', 'note', id, processedUpdates)
      
      return updatedNote
    } catch (error) {
      console.error('Error updating note in IndexedDB:', error)
      throw error
    }
  }

  static async deleteNote(id: number): Promise<void> {
    try {
      const note = await db.notes.get(id)
      if (!note) {
        throw new Error('Note not found')
      }

      // If it's a folder, recursively delete children
      if (note.isFolder) {
        const children = await db.notes.where('parentId').equals(id).toArray()
        for (const child of children) {
          if (child.id) {
            await this.deleteNote(child.id)
          }
        }
      }

      await db.notes.update(id, {
        deleted: true,
        updatedAt: new Date(),
        syncStatus: 'pending',
        needSync: true
      })

      // Add to sync queue
      await this.addToSyncQueue('delete', 'note', id)
    } catch (error) {
      console.error('Error deleting note in IndexedDB:', error)
      throw error
    }
  }

  // ============= SYNC QUEUE OPERATIONS =============

  static async addToSyncQueue(
    operation: 'create' | 'update' | 'delete',
    entityType: 'todo' | 'note',
    entityId: number,
    data?: Partial<LocalTodo | LocalNote>
  ): Promise<void> {
    try {
      const entry: Omit<SyncQueueEntry, 'id'> = {
        operation,
        entityType,
        entityId,
        data,
        timestamp: new Date(),
        retryCount: 0
      }

      await db.syncQueue.add(entry)
    } catch (error) {
      console.error('Error adding to sync queue:', error)
    }
  }

  static async getSyncQueue(): Promise<SyncQueueEntry[]> {
    try {
      return await db.syncQueue.orderBy('timestamp').toArray()
    } catch (error) {
      console.error('Error fetching sync queue:', error)
      return []
    }
  }

  static async removeSyncQueueEntry(id: number): Promise<void> {
    try {
      await db.syncQueue.delete(id)
    } catch (error) {
      console.error('Error removing sync queue entry:', error)
    }
  }

  static async updateSyncQueueEntry(id: number, updates: Partial<SyncQueueEntry>): Promise<void> {
    try {
      await db.syncQueue.update(id, updates)
    } catch (error) {
      console.error('Error updating sync queue entry:', error)
    }
  }

  static async clearSyncQueue(): Promise<void> {
    try {
      await db.syncQueue.clear()
    } catch (error) {
      console.error('Error clearing sync queue:', error)
    }
  }

  // ============= SYNC STATUS OPERATIONS =============

  static async markAsSynced(entityType: 'todo' | 'note', id: number, serverId?: string): Promise<void> {
    try {
      const now = new Date()
      const updates: Partial<LocalTodo | LocalNote> = {
        syncStatus: 'synced',
        needSync: false,
        updatedAt: now,
        lastSyncAt: now
      }

      if (serverId) {
        updates.serverId = serverId
      }

      if (entityType === 'todo') {
        await db.todos.update(id, updates)
      } else {
        await db.notes.update(id, updates)
      }
    } catch (error) {
      console.error('Error marking entity as synced:', error)
    }
  }

  static async markSyncError(entityType: 'todo' | 'note', id: number, errorMessage: string): Promise<void> {
    try {
      const updates: Partial<LocalTodo | LocalNote> = {
        syncStatus: 'error',
        updatedAt: new Date()
      }

      if (entityType === 'todo') {
        await db.todos.update(id, updates)
      } else {
        await db.notes.update(id, updates)
      }
      
      console.error(`Sync error for ${entityType} ${id}:`, errorMessage)
    } catch (error) {
      console.error('Error marking entity sync error:', error)
    }
  }

  static async getPendingItems(): Promise<{
    todos: LocalTodo[]
    notes: LocalNote[]
  }> {
    try {
      const allTodos = await db.todos.toArray()
      const allNotes = await db.notes.toArray()
      
      console.log('🔄 IndexedDB: Total todos in DB:', allTodos.length)
      console.log('🔄 IndexedDB: Todos with needSync=true:', allTodos.filter(todo => todo.needSync === true).length)
      console.log('🔄 IndexedDB: Deleted todos:', allTodos.filter(todo => todo.deleted === true).length)
      console.log('🔄 IndexedDB: Deleted todos with needSync=true:', allTodos.filter(todo => todo.deleted === true && todo.needSync === true).length)
      
      const todos = allTodos.filter(todo => todo.needSync === true)
      const notes = allNotes.filter(note => note.needSync === true)
      
      console.log('🔄 IndexedDB: Returning pending todos:', todos.length, 'notes:', notes.length)
      
      return { todos, notes }
    } catch (error) {
      console.error('Error fetching pending items:', error)
      return { todos: [], notes: [] }
    }
  }

  // ============= UTILITY FUNCTIONS =============

  private static _deviceId: string | null = null

  static getDeviceId(): string {
    if (this._deviceId) return this._deviceId

    // Try to get existing device ID from localStorage
    const stored = localStorage.getItem('brutal-notes-device-id')
    if (stored) {
      this._deviceId = stored
      return stored
    }

    // Generate new device ID
    const timestamp = Date.now()
    const random = Math.random().toString(36).substr(2, 9)
    const deviceId = `device-${timestamp}-${random}`
    
    localStorage.setItem('brutal-notes-device-id', deviceId)
    this._deviceId = deviceId
    return deviceId
  }

  static generateClientId(): string {
    const deviceId = this.getDeviceId()
    const timestamp = Date.now()
    const random = Math.random().toString(36).substr(2, 9)
    return `${deviceId}-${timestamp}-${random}`
  }

  private static normalizePath(path: string): string {
    return path.replace(/^\/+|\/+$/g, '')
  }

  // ============= BULK OPERATIONS =============

  static async bulkUpsertTodos(todos: LocalTodo[]): Promise<void> {
    try {
      await db.transaction('rw', db.todos, async () => {
        for (const todo of todos) {
          if (todo.serverId) {
            // Check if exists by serverId
            const existing = await db.todos.where('serverId').equals(todo.serverId).first()
            if (existing && existing.id) {
              // Update existing
              await db.todos.update(existing.id, {
                ...todo,
                id: existing.id, // Keep local ID
                syncStatus: 'synced',
                needSync: false
              })
            } else {
              // Create new
              await db.todos.add({
                ...todo,
                syncStatus: 'synced',
                needSync: false
              })
            }
          }
        }
      })
    } catch (error) {
      console.error('Error bulk upserting todos:', error)
      throw error
    }
  }

  static async bulkUpsertNotes(notes: LocalNote[]): Promise<void> {
    try {
      await db.transaction('rw', db.notes, async () => {
        // First pass: Upsert all notes without parent relationships
        const processedNotes: Array<LocalNote & { localId: number }> = []
        
        for (const note of notes) {
          if (note.serverId) {
            // Check if exists by serverId
            const existing = await db.notes.where('serverId').equals(note.serverId).first()
            
            const noteToSave = {
              ...note,
              parentId: undefined, // Will be resolved in second pass
              syncStatus: 'synced' as const,
              needSync: false
            }
            
            if (existing && existing.id) {
              // Update existing
              await db.notes.update(existing.id, {
                ...noteToSave,
                id: existing.id, // Keep local ID
              })
              processedNotes.push({ ...note, localId: existing.id })
            } else {
              // Create new
              const newId = await db.notes.add(noteToSave)
              processedNotes.push({ ...note, localId: newId })
            }
          }
        }
        
        // Second pass: Resolve and update parent relationships
        for (const note of processedNotes) {
          if (note.parentClientId && note.localId) {
            // Find parent by client ID
            const parentNote = await db.notes.where('clientId').equals(note.parentClientId).first()
            if (parentNote && parentNote.id) {
              // Update with correct parent relationship
              await db.notes.update(note.localId, {
                parentId: parentNote.id
              })
              console.log(`🔗 Resolved parent for "${note.title}": ${note.parentClientId} → ID ${parentNote.id}`)
            } else {
              console.warn(`⚠️ Could not find parent with clientId ${note.parentClientId} for note ${note.title}`)
            }
          }
        }
      })
    } catch (error) {
      console.error('Error bulk upserting notes:', error)
      throw error
    }
  }

  // ============= DATABASE UTILITIES =============

  static async clearAll(): Promise<void> {
    try {
      await db.transaction('rw', [db.todos, db.notes, db.syncQueue], async () => {
        await db.todos.clear()
        await db.notes.clear()
        await db.syncQueue.clear()
      })
    } catch (error) {
      console.error('Error clearing database:', error)
      throw error
    }
  }

  static async getStats(): Promise<{
    totalTodos: number
    totalNotes: number
    pendingTodos: number
    pendingNotes: number
    queueSize: number
  }> {
    try {
      const [allTodos, allNotes, queueSize] = await Promise.all([
        db.todos.toArray(),
        db.notes.toArray(),
        db.syncQueue.count()
      ])

      const totalTodos = allTodos.length
      const totalNotes = allNotes.length
      const pendingTodos = allTodos.filter(todo => todo.needSync === true).length
      const pendingNotes = allNotes.filter(note => note.needSync === true).length

      return {
        totalTodos,
        totalNotes,
        pendingTodos,
        pendingNotes,
        queueSize
      }
    } catch (error) {
      console.error('Error getting database stats:', error)
      return {
        totalTodos: 0,
        totalNotes: 0,
        pendingTodos: 0,
        pendingNotes: 0,
        queueSize: 0
      }
    }
  }

  // ============= SYNC STATE MANAGEMENT =============

  static async getSyncState(): Promise<SyncState | null> {
    try {
      const deviceId = this.getDeviceId()
      return await db.syncState.where('deviceId').equals(deviceId).first() || null
    } catch (error) {
      console.error('Error getting sync state:', error)
      return null
    }
  }

  static async updateSyncState(updates: Partial<SyncState>): Promise<void> {
    try {
      const deviceId = this.getDeviceId()
      const existing = await db.syncState.where('deviceId').equals(deviceId).first()
      
      if (existing && existing.id) {
        await db.syncState.update(existing.id, updates)
      } else {
        await db.syncState.add({
          deviceId,
          lastSyncAt: new Date(),
          conflictCount: 0,
          totalSynced: 0,
          totalFailed: 0,
          ...updates
        })
      }
    } catch (error) {
      console.error('Error updating sync state:', error)
    }
  }

  static async recordSyncResult(processed: number, failed: number): Promise<void> {
    try {
      const syncState = await this.getSyncState()
      await this.updateSyncState({
        lastSyncAt: new Date(),
        totalSynced: (syncState?.totalSynced || 0) + processed,
        totalFailed: (syncState?.totalFailed || 0) + failed
      })
    } catch (error) {
      console.error('Error recording sync result:', error)
    }
  }
}

export default IndexedDBService
