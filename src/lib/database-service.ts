import { supabase } from './supabase'
import type { Todo, Note, FileNode, DatabaseResult } from './types'

const SYNCED_STATUS: Todo['syncStatus'] = 'synced'

export interface TodoRow extends Record<string, unknown> {
  id: string
  client_id: number | null
  text: string
  completed: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
  _deleted: boolean
}

export interface NoteRow extends Record<string, unknown> {
  id: string
  client_id: number | null
  title: string
  content: string
  path: string
  is_folder: boolean
  parent_id: string | null
  parent_client_id: number | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  _deleted: boolean
}

async function requireUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error) {
    throw new Error(error.message)
  }

  if (!user) {
    throw new Error('User is not authenticated')
  }

  return user
}

export function mapTodoRow(row: TodoRow): Todo {
  const createdAt = row.created_at ? new Date(row.created_at) : new Date()
  const updatedAt = row.updated_at ? new Date(row.updated_at) : createdAt

  return {
    id: row.client_id ?? undefined,
    clientId: row.client_id ?? undefined,
    serverId: row.id,
    text: row.text,
    completed: row.completed,
    deleted: Boolean(row._deleted),
    createdAt,
    updatedAt,
    syncStatus: SYNCED_STATUS,
  }
}

export function mapNoteRow(row: NoteRow): Note {
  const createdAt = row.created_at ? new Date(row.created_at) : new Date()
  const updatedAt = row.updated_at ? new Date(row.updated_at) : createdAt

  return {
    id: row.client_id ?? undefined,
    clientId: row.client_id ?? undefined,
    serverId: row.id,
    title: row.title,
    content: row.content,
    path: row.path,
    isFolder: row.is_folder,
    parentId: row.parent_client_id ?? undefined,
    parentClientId: row.parent_client_id ?? undefined,
    serverParentId: row.parent_id ?? undefined,
    deleted: Boolean(row._deleted),
    createdAt,
    updatedAt,
    syncStatus: 'synced',
  }
}

function generateClientId() {
  return Math.floor(Date.now() + Math.random() * 1000)
}

