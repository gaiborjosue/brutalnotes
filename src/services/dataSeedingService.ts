import { IndexedDBService, type LocalTodo, type LocalNote } from './indexedDBService'
import { TodoService, NoteService } from '../lib/database-service'

/**
 * Data seeding service for initial sync from Supabase to IndexedDB
 * This handles the one-time population of local storage with existing data
 */
export class DataSeedingService {
  
  /**
   * Performs initial sync from Supabase to IndexedDB
   * Should be called once after user login or when local DB is empty
   */
  static async performInitialSync(): Promise<{
    success: boolean
    totalTodos: number
    totalNotes: number
    error?: string
  }> {
    console.log('DataSeedingService: Starting initial sync from Supabase to IndexedDB...')
    
    try {
      // Check if we already have data in IndexedDB to avoid unnecessary syncing
      const stats = await IndexedDBService.getStats()
      if (stats.totalTodos > 0 || stats.totalNotes > 0) {
        console.log('DataSeedingService: Local data already exists, skipping initial sync')
        return {
          success: true,
          totalTodos: stats.totalTodos,
          totalNotes: stats.totalNotes
        }
      }

      // Fetch all data from Supabase
      const [todosResult, notesResult] = await Promise.all([
        TodoService.getAllTodos(),
        NoteService.getAllNotes()
      ])

      if (!todosResult.success) {
        throw new Error(`Failed to fetch todos: ${todosResult.error}`)
      }

      if (!notesResult.success) {
        throw new Error(`Failed to fetch notes: ${notesResult.error}`)
      }

      const supabaseTodos = todosResult.data || []
      const supabaseNotes = notesResult.data || []

      // Convert Supabase data to IndexedDB format
      const localTodos: LocalTodo[] = supabaseTodos.map(todo => ({
        serverId: todo.serverId,
        clientId: todo.clientId || todo.id,
        text: todo.text,
        completed: todo.completed,
        deleted: todo.deleted || false,
        createdAt: todo.createdAt,
        updatedAt: todo.updatedAt,
        syncStatus: 'synced' as const,
        needSync: false
      }))

      // Build a map to resolve parent relationships
      const clientIdToNoteMap = new Map<string, Note>()
      supabaseNotes.forEach(note => {
        if (note.clientId) {
          clientIdToNoteMap.set(note.clientId, note)
        }
      })

      const localNotes: LocalNote[] = []
      const noteIdMap = new Map<string, number>() // Map server clientId to local ID

      // Process notes in two passes to handle parent relationships
      // First pass: Create all notes without parent relationships
      for (let i = 0; i < supabaseNotes.length; i++) {
        const note = supabaseNotes[i]
        const localNote: LocalNote = {
          serverId: note.serverId,
          clientId: note.clientId || note.id,
          title: note.title,
          content: note.content,
          path: note.path,
          isFolder: note.isFolder,
          parentId: undefined, // Will be resolved in second pass
          serverParentId: note.serverParentId,
          parentClientId: note.parentClientId,
          deleted: note.deleted || false,
          version: note.version || 1,
          createdAt: note.createdAt,
          updatedAt: note.updatedAt,
          syncStatus: 'synced' as const,
          needSync: false
        }
        localNotes.push(localNote)
        
        // Store mapping for second pass (assuming bulk insert maintains order)
        if (note.clientId) {
          noteIdMap.set(note.clientId, i + 1) // Dexie auto-increment starts at 1
        }
      }

      // Bulk insert notes first
      await IndexedDBService.bulkUpsertNotes(localNotes)

      // Second pass: Update parent relationships
      for (let i = 0; i < localNotes.length; i++) {
        const localNote = localNotes[i]
        const originalNote = supabaseNotes[i]
        
        if (originalNote.parentClientId) {
          const parentLocalId = noteIdMap.get(originalNote.parentClientId)
          if (parentLocalId) {
            // Update the note with correct parent relationship
            const noteWithParent = await IndexedDBService.getNoteByClientId(localNote.clientId!)
            if (noteWithParent && noteWithParent.id) {
              await IndexedDBService.updateNote(noteWithParent.id, {
                parentId: parentLocalId
              })
            }
          }
        }
      }

      // Bulk insert todos
      await IndexedDBService.bulkUpsertTodos(localTodos)

      console.log(`DataSeedingService: Initial sync completed successfully. Synced ${localTodos.length} todos and ${localNotes.length} notes.`)

      return {
        success: true,
        totalTodos: localTodos.length,
        totalNotes: localNotes.length
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('DataSeedingService: Initial sync failed:', errorMessage)
      
      return {
        success: false,
        totalTodos: 0,
        totalNotes: 0,
        error: errorMessage
      }
    }
  }

  /**
   * Force refresh of all data from Supabase (overwrites local data)
   * Use with caution as this will lose any pending local changes
   */
  static async forceRefreshFromSupabase(): Promise<{
    success: boolean
    totalTodos: number
    totalNotes: number
    error?: string
  }> {
    console.log('DataSeedingService: Force refreshing from Supabase...')
    
    try {
      // Clear existing local data
      await IndexedDBService.clearAll()
      
      // Perform fresh sync
      return await this.performInitialSync()
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('DataSeedingService: Force refresh failed:', errorMessage)
      
      return {
        success: false,
        totalTodos: 0,
        totalNotes: 0,
        error: errorMessage
      }
    }
  }

  /**
   * Checks if initial sync is needed
   * Returns true if IndexedDB is empty or significantly out of date
   */
  static async isInitialSyncNeeded(): Promise<boolean> {
    try {
      const stats = await IndexedDBService.getStats()
      
      // If no local data exists, sync is needed
      if (stats.totalTodos === 0 && stats.totalNotes === 0) {
        return true
      }

      // Could add more sophisticated checks here, such as:
      // - Checking last sync timestamp
      // - Comparing counts with server
      // - Checking for orphaned data
      
      return false
    } catch (error) {
      console.error('DataSeedingService: Error checking sync status:', error)
      return true // If we can't check, assume sync is needed
    }
  }

  /**
   * Validates that local data is consistent after seeding
   */
  static async validateSeedingResult(): Promise<{
    isValid: boolean
    issues: string[]
  }> {
    const issues: string[] = []
    
    try {
      // Check for orphaned notes (notes with parentId that doesn't exist)
      const allNotes = await IndexedDBService.getAllNotes(true)
      const noteIds = new Set(allNotes.map(note => note.id).filter(Boolean))
      
      for (const note of allNotes) {
        if (note.parentId && !noteIds.has(note.parentId)) {
          issues.push(`Note "${note.title}" has invalid parentId: ${note.parentId}`)
        }
      }

      // Check for duplicate clientIds
      const clientIds = allNotes.map(note => note.clientId).filter(Boolean)
      const duplicateClientIds = clientIds.filter((id, index) => clientIds.indexOf(id) !== index)
      if (duplicateClientIds.length > 0) {
        issues.push(`Duplicate clientIds found: ${duplicateClientIds.join(', ')}`)
      }

      // Check todos for basic consistency
      const allTodos = await IndexedDBService.getAllTodos()
      const todoClientIds = allTodos.map(todo => todo.clientId).filter(Boolean)
      const duplicateTodoClientIds = todoClientIds.filter((id, index) => todoClientIds.indexOf(id) !== index)
      if (duplicateTodoClientIds.length > 0) {
        issues.push(`Duplicate todo clientIds found: ${duplicateTodoClientIds.join(', ')}`)
      }

      return {
        isValid: issues.length === 0,
        issues
      }
      
    } catch (error) {
      issues.push(`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return {
        isValid: false,
        issues
      }
    }
  }

  /**
   * Utility method to get seeding status and statistics
   */
  static async getSeedingStatus(): Promise<{
    hasData: boolean
    stats: Awaited<ReturnType<typeof IndexedDBService.getStats>>
    lastSyncTime?: Date
    needsSync: boolean
  }> {
    try {
      const stats = await IndexedDBService.getStats()
      const hasData = stats.totalTodos > 0 || stats.totalNotes > 0
      const needsSync = await this.isInitialSyncNeeded()
      
      return {
        hasData,
        stats,
        needsSync
      }
    } catch (error) {
      console.error('DataSeedingService: Error getting seeding status:', error)
      return {
        hasData: false,
        stats: {
          totalTodos: 0,
          totalNotes: 0,
          pendingTodos: 0,
          pendingNotes: 0,
          queueSize: 0
        },
        needsSync: true
      }
    }
  }
}

export default DataSeedingService
