// BRUTAL NOTES - Save Keyboard Shortcut Plugin (Ctrl+Alt+S)

import { useEffect, useCallback } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { useNotes } from "@/hooks"

interface SaveShortcutPluginProps {
  onFileSaved?: () => void
  currentDraftFileId?: number | null
  onCurrentFileChange?: (fileId: number | null) => void
}

export function SaveShortcutPlugin({ onFileSaved, currentDraftFileId, onCurrentFileChange }: SaveShortcutPluginProps) {
  const [editor] = useLexicalComposerContext()
  const { notes, getNoteById, createNote, updateNote } = useNotes()

  const performSilentSave = useCallback(async () => {
    try {
      // Get current editor content
      const editorState = editor.getEditorState()
      const contentJson = JSON.stringify(editorState.toJSON())

      // Find temp folder
      const tempFolder = notes.find(note => 
        note.isFolder && note.title === 'temp'
      )
      const tempFolderId = tempFolder?.id

      if (!tempFolderId) {
        console.error('❌ Temp folder not found - cannot auto-save')
        return
      }

      let result
      let savedNoteId: number | null = currentDraftFileId ?? null

      if (currentDraftFileId) {
        // Update existing file
        const currentFile = await getNoteById(currentDraftFileId)
        if (currentFile) {
          const success = await updateNote(currentDraftFileId, {
            title: currentFile.title, // Keep existing title
            content: contentJson,
            path: currentFile.path, // Keep existing path
            updatedAt: new Date()
          })
          result = { success }
          console.log('💾 Auto-saved existing file:', currentFile.title)
        } else {
          console.error('❌ Current file not found for auto-save')
          return
        }
      } else {
        // Create new auto-save file with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        const autoSaveName = `auto-save-${timestamp}.lexical`
        const notePath = `/temp/${autoSaveName}`

        const newNote = await createNote(
          autoSaveName,
          contentJson,
          notePath,
          false, // isFolder
          tempFolderId
        )
        
        if (newNote?.id) {
          savedNoteId = newNote.id
          result = { success: true, data: newNote }
          console.log('💾 Auto-saved new file:', autoSaveName)
        } else {
          result = { success: false }
        }
      }

      if (result.success) {
        onFileSaved?.() // Refresh file tree

        if (savedNoteId !== null && savedNoteId !== currentDraftFileId) {
          onCurrentFileChange?.(savedNoteId)
        }

        // Dispatch save event
        window.dispatchEvent(
          new CustomEvent('noteSaved', {
            detail: {
              fileId: savedNoteId,
              content: contentJson,
              autoSave: true
            }
          })
        )

        // Show a subtle success indicator
        showSaveIndicator()
      } else {
        console.error('❌ Auto-save failed')
        showSaveError()
      }
    } catch (error) {
      console.error('❌ Auto-save error:', error)
      showSaveError()
    }
  }, [editor, notes, getNoteById, createNote, updateNote, currentDraftFileId, onFileSaved, onCurrentFileChange])

  const showSaveIndicator = () => {
    // Create a subtle toast notification
    const toast = document.createElement('div')
    toast.textContent = '💾 Saved'
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: rgba(34, 197, 94, 0.95);
      color: white;
      padding: 6px 12px;
      border-radius: 6px;
      border: 1px solid rgba(0, 0, 0, 0.2);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      font-weight: 600;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      z-index: 10000;
      backdrop-filter: blur(8px);
      animation: toastSlideIn 2.5s cubic-bezier(0.16, 1, 0.3, 1);
      pointer-events: none;
    `

    // Add toast animation keyframes if not already added
    if (!document.getElementById('toast-styles')) {
      const style = document.createElement('style')
      style.id = 'toast-styles'
      style.textContent = `
        @keyframes toastSlideIn {
          0% { 
            transform: translateX(100%) translateY(100%); 
            opacity: 0; 
            scale: 0.8;
          }
          10% { 
            transform: translateX(0) translateY(0); 
            opacity: 1; 
            scale: 1;
          }
          85% { 
            transform: translateX(0) translateY(0); 
            opacity: 1; 
            scale: 1;
          }
          100% { 
            transform: translateX(100%) translateY(100%); 
            opacity: 0; 
            scale: 0.8;
          }
        }
      `
      document.head.appendChild(style)
    }

    document.body.appendChild(toast)
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast)
      }
    }, 2500)
  }

  const showSaveError = () => {
    const toast = document.createElement('div')
    toast.textContent = '❌ Save failed'
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: rgba(239, 68, 68, 0.95);
      color: white;
      padding: 6px 12px;
      border-radius: 6px;
      border: 1px solid rgba(0, 0, 0, 0.2);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      font-weight: 600;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      z-index: 10000;
      backdrop-filter: blur(8px);
      animation: toastSlideIn 3.5s cubic-bezier(0.16, 1, 0.3, 1);
      pointer-events: none;
    `

    document.body.appendChild(toast)
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast)
      }
    }, 3500)
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check for Ctrl+Alt+S (or Cmd+Alt+S on Mac)
      if ((event.ctrlKey || event.metaKey) && event.altKey && event.key === 's') {
        event.preventDefault() // Prevent any default behavior
        performSilentSave()
      }
    }

    // Add the event listener to the document
    document.addEventListener('keydown', handleKeyDown)

    // Cleanup function to remove the event listener
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [performSilentSave]) // Re-attach when performSilentSave changes

  // This plugin doesn't render anything
  return null
}
