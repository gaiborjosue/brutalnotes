import { MainLayout } from './components/layout/MainLayout'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { AuthContainer } from './components/auth/AuthContainer'
import { AuthLoader } from './components/auth/AuthLoader'
import { MobileScanPage } from './features/scan-notes/MobileScanPage'

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
  return <MainLayout />
}

// Main App with Auth Provider
function App() {
  const isMobileScanRoute = typeof window !== 'undefined' && window.location.pathname.startsWith('/scan')

  if (isMobileScanRoute) {
    return <MobileScanPage />
  }

  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

export default App
