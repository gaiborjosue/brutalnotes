// BRUTAL NOTES - Database Service Layer

import { db } from './database'
import SyncService from './sync-service'
import NotesSyncService from './notes-sync-service'
import type { Todo, Note, FileNode, DatabaseResult } from './types'

// =================
// TODO OPERATIONS
// =================

class TodoService {
  // Get all todos (excluding soft-deleted ones)
  static async getAllTodos(): Promise<DatabaseResult<Todo[]>> {
    try {
      const todos = await db.todos
        .orderBy('createdAt')
        .reverse()
        .filter(todo => !todo.deleted)
        .toArray()
      
      console.log(`📋 Retrieved ${todos.length} todos from DB:`, 
        todos.map(t => ({ id: t.id, text: t.text?.slice(0, 20), syncStatus: t.syncStatus, serverId: t.serverId }))
      )
      
      return { success: true, data: todos }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  // Add a new todo
  static async addTodo(text: string): Promise<DatabaseResult<Todo>> {
    try {
      const todoData: Omit<Todo, 'id'> = {
        text,
        completed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        syncStatus: 'pending'
      }
      
      const id = await db.todos.add(todoData)
      
      // Update the todo with clientId (using the Dexie auto-generated ID)
      await db.todos.update(id, { clientId: id })
      const todo = await db.todos.get(id)
      
      // Trigger async sync (don't wait for it to complete)
      this.triggerSync()
      
      return { success: true, data: todo }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  // Update todo
  static async updateTodo(id: number, updates: Partial<Todo>): Promise<DatabaseResult<Todo>> {
    try {
      // Always mark as pending when updating locally
      await db.todos.update(id, { ...updates, syncStatus: 'pending' })
      const todo = await db.todos.get(id)
      
      // Trigger async sync
      this.triggerSync()
      
      return { success: true, data: todo }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  // Toggle todo completion
  static async toggleTodo(id: number): Promise<DatabaseResult<Todo>> {
    try {
      const todo = await db.todos.get(id)
      if (!todo) {
        return { success: false, error: 'Todo not found' }
      }

      await db.todos.update(id, { 
        completed: !todo.completed,
        syncStatus: 'pending'
      })
      const updatedTodo = await db.todos.get(id)
      
      // Trigger async sync
      this.triggerSync()
      
      return { success: true, data: updatedTodo }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  // Delete todo (instant UI removal with background sync)
  static async deleteTodo(id: number): Promise<DatabaseResult<void>> {
    try {
      const todo = await db.todos.get(id)
      if (!todo) {
        return { success: false, error: 'Todo not found' }
      }
      
      if (todo.serverId) {
        // Todo exists on server - mark as deleted immediately for instant UI feedback
        await db.todos.update(id, { 
          deleted: true, 
          syncStatus: 'pending',
          updatedAt: new Date()
        })
        
        // Trigger background sync to delete from server
        // This will cleanup the local record after successful server deletion
        this.triggerSync()
      } else {
        // Local-only todo - hard delete immediately
        await db.todos.delete(id)
      }
      
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  // =================
  // SYNC HELPERS
  // =================

  // Trigger background sync (debounced)
  private static syncTimeout: NodeJS.Timeout | null = null
  private static triggerSync(): void {
    // Clear existing timeout to debounce rapid operations
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout)
    }
    
    // Sync after 2 seconds of inactivity
    this.syncTimeout = setTimeout(async () => {
      if (navigator.onLine) {
        try {
          console.log('🔄 Triggering background sync...')
          const result = await SyncService.syncTodos()
          
          if (result.success) {
            console.log('✅ Background sync successful')
          } else {
            console.error('❌ Background sync failed:', result.errors)
            console.error('❌ This is why your todos aren\'t reaching the backend!')
          }
          
          // Always emit refresh event after sync attempt (success or failure)
          // This ensures UI stays in sync with local database state
          console.log('🔔 Emitting todosSynced event for UI refresh (background sync)')
          window.dispatchEvent(new CustomEvent('todosSynced'))
        } catch (error) {
          console.error('💥 Background sync exception:', error)
          console.error('💥 This might be an authentication issue!')
        }
      } else {
        console.warn('📵 Device offline - skipping sync')
      }
    }, 2000)
  }

  // Manual sync method for user-triggered syncs
  static async syncTodos(): Promise<DatabaseResult<void>> {
    try {
      const result = await SyncService.performFullSync()
      
      // After sync, cleanup soft-deleted todos that are no longer needed
      await this.cleanupDeletedTodos()
      
      if (result.success) {
        console.log(`✅ Manual sync successful: ${result.syncedCount} items synced`)
        
        // Always notify UI to refresh after sync attempt
        console.log('🔔 Manual sync complete - emitting todosSynced event')
        window.dispatchEvent(new CustomEvent('todosSynced'))
        
        return { success: true }
      } else {
        console.error('Manual sync failed:', result.errors)
        
        // Still refresh UI to show current local state
        console.log('🔔 Manual sync failed but still emitting todosSynced for UI refresh')
        window.dispatchEvent(new CustomEvent('todosSynced'))
        
        return { success: false, error: result.errors.join(', ') }
      }
    } catch (error) {
      console.error('Manual sync error:', error)
      return { success: false, error: String(error) }
    }
  }

  // Clean up soft-deleted todos that have been synced
  private static async cleanupDeletedTodos(): Promise<void> {
    try {
      // Remove todos that are deleted and synced (or don't have server IDs)
      await db.todos
        .where('deleted')
        .equals(1 as any) // Dexie needs IndexableType, not boolean
        .and(todo => !todo.serverId || todo.syncStatus === 'synced')
        .delete()
      
      console.log('🧹 Cleaned up synced deleted todos')
    } catch (error) {
      console.warn('Failed to cleanup deleted todos:', error)
    }
  }
}

// =================
// NOTE OPERATIONS
// =================

class NoteService {
  // Get all notes
  static async getAllNotes(): Promise<DatabaseResult<Note[]>> {
    try {
      // Filter out deleted notes - only return active notes for UI
      const notes = await db.notes
        .orderBy('createdAt')
        .filter(note => !note.deleted)
        .toArray()
      return { success: true, data: notes }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  // Get ALL notes including deleted ones (for sync purposes)
  static async getAllNotesIncludingDeleted(): Promise<DatabaseResult<Note[]>> {
    try {
      const notes = await db.notes.orderBy('createdAt').toArray()
      return { success: true, data: notes }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  // Get note by ID
  static async getNoteById(id: number): Promise<DatabaseResult<Note>> {
    try {
      const note = await db.notes.get(id)
      if (!note) {
        return { success: false, error: 'Note not found' }
      }
      return { success: true, data: note }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  // Create new note
  static async createNote(
    title: string, 
    content: string, 
    path: string, 
    isFolder: boolean = false,
    parentId?: number
  ): Promise<DatabaseResult<Note>> {
    try {
      const noteData: Omit<Note, 'id'> = {
        title,
        content,
        path,
        isFolder,
        parentId,
        createdAt: new Date(),
        updatedAt: new Date(),
        syncStatus: 'pending'
      }
      
      const id = await db.notes.add(noteData)
      
      // Update the note with clientId (using the Dexie auto-generated ID)
      await db.notes.update(id, { clientId: id })
      const note = await db.notes.get(id)
      
      // Trigger async sync (don't wait for it to complete)
      this.triggerNotesSync()
      
      return { success: true, data: note }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  // Update note content
  static async updateNote(id: number, updates: Partial<Note>): Promise<DatabaseResult<Note>> {
    try {
      // Always mark as pending when updating locally (unless explicitly set to synced)
      const updateData = { 
        ...updates, 
        updatedAt: new Date(),
        syncStatus: updates.syncStatus || 'pending'
      }
      
      await db.notes.update(id, updateData)
      const note = await db.notes.get(id)
      
      // Only trigger sync if the note was marked as pending (not for manual sync status updates)
      if (updateData.syncStatus === 'pending') {
        this.triggerNotesSync()
      }
      
      return { success: true, data: note }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  // Delete note (instant UI removal with background sync)
  static async deleteNote(id: number): Promise<DatabaseResult<void>> {
    try {
      const note = await db.notes.get(id)
      if (!note) {
        return { success: false, error: 'Note not found' }
      }

      // If it's a folder, delete all children first (recursively)
      if (note.isFolder) {
        const children = await db.notes.where('parentId').equals(id).toArray()
        for (const child of children) {
          if (child.id) {
            await this.deleteNote(child.id) // Recursive delete
          }
        }
      }
      
      if (note.serverId) {
        // Note exists on server - mark as deleted immediately for instant UI feedback
        console.log(`🗑️ Marking note "${note.title}" as deleted locally, will sync to server`)
        await db.notes.update(id, { 
          deleted: true, 
          syncStatus: 'pending',
          updatedAt: new Date()
        })
        
        // Trigger background sync to delete from server
        // This will cleanup the local record after successful server deletion
        console.log(`🔄 Triggering sync to delete note "${note.title}" on server`)
        this.triggerNotesSync()
      } else {
        // Local-only note - hard delete immediately
        await db.notes.delete(id)
      }
      
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  // Build file tree structure for FileSystemPanel
  static async buildFileTree(): Promise<DatabaseResult<FileNode[]>> {
    try {
      // Order by: folders first, then temp folder first, then by creation date
      // Only get non-deleted notes for the UI
      const notes = await db.notes
        .orderBy('createdAt')
        .filter(note => !note.deleted)
        .toArray()
      // Sort to put temp folder first, then other folders, then files
      notes.sort((a, b) => {
        // Temp folder always first
        if (a.isFolder && a.title === 'temp') return -1
        if (b.isFolder && b.title === 'temp') return 1
        // Then other folders
        if (a.isFolder && !b.isFolder) return -1
        if (!a.isFolder && b.isFolder) return 1
        // Then by creation date
        return a.createdAt.getTime() - b.createdAt.getTime()
      })
      
      // Build the tree structure
      const nodeMap = new Map<number, FileNode>()
      const rootNodes: FileNode[] = []

      // First pass: create all nodes
      notes.forEach(note => {
        if (note.id) {
          // Clean display name - remove .lexical extension for files
          const displayName = note.isFolder 
            ? note.title 
            : note.title.endsWith('.lexical') 
              ? note.title.slice(0, -8) // Remove '.lexical'
              : note.title

          const node: FileNode = {
            id: note.id.toString(),
            name: displayName,
            type: note.isFolder ? 'folder' : 'file',
            noteId: note.id,
            children: note.isFolder ? [] : undefined,
            expanded: true // Expand by default
          }
          nodeMap.set(note.id, node)
        }
      })

      // Second pass: build parent-child relationships
      notes.forEach(note => {
        if (note.id) {
          const node = nodeMap.get(note.id)
          if (node) {
            if (note.parentId && nodeMap.has(note.parentId)) {
              const parent = nodeMap.get(note.parentId)
              if (parent?.children) {
                parent.children.push(node)
              }
            } else {
              // Root level node
              rootNodes.push(node)
            }
          }
        }
      })

      return { success: true, data: rootNodes }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  // Auto-save current note (for editor) - with smart sync debouncing
  static async autoSaveNote(id: number, content: string): Promise<DatabaseResult<void>> {
    try {
      await db.notes.update(id, { 
        content,
        updatedAt: new Date(),
        syncStatus: 'pending'
      })
      
      // Trigger smart sync for auto-save (longer debounce)
      this.triggerNotesSync(true) // true = auto-save mode (longer delay)
      
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  // =================
  // NOTES SYNC HELPERS
  // =================

  // Trigger background notes sync (debounced)
  private static notesSyncTimeout: NodeJS.Timeout | null = null
  private static triggerNotesSync(autoSaveMode: boolean = false): void {
    // Clear existing timeout to debounce rapid operations
    if (this.notesSyncTimeout) {
      clearTimeout(this.notesSyncTimeout)
    }
    
    // Use different delays for different scenarios
    const delay = autoSaveMode 
      ? 3000 // 3 seconds for auto-save (batch multiple edits)
      : 2000 // 2 seconds for manual operations
    
    // Sync after specified delay of inactivity
    this.notesSyncTimeout = setTimeout(async () => {
      if (navigator.onLine) {
        try {
          console.log('🔄 Triggering background notes sync...')
          await NotesSyncService.syncNotes()
          
          // Emit a custom event to notify UI components to refresh
          console.log('🔔 Emitting notesSynced event for UI refresh')
          window.dispatchEvent(new CustomEvent('notesSynced'))
        } catch (error) {
          console.error('Background notes sync failed:', error)
        }
      }
    }, delay)
  }

  // Manual sync method for user-triggered syncs
  static async syncNotes(): Promise<DatabaseResult<void>> {
    try {
      const result = await NotesSyncService.performFullSync()
      
      if (result.success) {
        console.log(`✅ Manual notes sync successful: ${result.syncedCount} items synced`)
        
        // Notify UI to refresh
        console.log('🔔 Manual notes sync complete - emitting notesSynced event')
        window.dispatchEvent(new CustomEvent('notesSynced'))
        
        return { success: true }
      } else {
        console.error('Manual notes sync failed:', result.errors)
        return { success: false, error: result.errors.join(', ') }
      }
    } catch (error) {
      console.error('Manual notes sync error:', error)
      return { success: false, error: String(error) }
    }
  }
}

// =================
// UTILITY FUNCTIONS
// =================

class DatabaseUtils {
  // Get sync status for all pending items
  static async getPendingSyncItems(): Promise<DatabaseResult<{ todos: Todo[], notes: Note[] }>> {
    try {
      const pendingTodos = await db.todos.where('syncStatus').equals('pending').toArray()
      const pendingNotes = await db.notes.where('syncStatus').equals('pending').toArray()
      
      return { 
        success: true, 
        data: { todos: pendingTodos, notes: pendingNotes } 
      }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  // Mark items as synced (for future sync functionality)
  static async markAsSynced(type: 'todo' | 'note', ids: number[]): Promise<DatabaseResult<void>> {
    try {
      if (type === 'todo') {
        await db.todos.where('id').anyOf(ids).modify({ syncStatus: 'synced' })
      } else {
        await db.notes.where('id').anyOf(ids).modify({ syncStatus: 'synced' })
      }
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  // Clear all data (for testing/reset)
  static async clearAllData(): Promise<DatabaseResult<void>> {
    try {
      await db.todos.clear()
      await db.notes.clear()
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }
}

// Export all services
export { TodoService, NoteService, DatabaseUtils }
