// BRUTAL NOTES - Backend API Service
// Handles communication with the FastAPI backend while preserving offline-first approach

import { supabase } from './supabase'
import type { Todo, Note } from './types'

interface ApiResult<T> {
  success: boolean
  data?: T
  error?: string
}

// Backend API Configuration
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1'

class ApiService {
  // Get authorization header with current session token
  private static async getAuthHeader(): Promise<Record<string, string>> {
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session?.access_token) {
      throw new Error('No authentication session found')
    }

    return {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json'
    }
  }

  // Generic API request handler
  private static async makeRequest<T>(
    endpoint: string, 
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: any,
    timeout: number = 10000
  ): Promise<ApiResult<T>> {
    try {
      const headers = await this.getAuthHeader()
      
      // Create abort controller for timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)
      
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        return { 
          success: false, 
          error: `HTTP ${response.status}: ${errorText}` 
        }
      }

      const data = await response.json()
      return { success: true, data }
    } catch (error) {
      // Handle specific error types
      if (error instanceof TypeError && error.message.includes('NetworkError')) {
        console.warn(`Network error for ${endpoint}:`, error.message)
        return { 
          success: false, 
          error: 'Network connection failed - please check your internet connection'
        }
      }
      
      if (error instanceof Error && error.name === 'AbortError') {
        console.warn(`Request timeout for ${endpoint}`)
        return { 
          success: false, 
          error: 'Request timeout - please try again'
        }
      }
      
      // Only log unexpected errors as errors
      console.error(`Unexpected API error for ${endpoint}:`, error)
      return { 
        success: false, 
        error: `Network error: ${error instanceof Error ? error.message : String(error)}` 
      }
    }
  }

  // =================
  // TODO API METHODS
  // =================

  // Get all todos from backend
  static async getAllTodos(): Promise<ApiResult<Todo[]>> {
    // Use proper pagination - get all todos by using a large limit
    // Backend automatically filters out soft-deleted todos (deleted_at IS NULL)
    const result = await this.makeRequest<any>('/todos?page=1&limit=1000')
    if (result.success && result.data) {
      // The backend returns TodosListResponse format
      const todos = result.data.todos || []
      
      // Map server format to frontend format
      // Backend already filters out deleted todos, so all returned todos are active
      const mappedTodos = todos.map((serverTodo: any) => ({
        text: serverTodo.text,
        completed: serverTodo.completed,
        serverId: String(serverTodo.id), // Map server 'id' to 'serverId'
        clientId: serverTodo.client_id, // Include client_id from server for proper sync mapping
        createdAt: new Date(serverTodo.created_at),
        updatedAt: new Date(serverTodo.updated_at),
        syncStatus: 'synced' as const
      }))
      
      console.log(`📥 Pulled ${mappedTodos.length} active todos from server (soft-deleted todos filtered by backend)`)
      return { success: true, data: mappedTodos }
    }
    return result
  }

  // Create todo on backend
  static async createTodo(text: string): Promise<ApiResult<Todo>> {
    const todoData = {
      text,
      completed: false
    }
    
    const result = await this.makeRequest<{todo: any}>('/todos', 'POST', todoData)
    if (result.success && result.data) {
      // Map server format to frontend format
      const mappedTodo: Todo = {
        text: result.data.todo.text,
        completed: result.data.todo.completed,
        serverId: String(result.data.todo.id),
        createdAt: new Date(result.data.todo.created_at),
        updatedAt: new Date(result.data.todo.updated_at),
        syncStatus: 'synced' as const
      }
      return { success: true, data: mappedTodo }
    }
    return result
  }

  // Update todo on backend
  static async updateTodo(id: string, updates: Partial<Todo>): Promise<ApiResult<Todo>> {
    const result = await this.makeRequest<{todo: any}>(`/todos/${id}`, 'PUT', updates)
    if (result.success && result.data) {
      // Map server format to frontend format
      const mappedTodo: Todo = {
        text: result.data.todo.text,
        completed: result.data.todo.completed,
        serverId: String(result.data.todo.id),
        createdAt: new Date(result.data.todo.created_at),
        updatedAt: new Date(result.data.todo.updated_at),
        syncStatus: 'synced' as const
      }
      return { success: true, data: mappedTodo }
    }
    return result
  }

  // Delete todo on backend
  static async deleteTodo(id: string): Promise<ApiResult<void>> {
    return this.makeRequest<void>(`/todos/${id}`, 'DELETE')
  }

  // Toggle todo completion on backend
  static async toggleTodo(id: string): Promise<ApiResult<Todo>> {
    const result = await this.makeRequest<{todo: any}>(`/todos/${id}/toggle`, 'POST')
    if (result.success && result.data) {
      // Map server format to frontend format
      const mappedTodo: Todo = {
        text: result.data.todo.text,
        completed: result.data.todo.completed,
        serverId: String(result.data.todo.id),
        createdAt: new Date(result.data.todo.created_at),
        updatedAt: new Date(result.data.todo.updated_at),
        syncStatus: 'synced' as const
      }
      return { success: true, data: mappedTodo }
    }
    return result
  }

  // =================
  // SYNC METHODS
  // =================

  // Bulk sync todos with backend using the official bulk-sync endpoint
  static async bulkSyncTodos(
    todosToSync: Todo[], 
    deletedClientIds: number[] = []
  ): Promise<ApiResult<Todo[]>> {
    const syncData = {
      todos: todosToSync.map(todo => ({
        text: todo.text,
        completed: todo.completed,
        client_id: todo.clientId || todo.id // Use clientId or fallback to local id
      })),
      client_todos_deleted: deletedClientIds,
      last_sync_timestamp: null // Could be enhanced later for incremental sync
    }
    
    console.log(`📤 Bulk syncing ${todosToSync.length} todos, deleting ${deletedClientIds.length} client IDs`)
    
    // Use longer timeout for bulk sync operations (30 seconds)
    const result = await this.makeRequest<any>('/todos/bulk-sync', 'POST', syncData, 30000)
    if (result.success && result.data) {
      const syncedTodos = result.data.todos || []
      
      // Map server format to frontend format
      const mappedTodos = syncedTodos.map((serverTodo: any) => ({
        text: serverTodo.text,
        completed: serverTodo.completed,
        serverId: String(serverTodo.id),
        clientId: serverTodo.client_id,
        createdAt: new Date(serverTodo.created_at),
        updatedAt: new Date(serverTodo.updated_at),
        syncStatus: 'synced' as const
      }))
      
      console.log(`✅ Bulk sync successful: ${mappedTodos.length} todos synced`)
      return { success: true, data: mappedTodos }
    }
    return result
  }

  // Legacy method - keeping for backward compatibility but marked as deprecated
  /** @deprecated Use bulkSyncTodos instead for better performance */
  static async syncTodos(todos: Todo[]): Promise<ApiResult<Todo[]>> {
    return this.bulkSyncTodos(todos)
  }

  // =================
  // CONNECTION CHECK
  // =================

  // Check if backend is reachable and user is authenticated
  static async checkConnection(): Promise<boolean> {
    try {
      // Use correct pagination parameters for backend
      const result = await this.makeRequest('/todos?page=1&limit=1', 'GET', undefined, 8000)
      return result.success
    } catch (error) {
      // Don't log abort errors as they're expected
      if (error instanceof Error && error.name !== 'AbortError') {
        console.warn('Connection check failed:', error.message)
      }
      return false
    }
  }

  // More robust connection check that handles network transitions
  static async isBackendReachable(): Promise<boolean> {
    // First check if we're actually online
    if (!navigator.onLine) {
      return false
    }

    try {
      // Try a simple health check first (longer timeout, simpler endpoint)
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)
      
      const healthCheck = await fetch(`${API_BASE_URL.replace('/api/v1', '')}/health`, {
        method: 'GET',
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)
      
      if (healthCheck.ok) {
        return true
      }
    } catch (error) {
      // Only log non-abort errors
      if (error instanceof Error && error.name !== 'AbortError') {
        console.warn('Health check failed:', error.message)
      }
    }

    // Fallback to connection check
    return this.checkConnection()
  }

  // =================
  // NOTES API METHODS
  // =================

  // Get all notes from backend
  static async getAllNotes(): Promise<ApiResult<Note[]>> {
    // Backend automatically filters out soft-deleted notes (deleted_at IS NULL)
    const result = await this.makeRequest<any>('/notes?page=1&limit=1000')
    if (result.success && result.data) {
      const notes = result.data.notes || []
      
      // Map server format to frontend format
      const mappedNotes = notes.map((serverNote: any) => ({
        title: serverNote.title,
        content: serverNote.content,
        path: serverNote.path,
        isFolder: serverNote.is_folder,
        serverId: String(serverNote.id),
        serverParentId: serverNote.parent_id ? String(serverNote.parent_id) : undefined,
        clientId: serverNote.client_id,
        parentClientId: serverNote.parent_client_id ?? undefined,
        createdAt: new Date(serverNote.created_at),
        updatedAt: new Date(serverNote.updated_at),
        syncStatus: 'synced' as const,
        deleted: false
      }))
      
      console.log(`📥 Pulled ${mappedNotes.length} active notes from server (soft-deleted notes filtered by backend)`)
      return { success: true, data: mappedNotes }
    }
    return result
  }

  // Get notes tree structure from backend
  static async getNotesTree(): Promise<ApiResult<any[]>> {
    const result = await this.makeRequest<any>('/notes/tree')
    if (result.success && result.data) {
      return { success: true, data: result.data.tree || [] }
    }
    return result
  }

  // Create note on backend
  static async createNote(noteData: Partial<Note>): Promise<ApiResult<Note>> {
    const serverNoteData = {
      title: noteData.title,
      content: noteData.content,
      path: noteData.path,
      is_folder: noteData.isFolder,
      parent_id: noteData.serverParentId || null,
      parent_client_id: noteData.parentClientId ?? noteData.parentId ?? null,
      client_id: noteData.clientId || noteData.id
    }
    
    const result = await this.makeRequest<{note: any}>('/notes', 'POST', serverNoteData)
    if (result.success && result.data) {
      const mappedNote: Note = {
        title: result.data.note.title,
        content: result.data.note.content,
        path: result.data.note.path,
        isFolder: result.data.note.is_folder,
        serverId: String(result.data.note.id),
        serverParentId: result.data.note.parent_id ? String(result.data.note.parent_id) : undefined,
        clientId: result.data.note.client_id,
        parentClientId: result.data.note.parent_client_id ?? undefined,
        createdAt: new Date(result.data.note.created_at),
        updatedAt: new Date(result.data.note.updated_at),
        syncStatus: 'synced' as const,
        deleted: false
      }
      return { success: true, data: mappedNote }
    }
    return { success: false, error: result.error || 'Failed to create note' }
  }

  // Update note on backend
  static async updateNote(id: string, updates: Partial<Note>): Promise<ApiResult<Note>> {
    const serverUpdates = {
      title: updates.title,
      content: updates.content,
      path: updates.path,
      is_folder: updates.isFolder,
      parent_id: updates.serverParentId,
      parent_client_id: updates.parentClientId ?? updates.parentId ?? null
    }
    
    const result = await this.makeRequest<{note: any}>(`/notes/${id}`, 'PUT', serverUpdates)
    if (result.success && result.data) {
      const mappedNote: Note = {
        title: result.data.note.title,
        content: result.data.note.content,
        path: result.data.note.path,
        isFolder: result.data.note.is_folder,
        serverId: String(result.data.note.id),
        serverParentId: result.data.note.parent_id ? String(result.data.note.parent_id) : undefined,
        clientId: result.data.note.client_id,
        parentClientId: result.data.note.parent_client_id ?? undefined,
        createdAt: new Date(result.data.note.created_at),
        updatedAt: new Date(result.data.note.updated_at),
        syncStatus: 'synced' as const,
        deleted: false
      }
      return { success: true, data: mappedNote }
    }
    return { success: false, error: result.error || 'Failed to create note' }
  }

  // Delete note on backend
  static async deleteNote(id: string): Promise<ApiResult<void>> {
    return this.makeRequest<void>(`/notes/${id}`, 'DELETE')
  }

  // Bulk sync notes with backend using the official bulk-sync endpoint
  static async bulkSyncNotes(
    notesToSync: Note[], 
    deletedClientIds: number[] = []
  ): Promise<ApiResult<Note[]>> {
    const syncData = {
      notes: notesToSync.map(note => ({
        title: note.title,
        content: note.content,
        path: note.path,
        is_folder: note.isFolder, // Backend expects is_folder
        parent_id: note.serverParentId || null, // Backend expects parent_id as UUID
        parent_client_id: note.parentClientId ?? note.parentId ?? null,
        client_id: note.clientId ?? note.id ?? null,
        server_id: note.serverId ?? null
      })),
      client_notes_deleted: deletedClientIds,
      last_sync_timestamp: null
    }
    
    console.log(`📤 Bulk syncing ${notesToSync.length} notes, deleting ${deletedClientIds.length} client IDs`)
    const payloadSize = JSON.stringify(syncData).length
    console.log(`📤 Sync payload:`, { 
      notesToSync: notesToSync.length, 
      deletedClientIds: deletedClientIds.length,
      payloadSizeBytes: payloadSize,
      payloadSizeMB: (payloadSize / (1024 * 1024)).toFixed(2),
      sampleNote: notesToSync[0] ? { 
        title: notesToSync[0].title, 
        contentLength: notesToSync[0].content?.length || 0,
        hasLargeContent: (notesToSync[0].content?.length || 0) > 100000,
        serverParentId: notesToSync[0].serverParentId,
        parentClientId: notesToSync[0].parentClientId,
        parentId: notesToSync[0].parentId,
        clientId: notesToSync[0].clientId
      } : null
    })
    
    // Use longer timeout for bulk sync operations (30 seconds)
    console.log(`📤 Sending bulk-sync request to: ${API_BASE_URL}/notes/bulk-sync`)
    const result = await this.makeRequest<any>('/notes/bulk-sync', 'POST', syncData, 30000)
    
    if (!result.success) {
      console.error(`❌ Bulk sync failed:`, result.error)
      console.error(`❌ Is the backend server running on ${API_BASE_URL}?`)
      
      // Fallback: Try using individual API calls
      console.log(`🔄 Trying fallback sync with individual API calls...`)
      return await this.fallbackSyncNotes(notesToSync, deletedClientIds)
    }
    
    if (result.success && result.data) {
      const syncedNotes = result.data.notes || []
      
      // Map server format to frontend format
      const mappedNotes = syncedNotes.map((serverNote: any) => ({
        title: serverNote.title,
        content: serverNote.content,
        path: serverNote.path,
        isFolder: serverNote.is_folder,
        serverId: String(serverNote.id),
        serverParentId: serverNote.parent_id ? String(serverNote.parent_id) : undefined,
        clientId: serverNote.client_id,
        parentClientId: serverNote.parent_client_id ?? undefined,
        createdAt: new Date(serverNote.created_at),
        updatedAt: new Date(serverNote.updated_at),
        syncStatus: 'synced' as const,
        deleted: false
      }))
      
      console.log(`✅ Bulk sync successful: ${mappedNotes.length} notes synced`)
      return { success: true, data: mappedNotes }
    }
    return result
  }

  // Fallback sync method using individual API calls
  private static async fallbackSyncNotes(
    notesToSync: Note[], 
    deletedClientIds: number[] = []
  ): Promise<ApiResult<Note[]>> {
    console.log(`🔄 Starting fallback sync with individual API calls...`)
    const syncedNotes: Note[] = []
    let errorCount = 0
    
    // Process note creations/updates
    for (const note of notesToSync) {
      try {
        if (note.serverId) {
          // Update existing note
          console.log(`📝 Updating note: ${note.title}`)
          const result = await this.updateNote(note.serverId, {
            title: note.title,
            content: note.content,
            path: note.path,
            isFolder: note.isFolder,
            serverParentId: note.serverParentId,
            parentClientId: note.parentClientId ?? note.parentId
          })
          
          if (result.success && result.data) {
            syncedNotes.push(result.data)
          } else {
            console.warn(`❌ Failed to update note ${note.title}:`, result.error)
            errorCount++
          }
        } else {
          // Create new note
          console.log(`➕ Creating note: ${note.title}`)
          const result = await this.createNote({
            title: note.title,
            content: note.content,
            path: note.path,
            is_folder: note.isFolder,
            parent_id: note.serverParentId || null,
            parent_client_id: note.parentClientId ?? note.parentId ?? null,
            client_id: note.clientId || note.id
          })
          
          if (result.success && result.data) {
            syncedNotes.push(result.data)
          } else {
            console.warn(`❌ Failed to create note ${note.title}:`, result.error)
            errorCount++
          }
        }
      } catch (error) {
        console.error(`💥 Exception syncing note ${note.title}:`, error)
        errorCount++
      }
      
      // Add small delay between requests to avoid overwhelming server
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    // Process deletions
    for (const clientId of deletedClientIds) {
      try {
        // Find notes to delete by client_id - this would need to be done differently
        // since we don't have a direct way to find server ID by client ID
        console.log(`🗑️ Processing deletion for client ID: ${clientId}`)
        
        // For now, we'll skip individual deletions as they're complex to implement
        // without a client_id lookup endpoint. The bulk-sync is really needed for this.
        console.warn(`⚠️ Skipping deletion of client ID ${clientId} - bulk-sync needed for deletions`)
        
      } catch (error) {
        console.error(`💥 Exception deleting client ID ${clientId}:`, error)
        errorCount++
      }
    }
    
    const successRate = notesToSync.length > 0 ? 
      ((notesToSync.length - errorCount) / notesToSync.length * 100).toFixed(1) : '100'
    
    console.log(`✅ Fallback sync completed: ${syncedNotes.length}/${notesToSync.length} notes synced (${successRate}% success rate)`)
    
    if (errorCount > 0) {
      return {
        success: false,
        error: `Fallback sync completed with ${errorCount} errors. ${syncedNotes.length} notes successfully synced.`,
        data: syncedNotes
      }
    }
    
    return { success: true, data: syncedNotes }
  }
}

export default ApiService
