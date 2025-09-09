// BRUTAL NOTES - Database Service Layer

import { db } from './database'
import type { Todo, Note, FileNode, DatabaseResult } from './types'

// =================
// TODO OPERATIONS
// =================

class TodoService {
  // Get all todos
  static async getAllTodos(): Promise<DatabaseResult<Todo[]>> {
    try {
      const todos = await db.todos.orderBy('createdAt').reverse().toArray()
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
      const todo = await db.todos.get(id)
      
      return { success: true, data: todo }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  // Update todo
  static async updateTodo(id: number, updates: Partial<Todo>): Promise<DatabaseResult<Todo>> {
    try {
      await db.todos.update(id, updates)
      const todo = await db.todos.get(id)
      
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

      await db.todos.update(id, { completed: !todo.completed })
      const updatedTodo = await db.todos.get(id)
      
      return { success: true, data: updatedTodo }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  // Delete todo
  static async deleteTodo(id: number): Promise<DatabaseResult<void>> {
    try {
      await db.todos.delete(id)
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
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
      const note = await db.notes.get(id)
      
      return { success: true, data: note }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  // Update note content
  static async updateNote(id: number, updates: Partial<Note>): Promise<DatabaseResult<Note>> {
    try {
      await db.notes.update(id, updates)
      const note = await db.notes.get(id)
      
      return { success: true, data: note }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  // Delete note
  static async deleteNote(id: number): Promise<DatabaseResult<void>> {
    try {
      // If it's a folder, delete all children first
      const note = await db.notes.get(id)
      if (note?.isFolder) {
        const children = await db.notes.where('parentId').equals(id).toArray()
        for (const child of children) {
          if (child.id) {
            await this.deleteNote(child.id) // Recursive delete
          }
        }
      }
      
      await db.notes.delete(id)
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  // Build file tree structure for FileSystemPanel
  static async buildFileTree(): Promise<DatabaseResult<FileNode[]>> {
    try {
      // Order by: folders first, then temp folder first, then by creation date
      const notes = await db.notes.orderBy('createdAt').toArray()
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

  // Auto-save current note (for editor)
  static async autoSaveNote(id: number, content: string): Promise<DatabaseResult<void>> {
    try {
      await db.notes.update(id, { 
        content,
        updatedAt: new Date(),
        syncStatus: 'pending'
      })
      return { success: true }
    } catch (error) {
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
