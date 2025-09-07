import { useEffect } from 'react'
import { MainLayout } from './components/layout/MainLayout'
import { initializeDatabase } from './lib/database'

function App() {
  useEffect(() => {
    // Initialize IndexedDB database on app start
    const init = async () => {
      const result = await initializeDatabase()
      if (!result.success) {
        console.error('Failed to initialize database:', result.error)
      }
    }
    
    init()
  }, [])

  return <MainLayout />
}

export default App
