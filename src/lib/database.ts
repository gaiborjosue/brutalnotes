// BRUTAL NOTES - IndexedDB Database using Dexie

import Dexie, { type EntityTable } from 'dexie'
import type { Todo, Note } from './types'

// Define the database schema
export class BrutalNotesDB extends Dexie {
  // Define table types
  todos!: EntityTable<Todo, 'id'>
  notes!: EntityTable<Note, 'id'>

  constructor() {
    super('BrutalNotesDB')
    
    // Define schema
    this.version(1).stores({
      todos: '++id, text, completed, createdAt, updatedAt, syncStatus',
      notes: '++id, title, content, path, createdAt, updatedAt, syncStatus, isFolder, parentId'
    })

    // Add hooks for automatic timestamps
    this.todos.hook('creating', (primKey, obj, trans) => {
      obj.createdAt = new Date()
      obj.updatedAt = new Date()
      obj.syncStatus = 'pending'
    })

    this.todos.hook('updating', (modifications, primKey, obj, trans) => {
      modifications.updatedAt = new Date()
      modifications.syncStatus = 'pending'
    })

    this.notes.hook('creating', (primKey, obj, trans) => {
      obj.createdAt = new Date()
      obj.updatedAt = new Date()
      obj.syncStatus = 'pending'
    })

    this.notes.hook('updating', (modifications, primKey, obj, trans) => {
      modifications.updatedAt = new Date()
      modifications.syncStatus = 'pending'
    })
  }
}

// Create and export database instance
export const db = new BrutalNotesDB()

// Initialize database (create default folders if needed)
export async function initializeDatabase() {
  try {
    // Check if we have any notes, if not create default structure
    const noteCount = await db.notes.count()
    
    if (noteCount === 0) {
      // Create temp folder first (will be positioned at top)
      const tempFolder = await db.notes.add({
        title: 'temp',
        content: '',
        path: '/temp',
        isFolder: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        syncStatus: 'pending'
      })

      // Create default "Brutal Notes" folder 
      await db.notes.add({
        title: 'Brutal Notes',
        content: '',
        path: '/',
        isFolder: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        syncStatus: 'pending'
      })

      // Create a welcome note in temp folder
      const welcomeContent = JSON.stringify({
        root: {
          children: [
            {
              children: [
                {
                  detail: 0,
                  format: 1, // bold
                  mode: "normal",
                  style: "",
                  text: "Welcome to BRUTAL NOTES! 🔥",
                  type: "text",
                  version: 1,
                },
              ],
              direction: "ltr",
              format: "",
              indent: 0,
              type: "heading",
              version: 1,
              tag: "h1"
            },
            {
              children: [
                {
                  detail: 0,
                  format: 0,
                  mode: "normal",
                  style: "",
                  text: "This is your first note! Click 'Save File' to create more brutal .lexical notes in the temp folder.",
                  type: "text",
                  version: 1,
                },
              ],
              direction: "ltr",
              format: "",
              indent: 0,
              type: "paragraph",
              version: 1,
            },
          ],
          direction: "ltr",
          format: "",
          indent: 0,
          type: "root",
          version: 1,
        },
      })

      await db.notes.add({
        title: 'welcome.lexical',
        content: welcomeContent,
        path: '/temp/welcome.lexical',
        isFolder: false,
        parentId: tempFolder, // Points to the temp folder
        createdAt: new Date(),
        updatedAt: new Date(),
        syncStatus: 'pending'
      })
    }

    console.log('🔥 BRUTAL NOTES Database initialized successfully!')
    return { success: true }
  } catch (error) {
    console.error('❌ Failed to initialize database:', error)
    return { success: false, error: String(error) }
  }
}

// Export for easy access in components
export default db