export class TodoService {
  static async getAllTodos(): Promise<DatabaseResult<Todo[]>> {
    try {
      const user = await requireUser()

      const { data, error } = await supabase
        .from('todos')
        .select('*')
        .eq('user_id', user.id)
        .eq('_deleted', false) // Use boolean field instead of deleted_at
        .order('created_at', { ascending: false })

      if (error) {
        return { success: false, error: error.message }
      }

      const rows = (data as TodoRow[] | null) ?? []
      const todos = rows.map(mapTodoRow)
      return { success: true, data: todos }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  static async addTodo(text: string): Promise<DatabaseResult<Todo>> {
    try {
      const user = await requireUser()
      const clientId = generateClientId()

      const { data, error } = await supabase
        .from('todos')
        .insert({
          user_id: user.id,
          text,
          completed: false,
          client_id: clientId,
        })
        .select()
        .single()

      if (error || !data) {
        return { success: false, error: error?.message ?? 'Failed to create todo' }
      }

      return { success: true, data: mapTodoRow(data as TodoRow) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  static async updateTodo(id: number, updates: { text?: string; completed?: boolean }): Promise<DatabaseResult<Todo>> {
    try {
      const user = await requireUser()

      const { data: existing, error: fetchError } = await supabase
        .from('todos')
        .select('*')
        .eq('user_id', user.id)
        .eq('client_id', id)
        .single()

      if (fetchError || !existing) {
        return { success: false, error: fetchError?.message ?? 'Todo not found' }
      }

      const { data, error } = await supabase
        .from('todos')
        .update(updates)
        .eq('user_id', user.id)
        .eq('client_id', id)
        .select()
        .single()

      if (error || !data) {
        return { success: false, error: error?.message ?? 'Failed to update todo' }
      }

      return { success: true, data: mapTodoRow(data as TodoRow) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  static async toggleTodo(id: number): Promise<DatabaseResult<Todo>> {
    try {
      const user = await requireUser()

      const { data: existing, error: fetchError } = await supabase
        .from('todos')
        .select('*')
        .eq('user_id', user.id)
        .eq('client_id', id)
        .single()

      if (fetchError || !existing) {
        return { success: false, error: fetchError?.message ?? 'Todo not found' }
      }

      const { data, error } = await supabase
        .from('todos')
        .update({
          completed: !(existing as TodoRow).completed,
        })
        .eq('user_id', user.id)
        .eq('client_id', id)
        .select()
        .single()

      if (error || !data) {
        return { success: false, error: error?.message ?? 'Failed to update todo' }
      }

      return { success: true, data: mapTodoRow(data as TodoRow) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  static async deleteTodo(id: number): Promise<DatabaseResult<void>> {
    try {
      const user = await requireUser()

      const timestamp = new Date().toISOString()

      const { error } = await supabase
        .from('todos')
        .update({ 
          _deleted: true,
          deleted_at: timestamp 
        })
        .eq('user_id', user.id)
        .eq('client_id', id)

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  static async syncTodos(): Promise<DatabaseResult<void>> {
    // Sync is now handled by the SyncService
    return { success: true }
  }
}

export class NoteService {
  private static normalizePath(path: string) {
    return path.replace(/^\/+|\/+$/g, '')
  }

  static async getAllNotes(includeDeleted = false): Promise<DatabaseResult<Note[]>> {
    try {
      const user = await requireUser()

      let builder = supabase
        .from('notes')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })

      if (!includeDeleted) {
        builder = builder.eq('_deleted', false) // Use boolean field instead of deleted_at
      }

      const { data, error } = await builder

      if (error) {
        return { success: false, error: error.message }
      }

      const rows = (data as NoteRow[] | null) ?? []
      const notes = rows.map(mapNoteRow)
      return { success: true, data: notes }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  static async getNoteById(id: number): Promise<DatabaseResult<Note>> {
    try {
      const user = await requireUser()

      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('user_id', user.id)
        .eq('client_id', id)
        .single()

      if (error || !data) {
        return { success: false, error: error?.message ?? 'Note not found' }
      }

      return { success: true, data: mapNoteRow(data as NoteRow) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  static async createNote(
    title: string,
    content: string,
    path: string,
    isFolder = false,
    parentId?: number
  ): Promise<DatabaseResult<Note>> {
    try {
      const user = await requireUser()
      const clientId = generateClientId()
      const normalizedPath = this.normalizePath(path)

      const insertPayload = {
        user_id: user.id,
        title,
        content,
        path: normalizedPath,
        is_folder: isFolder,
        client_id: clientId,
        parent_client_id: parentId ?? null,
      }

      console.log('NoteService.createNote: Attempting to create note with payload:', insertPayload)

      const { data, error } = await supabase
        .from('notes')
        .insert(insertPayload)
        .select()
        .single()

      console.log('NoteService.createNote: Supabase response:', { data, error })

      if (error) {
        console.error('NoteService.createNote: Supabase error:', error)
        return { success: false, error: error.message }
      }

      if (!data) {
        console.error('NoteService.createNote: No data returned from Supabase')
        return { success: false, error: 'No data returned from database' }
      }

      const mappedNote = mapNoteRow(data as NoteRow)
      console.log('NoteService.createNote: Successfully created note:', mappedNote)
      
      return { success: true, data: mappedNote }
    } catch (error) {
      console.error('NoteService.createNote: Exception caught:', error)
      return { success: false, error: (error as Error).message }
    }
  }

  static async updateNote(id: number, updates: Partial<Note>): Promise<DatabaseResult<Note>> {
    try {
      const user = await requireUser()

      const payload: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      }

      if (updates.title !== undefined) payload.title = updates.title
      if (updates.content !== undefined) payload.content = updates.content
      if (updates.path !== undefined) payload.path = this.normalizePath(updates.path)
      if (updates.isFolder !== undefined) payload.is_folder = updates.isFolder
      if (updates.parentId !== undefined) payload.parent_client_id = updates.parentId ?? null

      const { data, error } = await supabase
        .from('notes')
        .update(payload)
        .eq('user_id', user.id)
        .eq('client_id', id)
        .select()
        .single()

      if (error || !data) {
        return { success: false, error: error?.message ?? 'Failed to update note' }
      }

      return { success: true, data: mapNoteRow(data as NoteRow) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  static async deleteNote(id: number): Promise<DatabaseResult<void>> {
    try {
      const user = await requireUser()

      const { data: existing, error: fetchError } = await supabase
        .from('notes')
        .select('*')
        .eq('user_id', user.id)
        .eq('client_id', id)
        .single()

      if (fetchError || !existing) {
        return { success: false, error: fetchError?.message ?? 'Note not found' }
      }

      if ((existing as NoteRow).is_folder) {
        const { data: children, error: childrenError } = await supabase
          .from('notes')
          .select('client_id')
          .eq('user_id', user.id)
          .eq('parent_client_id', id)
          .eq('_deleted', false) // Use boolean field instead of deleted_at

        if (childrenError) {
          return { success: false, error: childrenError.message }
        }

        await Promise.all(
          (children ?? [])
            .map(child => (child as NoteRow).client_id)
            .filter((childId): childId is number => typeof childId === 'number')
            .map(childId => this.deleteNote(childId))
        )
      }

      // soft delete note
      const timestamp = new Date().toISOString()
      const { error } = await supabase
        .from('notes')
        .update({ 
          _deleted: true,
          deleted_at: timestamp 
        })
        .eq('user_id', user.id)
        .eq('client_id', id)

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  static async buildFileTree(): Promise<DatabaseResult<FileNode[]>> {
    try {
      const notesResult = await this.getAllNotes()
      if (!notesResult.success || !notesResult.data) {
        return { success: false, error: notesResult.error ?? 'Failed to fetch notes' }
      }

      return { success: true, data: buildFileTreeFromNotes(notesResult.data) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }
}

export default {
  TodoService,
  NoteService,
}

export function buildFileTreeFromNotes(notes: Note[]): FileNode[] {
  const sortedNotes = [...notes]
  sortedNotes.sort((a, b) => {
    if (a.isFolder && a.title === 'temp') return -1
    if (b.isFolder && b.title === 'temp') return 1
    if (a.isFolder && !b.isFolder) return -1
    if (!a.isFolder && b.isFolder) return 1
    return a.createdAt.getTime() - b.createdAt.getTime()
  })

  const nodeMap = new Map<number, FileNode>()
  const rootNodes: FileNode[] = []

  sortedNotes.forEach(note => {
    if (!note.clientId) {
      return
    }

    const node: FileNode = {
      id: note.clientId.toString(),
      name: note.isFolder && note.title === 'temp' ? note.title : note.title.replace(/\.lexical$/, ''),
      type: note.isFolder ? 'folder' : 'file',
      noteId: note.clientId,
      children: note.isFolder ? [] : undefined,
      expanded: note.title === 'temp',
    }

    nodeMap.set(note.clientId, node)
  })

  sortedNotes.forEach(note => {
    if (!note.clientId) {
      return
    }

    const node = nodeMap.get(note.clientId)
    if (!node) {
      return
    }

    if (note.parentClientId && nodeMap.has(note.parentClientId)) {
      const parentNode = nodeMap.get(note.parentClientId)!
      if (!parentNode.children) {
        parentNode.children = []
      }
      parentNode.children.push(node)
    } else {
      rootNodes.push(node)
    }
  })

  return rootNodes
}
