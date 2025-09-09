// BRUTAL NOTES - Backend API Service
// Handles communication with the FastAPI backend while preserving offline-first approach

import { supabase } from './supabase'
import type { Todo } from './types'

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
      const mappedTodo = {
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
      const mappedTodo = {
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
      const mappedTodo = {
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
    
    const result = await this.makeRequest<any>('/todos/bulk-sync', 'POST', syncData)
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
}

export default ApiService