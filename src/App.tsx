import { useEffect, useState, useRef } from 'react'
import { MainLayout } from './components/layout/MainLayout'
import { initializeDatabase } from './lib/database'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { AuthContainer } from './components/auth/AuthContainer'
import { AuthLoader } from './components/auth/AuthLoader'
import SyncService from './lib/sync-service'

// Protected App Component (only renders when authenticated)
function ProtectedApp() {
  const [isDbInitialized, setIsDbInitialized] = useState(false)
  const initializationStarted = useRef(false)

  useEffect(() => {
    // Prevent double initialization in React StrictMode
    if (initializationStarted.current) {
      return
    }
    initializationStarted.current = true

    // Initialize IndexedDB database on app start
    const init = async () => {
      console.log('🔥 Starting database initialization...')
      const result = await initializeDatabase()
      if (result.success) {
        console.log('✅ Database initialized successfully')
        
        // Setup automatic sync after database is ready
        console.log('🔄 Setting up automatic sync...')
        SyncService.setupAutoSync()
        
        setIsDbInitialized(true)
      } else {
        console.error('❌ Failed to initialize database:', result.error)
        setIsDbInitialized(true) // Show UI anyway to allow manual troubleshooting
      }
    }
    
    init()
  }, [])

  // Don't render the main layout until database is initialized
  if (!isDbInitialized) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="text-center font-mono">
          <div className="text-4xl font-black mb-4">🔥 BRUTAL NOTES</div>
          <div className="text-lg">Initializing database...</div>
        </div>
      </div>
    )
  }

  return <MainLayout />
}

// Auth-aware App Component
function AppContent() {
  const { user, loading } = useAuth()

  // Show loading screen while checking auth state
  if (loading) {
    return <AuthLoader />
  }

  // Show auth form if not authenticated
  if (!user) {
    return <AuthContainer />
  }

  // User is authenticated, show the main app
  return <ProtectedApp />
}

// Main App with Auth Provider
function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

export default App
