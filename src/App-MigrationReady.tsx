import React from 'react'
import { MigrationTest } from './components/MigrationTest'
import { OfflineFirstApp } from './services/offlineFirstApp'

// Import your existing App component
import { YourOriginalApp } from './YourOriginalApp' // Replace with actual import

/**
 * Migration-ready App component
 * This wraps your existing app with offline-first capabilities
 */
function App() {
  return (
    <MigrationTest>
      {/* Your existing app runs inside the migration wrapper */}
      <YourOriginalApp />
    </MigrationTest>
  )
}

export default App

/**
 * Alternative integration pattern (without UI wrapper):
 * If you prefer to integrate without the visual migration wrapper,
 * initialize the offline-first system in your main app:
 */

/*
import { useEffect } from 'react'

function AlternativeApp() {
  useEffect(() => {
    // Initialize offline-first architecture on app startup
    OfflineFirstApp.initialize()
      .then(() => {
        console.log('✅ Offline-first system initialized')
        return OfflineFirstApp.performInitialMigration()
      })
      .then((result) => {
        if (result.success) {
          console.log(`✅ Migration complete: ${result.totalNotes} notes, ${result.totalTodos} todos`)
        } else {
          console.error('❌ Migration failed:', result.error)
        }
      })
      .catch((error) => {
        console.error('❌ Offline-first initialization failed:', error)
      })

    return () => {
      OfflineFirstApp.cleanup()
    }
  }, [])

  return <YourOriginalApp />
}
*/
