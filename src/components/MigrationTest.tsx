import React, { useEffect, useState } from 'react'
import { OfflineFirstApp } from '../services/offlineFirstApp'
import { useOnlineStatus, useSyncStatus, useNotes, useTodos } from '../hooks'

interface MigrationTestProps {
  children: React.ReactNode
}

/**
 * Migration test wrapper that demonstrates the offline-first architecture
 * This shows how the new system works before full UI integration
 */
export const MigrationTest: React.FC<MigrationTestProps> = ({ children }) => {
  const [isInitialized, setIsInitialized] = useState(false)
  const [initError, setInitError] = useState<string | null>(null)
  const [migrationStats, setMigrationStats] = useState<{
    totalTodos: number
    totalNotes: number
  } | null>(null)

  const isOnline = useOnlineStatus()
  const syncStatus = useSyncStatus()
  const { notes, isInitialLoading: notesLoading, error: notesError } = useNotes()
  const { todos, isInitialLoading: todosLoading, error: todosError } = useTodos()

  useEffect(() => {
    const initializeApp = async () => {
      try {
        console.log('MigrationTest: Starting initialization...')
        
        // Initialize offline-first app
        await OfflineFirstApp.initialize()
        
        // Perform initial migration
        const migrationResult = await OfflineFirstApp.performInitialMigration()
        
        if (migrationResult.success) {
          setMigrationStats({
            totalTodos: migrationResult.totalTodos,
            totalNotes: migrationResult.totalNotes
          })
          console.log('MigrationTest: Migration successful:', migrationResult)
        } else {
          setInitError(migrationResult.error || 'Migration failed')
          console.error('MigrationTest: Migration failed:', migrationResult.error)
        }
        
        setIsInitialized(true)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        setInitError(errorMessage)
        console.error('MigrationTest: Initialization error:', error)
      }
    }

    initializeApp()

    // Cleanup on unmount
    return () => {
      OfflineFirstApp.cleanup()
    }
  }, [])

  const handleForceSync = async () => {
    try {
      console.log('MigrationTest: Forcing sync...')
      await OfflineFirstApp.forceSync()
      console.log('MigrationTest: Force sync completed')
    } catch (error) {
      console.error('MigrationTest: Force sync failed:', error)
    }
  }

  if (!isInitialized) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <h2>🔄 Initializing Offline-First Architecture...</h2>
        {initError && (
          <div style={{ color: 'red', marginTop: '10px' }}>
            <strong>Error:</strong> {initError}
          </div>
        )}
        <p>Setting up IndexedDB, performing data migration...</p>
      </div>
    )
  }

  return (
    <div>
      {/* Migration Status Bar */}
      <div style={{
        background: isOnline ? '#e8f5e8' : '#fff3cd',
        border: `1px solid ${isOnline ? '#d4edda' : '#ffeaa7'}`,
        borderRadius: '4px',
        padding: '10px',
        marginBottom: '20px',
        fontSize: '14px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <strong>🚀 Offline-First Migration Active</strong>
            <div style={{ marginTop: '5px' }}>
              📡 Status: {isOnline ? '🟢 Online' : '🔴 Offline'} | 
              🔄 Sync: {syncStatus.isInProgress ? 'Active' : 'Idle'} |
              📊 Data: {migrationStats ? `${migrationStats.totalNotes} notes, ${migrationStats.totalTodos} todos` : 'Loading...'}
            </div>
            {syncStatus.lastSyncTime && (
              <div style={{ fontSize: '12px', color: '#666' }}>
                Last sync: {syncStatus.lastSyncTime.toLocaleString()}
              </div>
            )}
          </div>
          <button 
            onClick={handleForceSync}
            disabled={syncStatus.isInProgress}
            style={{
              background: '#007acc',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              padding: '8px 16px',
              cursor: syncStatus.isInProgress ? 'not-allowed' : 'pointer',
              opacity: syncStatus.isInProgress ? 0.6 : 1
            }}
          >
            {syncStatus.isInProgress ? 'Syncing...' : 'Force Sync'}
          </button>
        </div>
      </div>

      {/* Data Status */}
      <div style={{ 
        background: '#f8f9fa', 
        padding: '15px', 
        borderRadius: '4px', 
        marginBottom: '20px',
        fontSize: '13px'
      }}>
        <h4 style={{ margin: '0 0 10px 0' }}>📋 Offline-First Data Status</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <strong>Notes:</strong> {notesLoading ? 'Loading...' : `${notes.length} loaded`}
            {notesError && <div style={{ color: 'red' }}>Error: {notesError}</div>}
          </div>
          <div>
            <strong>Todos:</strong> {todosLoading ? 'Loading...' : `${todos.length} loaded`}
            {todosError && <div style={{ color: 'red' }}>Error: {todosError}</div>}
          </div>
        </div>
        <div style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>
          💡 All data operations now work offline-first with automatic sync when online
        </div>
      </div>

      {/* Original App Content */}
      {children}
    </div>
  )
}

export default MigrationTest
