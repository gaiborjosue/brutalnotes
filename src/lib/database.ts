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
    
    // Define schema - Version 1 (original)
    this.version(1).stores({
      todos: '++id, serverId, text, completed, deleted, createdAt, updatedAt, syncStatus',
      notes: '++id, title, content, path, createdAt, updatedAt, syncStatus, isFolder, parentId'
    })
    
    // Version 2 - Add serverId index to notes for sync functionality
    this.version(2).stores({
      todos: '++id, serverId, text, completed, deleted, createdAt, updatedAt, syncStatus',
      notes: '++id, serverId, title, content, path, createdAt, updatedAt, syncStatus, isFolder, parentId'
    })

    // Version 3 - Track parent identifiers for cross-device hierarchy sync
    this.version(3).stores({
      todos: '++id, serverId, text, completed, deleted, createdAt, updatedAt, syncStatus',
      notes: '++id, serverId, title, content, path, createdAt, updatedAt, syncStatus, isFolder, parentId, parentClientId, serverParentId'
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

// Global flag to prevent multiple initializations
let isInitializing = false
let isInitialized = false

// Initialize database (create default folders if needed)
export async function initializeDatabase() {
  // Prevent multiple simultaneous initializations
  if (isInitializing || isInitialized) {
    console.log('📋 Database initialization already completed or in progress')
    return { success: true }
  }
  
  isInitializing = true
  
  try {
    // Ensure database is open
    await db.open()
    
    // Check if we have any notes, if not create default structure
    const noteCount = await db.notes.count()
    console.log(`📊 Found ${noteCount} existing notes in database`)
    
    if (noteCount === 0) {
      console.log('🔥 Creating default folder structure...')
      // Create temp folder first (will be positioned at top)
      const tempFolder = await db.notes.add({
        title: 'temp',
        content: '',
        path: 'temp',
        isFolder: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        syncStatus: 'pending'
      })
      console.log('✅ Created temp folder with ID:', tempFolder)

      // Create default "Brutal Notes" folder 
      const brutalFolder = await db.notes.add({
        title: 'Brutal Notes',
        content: '',
        path: 'Brutal Notes',
        isFolder: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        syncStatus: 'pending'
      })
      console.log('✅ Created Brutal Notes folder with ID:', brutalFolder)

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

      const welcomeFile = await db.notes.add({
        title: 'welcome.lexical',
        content: welcomeContent,
        path: 'temp/welcome.lexical',
        isFolder: false,
        parentId: tempFolder, // Points to the temp folder
        parentClientId: tempFolder,
        createdAt: new Date(),
        updatedAt: new Date(),
        syncStatus: 'pending'
      })
      console.log('✅ Created welcome note with ID:', welcomeFile)
      
      // Verify what was created
      const finalCount = await db.notes.count()
      console.log(`📊 Database now has ${finalCount} items`)
    } else {
      console.log('📂 Database already has data, skipping initialization')
    }

    console.log('🔥 BRUTAL NOTES Database initialized successfully!')
    isInitialized = true
    return { success: true }
  } catch (error) {
    console.error('❌ Failed to initialize database:', error)
    return { success: false, error: String(error) }
  } finally {
    isInitializing = false
  }
}

// Helper function to clear database for testing (call from browser console)
export async function clearDatabase() {
  try {
    await db.notes.clear()
    await db.todos.clear()
    isInitialized = false
    console.log('🧹 Database cleared successfully!')
    console.log('🔄 Refresh the page to see default folders recreated')
    return { success: true }
  } catch (error) {
    console.error('❌ Failed to clear database:', error)
    return { success: false, error: String(error) }
  }
}

// Export for easy access in components
export default db

// Make clearDatabase available globally for testing
if (typeof window !== 'undefined') {
  (window as any).clearDatabase = clearDatabase
}
