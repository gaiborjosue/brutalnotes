// Utilities for encoding/decoding shareable note content

export const encodeContent = (content: string): string => {
  try {
    // Use base64 encoding with URL-safe characters
    return btoa(encodeURIComponent(content))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')
  } catch (error) {
    console.error('Failed to encode content:', error)
    return ''
  }
}

export const decodeContent = (encoded: string): string => {
  try {
    // Restore base64 padding and URL-safe characters
    const base64 = encoded
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(encoded.length + (4 - encoded.length % 4) % 4, '=')
    
    return decodeURIComponent(atob(base64))
  } catch (error) {
    console.error('Failed to decode content:', error)
    return ''
  }
}

// Toast notification utilities
export const showShareToast = () => {
  // Create a toast element
  const toast = document.createElement('div')
  toast.className = `
    fixed top-4 right-4 z-50 max-w-sm w-full
    bg-black/80 backdrop-blur-sm text-white
    px-4 py-3 rounded-lg shadow-lg
    border border-white/20
    font-mono text-sm font-bold
    animate-in slide-in-from-top-2 duration-300
  `
  toast.innerHTML = `
    <div class="flex items-center gap-2">
      <svg class="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
      </svg>
      <span>URL copied to share</span>
    </div>
  `
  
  document.body.appendChild(toast)
  
  // Remove after 3 seconds with fade out
  setTimeout(() => {
    toast.style.animation = 'fade-out 300ms ease-out forwards'
    setTimeout(() => {
      document.body.removeChild(toast)
    }, 300)
  }, 3000)
}

export const showEmptyNoteToast = () => {
  const toast = document.createElement('div')
  toast.className = `
    fixed top-4 right-4 z-50 max-w-sm w-full
    bg-yellow-500/80 backdrop-blur-sm text-black
    px-4 py-3 rounded-lg shadow-lg
    border border-yellow-300/20
    font-mono text-sm font-bold
    animate-in slide-in-from-top-2 duration-300
  `
  toast.innerHTML = `
    <div class="flex items-center gap-2">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.232 19.5c-.77.833.192 2.5 1.732 2.5z"></path>
      </svg>
      <span>Note is empty - nothing to share</span>
    </div>
  `
  
  document.body.appendChild(toast)
  
  setTimeout(() => {
    toast.style.animation = 'fade-out 300ms ease-out forwards'
    setTimeout(() => {
      document.body.removeChild(toast)
    }, 300)
  }, 3000)
}
