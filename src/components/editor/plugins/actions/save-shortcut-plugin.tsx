// BRUTAL NOTES - Save Keyboard Shortcut Plugin

import { useEffect, useCallback } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { useNotes } from "@/hooks"
import { showErrorToast, showSuccessToast } from "@/lib/notifications"

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
        showErrorToast("Save failed", "Temp folder is unavailable.")
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
        } else {
          console.error('❌ Current file not found for auto-save')
          showErrorToast("Save failed", "The current file could not be found.")
          return
        }
      } else {
        // Create new auto-save file with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        const autoSaveName = `auto-save-${timestamp}.lexical`
        const newNote = await createNote(
          autoSaveName,
          contentJson,
          undefined,
          false, // isFolder
          tempFolderId
        )
        
        if (newNote?.id) {
          savedNoteId = newNote.id
          result = { success: true, data: newNote }
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
    showSuccessToast("Saved")
  }

  const showSaveError = () => {
    showErrorToast("Save failed", "Please try again.")
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Support the standard save shortcut and keep the old alternate binding.
      const isSaveKey = event.key.toLowerCase() === 's'
      const isPrimaryModifierPressed = event.ctrlKey || event.metaKey
      const usesLegacyAlternateBinding = isPrimaryModifierPressed && event.altKey && isSaveKey
      const usesStandardBinding = isPrimaryModifierPressed && !event.shiftKey && isSaveKey

      if (usesStandardBinding || usesLegacyAlternateBinding) {
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
