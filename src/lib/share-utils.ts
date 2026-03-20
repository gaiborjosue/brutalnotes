// Utilities for encoding/decoding shareable note content
import {
  showProcessingToast as showProcessingNotification,
  showSuccessToast,
  showWarningToast,
} from "@/lib/notifications"

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
  showSuccessToast("URL copied to share")
}

export const showEmptyNoteToast = () => {
  showWarningToast("Note is empty", "Nothing to share.")
}

// Generic processing toast that returns a disposer to remove it
export const showProcessingToast = (message: string): (() => void) => {
  return showProcessingNotification(message)
}
