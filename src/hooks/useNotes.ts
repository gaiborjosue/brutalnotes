import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { IndexedDBService, type LocalNote } from '../services/indexedDBService'
import { SyncService } from '../services/syncService'
import { GlobalSyncCoordinator } from '../services/globalSyncCoordinator'
import { useOnlineStatus } from './useOnlineStatus'
import { useAuth } from '../contexts/AuthContext'
import { buildFileTreeFromNotes } from '../lib/database-service'
import type { FileNode } from '../lib/types'

/**
 * Offline-first hook for managing notes
 * Replaces ElectricSQL useShape for notes with local IndexedDB storage
 */
export function useNotes() {
  const [notes, setNotes] = useState<LocalNote[]>([])
  const [isInitialLoading, setIsInitialLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null)
  
  const { isOnline, isOnlineAfterOffline } = useOnlineStatus()
  const { user, loading: authLoading } = useAuth()

  // Load notes from IndexedDB
  const loadNotes = useCallback(async () => {
    try {
      const localNotes = await IndexedDBService.getAllNotes()
      setNotes(localNotes)
      setError(null)
    } catch (error) {
      console.error('Error loading notes from IndexedDB:', error)
      setError(error instanceof Error ? error.message : 'Failed to load notes')
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
        // Reload notes after successful sync
        await loadNotes()
        setLastSyncTime(new Date())
      } else {
        setError(result.error || 'Sync failed')
      }
    } catch (error) {
      console.error('Error syncing notes:', error)
      setError(error instanceof Error ? error.message : 'Sync failed')
    } finally {
      setIsSyncing(false)
    }
  }, [isSyncing, user, loadNotes])

  // Initial data seeding and loading
  useEffect(() => {
    if (authLoading || !user) {
      setIsInitialLoading(false)
      return
    }

    const initializeData = async () => {
      try {
        setIsInitialLoading(true)
        
        // Use global sync coordinator to prevent duplicate initial syncs
        if (isOnline) {
          console.log('useNotes: Requesting coordinated initial sync...', { user: user?.id?.substring(0, 8) })
          const seedResult = await GlobalSyncCoordinator.performInitialSyncOnce()
          if (!seedResult.success) {
            console.error('Initial sync failed:', seedResult.error)
            setError(`Initial sync failed: ${seedResult.error}`)
          }
        }
        
        // Load notes from local storage
        await loadNotes()
        
      } catch (error) {
        console.error('Error initializing notes:', error)
        setError(error instanceof Error ? error.message : 'Failed to initialize')
      } finally {
        setIsInitialLoading(false)
      }
    }

    initializeData()
  }, [authLoading, user, isOnline, loadNotes]) // Stable loadNotes reference prevents loops

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnlineAfterOffline && user && !authLoading) {
      console.log('useNotes: Auto-syncing after coming back online...')
      handleSync()
    }
  }, [isOnlineAfterOffline, user, authLoading, handleSync])

  // CRUD operations
  const createNote = useCallback(async (
    title: string,
    content: string,
    path?: string, // Made optional - will be generated from parent relationships
    isFolder = false,
    parentId?: number
  ): Promise<LocalNote | null> => {
    try {
      setError(null)
      const newNote = await IndexedDBService.addNote(title, content, path, isFolder, parentId)
      
      // Update local state immediately (optimistic update)
      setNotes(currentNotes => [...currentNotes, newNote])
      
      // Trigger sync if online
      if (isOnline) {
        handleSync()
      }
      
      return newNote
    } catch (error) {
      console.error('Error creating note:', error)
      setError(error instanceof Error ? error.message : 'Failed to create note')
      return null
    }
  }, [isOnline, handleSync])

  const updateNote = useCallback(async (id: number, updates: Partial<LocalNote>): Promise<boolean> => {
    try {
      setError(null)
      const updatedNote = await IndexedDBService.updateNote(id, updates)
      
      // Update local state immediately (optimistic update)
      setNotes(currentNotes => 
        currentNotes.map(note => 
          note.id === id ? updatedNote : note
        )
      )
      
      // Trigger sync if online
      if (isOnline) {
        handleSync()
      }
      
      return true
    } catch (error) {
      console.error('Error updating note:', error)
      setError(error instanceof Error ? error.message : 'Failed to update note')
      return false
    }
  }, [isOnline, handleSync])

  const deleteNote = useCallback(async (id: number): Promise<boolean> => {
    try {
      setError(null)
      await IndexedDBService.deleteNote(id)
      
      // Update local state immediately (optimistic update)
      // Remove the deleted note and any child notes
      setNotes(currentNotes => {
        const noteToDelete = currentNotes.find(note => note.id === id)
        if (!noteToDelete) return currentNotes

        // If it's a folder, also remove children recursively
        const getChildIds = (parentId: number): number[] => {
          const children = currentNotes.filter(note => note.parentId === parentId)
          let allChildIds: number[] = []
          
          for (const child of children) {
            if (child.id) {
              allChildIds.push(child.id)
              if (child.isFolder) {
                allChildIds = allChildIds.concat(getChildIds(child.id))
              }
            }
          }
          
          return allChildIds
        }

        const idsToRemove = [id]
        if (noteToDelete.isFolder) {
          idsToRemove.push(...getChildIds(id))
        }

        return currentNotes.filter(note => !idsToRemove.includes(note.id!))
      })
      
      // Trigger sync if online
      if (isOnline) {
        handleSync()
      }
      
      return true
    } catch (error) {
      console.error('Error deleting note:', error)
      setError(error instanceof Error ? error.message : 'Failed to delete note')
      return false
    }
  }, [isOnline, handleSync])

  const getNoteById = useCallback(async (id: number): Promise<LocalNote | null> => {
    try {
      const note = await IndexedDBService.getNoteById(id)
      return note || null
    } catch (error) {
      console.error('Error getting note by ID:', error)
      return null
    }
  }, [])

  const getNoteByClientId = useCallback(async (clientId: number): Promise<LocalNote | null> => {
    try {
      const note = await IndexedDBService.getNoteByClientId(clientId)
      return note || null
    } catch (error) {
      console.error('Error getting note by client ID:', error)
      return null
    }
  }, [])

  // Build file tree from notes (optimized with shallow comparison)
  const fileTree = useMemo((): FileNode[] => {
    try {
      // Only rebuild if we have notes with client IDs
      const validNotes = notes.filter(note => note.clientId)
      
      if (validNotes.length === 0) {
        return [] // Early return for empty state
      }
      
      const convertedNotes = validNotes.map(note => ({
        id: note.id,
        serverId: note.serverId,
        clientId: note.clientId!, // Use actual clientId
        title: note.title,
        content: note.content,
        path: note.path,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
        syncStatus: note.syncStatus,
        isFolder: note.isFolder,
        parentId: note.parentId,
        serverParentId: note.serverParentId,
        parentClientId: note.parentClientId, // Use actual parentClientId
        deleted: note.deleted,
        version: note.version || 1
      }))

      return buildFileTreeFromNotes(convertedNotes)
    } catch (error) {
      console.error('Error building file tree:', error)
      return []
    }
  }, [
    // Only rebuild when structural changes occur
    notes.map(n => `${n.clientId}-${n.title}-${n.isFolder}-${n.parentClientId}`).join(',')
  ])

  // Computed properties
  const folders = useMemo(() => 
    notes.filter(note => note.isFolder), [notes]
  )
  
  const files = useMemo(() => 
    notes.filter(note => !note.isFolder), [notes]
  )

  const hasPendingChanges = useMemo(() => 
    notes.some(note => note.syncStatus === 'pending' || note.needSync), [notes]
  )

  const hasErrors = useMemo(() => 
    notes.some(note => note.syncStatus === 'error'), [notes]
  )

  // Status flags similar to ElectricSQL useShape
  const isLiveSync = !isInitialLoading && !isSyncing && !!user && isOnline

  return {
    // Data
    notes,
    folders,
    files,
    fileTree, // Compatible with existing components
    
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
    createNote,
    updateNote,
    deleteNote,
    getNoteById,
    getNoteByClientId,
    sync: handleSync,
    refresh: loadNotes
  }
}

export default useNotes
