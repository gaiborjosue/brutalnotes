import { useEffect, useState, useRef } from 'react'
import { MainLayout } from './components/layout/MainLayout'
import { initializeDatabase } from './lib/database'

function App() {
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

export default App
