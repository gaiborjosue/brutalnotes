import { useState, useEffect, useCallback, useMemo } from 'react'
import { IndexedDBService, type LocalTodo } from '../services/indexedDBService'
import { SyncService } from '../services/syncService'
import { DataSeedingService } from '../services/dataSeedingService'
import { useOnlineStatus } from './useOnlineStatus'
import { useAuth } from '../contexts/AuthContext'

/**
 * Offline-first hook for managing todos
 * Replaces ElectricSQL useShape for todos with local IndexedDB storage
 */
export function useTodos() {
  const [todos, setTodos] = useState<LocalTodo[]>([])
  const [isInitialLoading, setIsInitialLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null)
  
  const { isOnline, isOnlineAfterOffline } = useOnlineStatus()
  const { user, loading: authLoading } = useAuth()

  // Load todos from IndexedDB
  const loadTodos = useCallback(async () => {
    try {
      const localTodos = await IndexedDBService.getAllTodos()
      setTodos(localTodos)
      setError(null)
    } catch (error) {
      console.error('Error loading todos from IndexedDB:', error)
      setError(error instanceof Error ? error.message : 'Failed to load todos')
    }
  }, [])

  // Sync function
  const handleSync = useCallback(async () => {
    if (isSyncing || !user) return

    try {
      setIsSyncing(true)
      setError(null)
      
      const result = await SyncService.sync()
      
      if (result.success) {
        // Reload todos after successful sync
        await loadTodos()
        setLastSyncTime(new Date())
      } else {
        setError(result.error || 'Sync failed')
      }
    } catch (error) {
      console.error('Error syncing todos:', error)
      setError(error instanceof Error ? error.message : 'Sync failed')
    } finally {
      setIsSyncing(false)
    }
  }, [isSyncing, user, loadTodos])

  // Initial data seeding and loading
  useEffect(() => {
    if (authLoading || !user) {
      setIsInitialLoading(false)
      return
    }

    const initializeData = async () => {
      try {
        setIsInitialLoading(true)
        
        // Check if initial sync is needed
        const needsSync = await DataSeedingService.isInitialSyncNeeded()
        
        if (needsSync && isOnline) {
          console.log('useTodos: Performing initial sync...')
          const seedResult = await DataSeedingService.performInitialSync()
          if (!seedResult.success) {
            console.error('Initial sync failed:', seedResult.error)
            setError(`Initial sync failed: ${seedResult.error}`)
          }
        }
        
        // Load todos from local storage
        await loadTodos()
        
      } catch (error) {
        console.error('Error initializing todos:', error)
        setError(error instanceof Error ? error.message : 'Failed to initialize')
      } finally {
        setIsInitialLoading(false)
      }
    }

    initializeData()
  }, [authLoading, user, isOnline, loadTodos])

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnlineAfterOffline && user && !authLoading) {
      console.log('useTodos: Auto-syncing after coming back online...')
      handleSync()
    }
  }, [isOnlineAfterOffline, user, authLoading, handleSync])

  // CRUD operations
  const addTodo = useCallback(async (text: string): Promise<LocalTodo | null> => {
    try {
      setError(null)
      const newTodo = await IndexedDBService.addTodo(text)
      
      // Update local state immediately (optimistic update)
      setTodos(currentTodos => [newTodo, ...currentTodos])
      
      // Trigger sync if online
      if (isOnline) {
        handleSync()
      }
      
      return newTodo
    } catch (error) {
      console.error('Error adding todo:', error)
      setError(error instanceof Error ? error.message : 'Failed to add todo')
      return null
    }
  }, [isOnline, handleSync])

  const toggleTodo = useCallback(async (id: number): Promise<boolean> => {
    try {
      setError(null)
      const updatedTodo = await IndexedDBService.toggleTodo(id)
      
      // Update local state immediately (optimistic update)
      setTodos(currentTodos => 
        currentTodos.map(todo => 
          todo.id === id ? updatedTodo : todo
        )
      )
      
      // Trigger sync if online
      if (isOnline) {
        handleSync()
      }
      
      return true
    } catch (error) {
      console.error('Error toggling todo:', error)
      setError(error instanceof Error ? error.message : 'Failed to toggle todo')
      return false
    }
  }, [isOnline, handleSync])

  const deleteTodo = useCallback(async (id: number): Promise<boolean> => {
    try {
      setError(null)
      await IndexedDBService.deleteTodo(id)
      
      // Update local state immediately (optimistic update)
      setTodos(currentTodos => 
        currentTodos.filter(todo => todo.id !== id)
      )
      
      // Trigger sync if online
      if (isOnline) {
        handleSync()
      }
      
      return true
    } catch (error) {
      console.error('Error deleting todo:', error)
      setError(error instanceof Error ? error.message : 'Failed to delete todo')
      return false
    }
  }, [isOnline, handleSync])

  const updateTodo = useCallback(async (id: number, updates: Partial<LocalTodo>): Promise<boolean> => {
    try {
      setError(null)
      const updatedTodo = await IndexedDBService.updateTodo(id, updates)
      
      // Update local state immediately (optimistic update)
      setTodos(currentTodos => 
        currentTodos.map(todo => 
          todo.id === id ? updatedTodo : todo
        )
      )
      
      // Trigger sync if online
      if (isOnline) {
        handleSync()
      }
      
      return true
    } catch (error) {
      console.error('Error updating todo:', error)
      setError(error instanceof Error ? error.message : 'Failed to update todo')
      return false
    }
  }, [isOnline, handleSync])

  // Computed properties
  const completedTodos = useMemo(() => 
    todos.filter(todo => todo.completed), [todos]
  )
  
  const pendingTodos = useMemo(() => 
    todos.filter(todo => !todo.completed), [todos]
  )

  const hasPendingChanges = useMemo(() => 
    todos.some(todo => todo.syncStatus === 'pending' || todo.needSync), [todos]
  )

  const hasErrors = useMemo(() => 
    todos.some(todo => todo.syncStatus === 'error'), [todos]
  )

  // Status flags similar to ElectricSQL useShape
  const isLiveSync = !isInitialLoading && !isSyncing && !!user && isOnline

  return {
    // Data
    todos,
    completedTodos,
    pendingTodos,
    
    // Status flags (similar to ElectricSQL useShape)
    isInitialLoading,
    isSyncing,
    isLiveSync,
    
    // Offline-first specific status
    isOnline,
    hasPendingChanges,
    hasErrors,
    error,
    lastSyncTime,
    
    // Actions
    addTodo,
    toggleTodo,
    deleteTodo,
    updateTodo,
    sync: handleSync,
    refresh: loadTodos
  }
}

export default useTodos
