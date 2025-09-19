import { useMemo, useRef } from 'react'
import { useShape } from '@electric-sql/react'

import { supabase } from '../supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Todo, Note } from '../types'
import {
  mapTodoRow,
  mapNoteRow,
  type TodoRow,
  type NoteRow,
  buildFileTreeFromNotes,
} from '../database-service'
import type { FileNode } from '../types'

function getElectricProxyUrl(): string {
  const envUrl = import.meta.env.VITE_ELECTRIC_PROXY_URL || '/api/v1/electric/shape'
  
  // If it's already a full URL, return as-is
  if (envUrl.startsWith('http://') || envUrl.startsWith('https://')) {
    return envUrl
  }
  
  // If it's a relative URL, construct full URL from window.location
  if (typeof window !== 'undefined') {
    const baseUrl = `${window.location.protocol}//${window.location.host}`
    return new URL(envUrl, baseUrl).toString()
  }
  
  // Fallback for SSR
  return envUrl
}

function authHeaders() {
  return {
    Authorization: async () => {
      const { data, error } = await supabase.auth.getSession()
      if (error) {
        console.error('ElectricSQL: Auth error:', error)
        throw error
      }

      const token = data.session?.access_token
      if (!token) {
        console.error('ElectricSQL: No auth token available')
        throw new Error('Supabase session is required for Electric shapes')
      }

      // Only log auth token usage during initial setup or errors
      return `Bearer ${token}`
    },
  }
}

export function useTodosShape() {
  const { loading: authLoading, user } = useAuth()
  const prevTodoCount = useRef(0)
  
  // Don't initialize shape until auth is ready and user is available
  const shouldInitialize = !authLoading && !!user
  
  const shape = useShape<TodoRow>({
    url: shouldInitialize ? getElectricProxyUrl() : '', // Disable by providing empty URL
    params: shouldInitialize ? {
      table: 'todos',
      where: 'deleted_at IS NULL',
      order_by: 'created_at DESC',
    } : {},
    headers: shouldInitialize ? authHeaders() : {},
    onError: (error) => {
      console.error('ElectricSQL Todos Shape Error:', error)
    },
  })

  const todos: Todo[] = useMemo(() => {
    if (!shouldInitialize) {
      return []
    }
    
    if (!shape.data) {
      return []
    }
    
    // Add validation to ensure shape.data is an array
    if (!Array.isArray(shape.data)) {
      console.error('ElectricSQL: Expected todos array but got:', typeof shape.data, shape.data)
      return []
    }
    
    // Only log on significant changes (not every re-render)
    const isSignificantChange = shape.data.length !== prevTodoCount.current
    if (isSignificantChange) {
      console.log(`ElectricSQL: Todos updated - ${shape.data.length} records`)
      prevTodoCount.current = shape.data.length
    }
    
    return shape.data.map(row => mapTodoRow(row as TodoRow))
  }, [shape.data, shouldInitialize])

  return {
    todos,
    shape,
    // Expose loading and sync status for better UX
    isInitialLoading: authLoading || (shouldInitialize && shape.isLoading && !shape.data),
    isSyncing: shouldInitialize && shape.isLoading,
    isLiveSync: shouldInitialize && !shape.isLoading && !!shape.data,
  }
}

export function useNotesShape() {
  const { loading: authLoading, user } = useAuth()
  const prevNoteCount = useRef(0)
  const prevTreeCount = useRef(0)
  
  // Don't initialize shape until auth is ready and user is available
  const shouldInitialize = !authLoading && !!user
  
  const shape = useShape<NoteRow>({
    url: shouldInitialize ? getElectricProxyUrl() : '', // Disable by providing empty URL
    params: shouldInitialize ? {
      table: 'notes',
      where: 'deleted_at IS NULL',
      order_by: 'created_at ASC',
    } : {},
    headers: shouldInitialize ? authHeaders() : {},
    onError: (error) => {
      console.error('ElectricSQL Notes Shape Error:', error)
      // Optionally retry or handle specific error types
      if (error.message?.includes('forEach')) {
        console.warn('ElectricSQL: Detected forEach error - this is usually temporary during initial sync')
      }
    },
  })

  const notes: Note[] = useMemo(() => {
    if (!shouldInitialize) {
      return []
    }
    
    if (!shape.data) {
      return []
    }
    
    // Add validation to ensure shape.data is an array
    if (!Array.isArray(shape.data)) {
      console.error('ElectricSQL: Expected array but got:', typeof shape.data, shape.data)
      return []
    }
    
    // Only log on significant changes (not every re-render)
    const isSignificantChange = shape.data.length !== prevNoteCount.current
    if (isSignificantChange) {
      console.log(`ElectricSQL: Notes updated - ${shape.data.length} records`)
      prevNoteCount.current = shape.data.length
    }
    
    try {
      return shape.data.map(row => mapNoteRow(row as NoteRow))
    } catch (error) {
      console.error('ElectricSQL: Error mapping note rows:', error)
      return []
    }
  }, [shape.data, shouldInitialize])

  const fileTree: FileNode[] = useMemo(() => {
    if (!shouldInitialize) {
      return []
    }
    
    try {
      const tree = buildFileTreeFromNotes(notes)
      // Only log when tree structure actually changes
      if (tree.length !== prevTreeCount.current) {
        console.log(`ElectricSQL: File tree updated - ${tree.length} root nodes`)
        prevTreeCount.current = tree.length
      }
      return tree
    } catch (error) {
      console.error('Error building file tree:', error)
      return []
    }
  }, [notes, shouldInitialize])

  return {
    notes,
    fileTree,
    shape,
    // Expose loading and sync status for better UX
    isInitialLoading: authLoading || (shouldInitialize && shape.isLoading && !shape.data),
    isSyncing: shouldInitialize && shape.isLoading,
    isLiveSync: shouldInitialize && !shape.isLoading && !!shape.data,
  }
}
