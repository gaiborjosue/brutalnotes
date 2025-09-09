// Plugin to track and manage unsaved changes
import { useState, useEffect, useRef, useCallback } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"

interface UnsavedChangesPluginProps {
  currentFileId: number | null
  isAutoSaveEnabled: boolean
  lastSaveTime: Date | null
  onUnsavedChangesChange?: (hasUnsavedChanges: boolean, saveFunction: () => Promise<void>) => void
  onManualSave?: () => Promise<void>
}

export function UnsavedChangesPlugin({
  currentFileId,
  isAutoSaveEnabled,
  lastSaveTime,
  onUnsavedChangesChange,
  onManualSave
}: UnsavedChangesPluginProps) {
  const [editor] = useLexicalComposerContext()
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [lastSavedContent, setLastSavedContent] = useState<string | null>(null)
  const [editorState, setEditorState] = useState(() => editor.getEditorState())
  const initialLoadRef = useRef(true)
  const fileIdRef = useRef(currentFileId)
  const previousHasUnsavedChangesRef = useRef(false)

  // Listen for editor state changes
  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      setEditorState(editorState)
    })
  }, [editor])

  // Track when file changes (loading a different file)
  useEffect(() => {
    if (fileIdRef.current !== currentFileId) {
      // File has changed, reset unsaved changes tracking
      setHasUnsavedChanges(false)
      initialLoadRef.current = true
      fileIdRef.current = currentFileId
      
      // Save current content as the "saved" baseline
      const currentContent = JSON.stringify(editorState.toJSON())
      setLastSavedContent(currentContent)
    }
  }, [currentFileId, editorState])

  // Track content changes
  useEffect(() => {
    const currentContent = JSON.stringify(editorState.toJSON())
    
    // Don't mark as unsaved on initial load
    if (initialLoadRef.current) {
      setLastSavedContent(currentContent)
      setHasUnsavedChanges(false)
      initialLoadRef.current = false
      return
    }

    // If auto-save is enabled and there's a recent save, content is considered saved
    if (isAutoSaveEnabled && lastSaveTime) {
      const timeSinceLastSave = Date.now() - lastSaveTime.getTime()
      if (timeSinceLastSave < 2000) { // Within 2 seconds of auto-save
        setLastSavedContent(currentContent)
        setHasUnsavedChanges(false)
        return
      }
    }

    // Check if content has changed since last save
    const contentChanged = currentContent !== lastSavedContent
    setHasUnsavedChanges(contentChanged)
  }, [editorState, isAutoSaveEnabled, lastSaveTime, lastSavedContent])

  // Memoize the save function to prevent unnecessary re-renders
  const saveFunction = useCallback(async () => {
    if (onManualSave) {
      await onManualSave()
      // Mark as saved after manual save - get fresh editor state
      const currentContent = JSON.stringify(editor.getEditorState().toJSON())
      setLastSavedContent(currentContent)
      setHasUnsavedChanges(false)
    }
  }, [onManualSave, editor])

  // Notify parent component when unsaved changes status changes
  useEffect(() => {
    if (onUnsavedChangesChange && hasUnsavedChanges !== previousHasUnsavedChangesRef.current) {
      previousHasUnsavedChangesRef.current = hasUnsavedChanges
      onUnsavedChangesChange(hasUnsavedChanges, saveFunction)
    }
  }, [hasUnsavedChanges, onUnsavedChangesChange])

  // Reset unsaved changes when auto-save completes
  useEffect(() => {
    if (isAutoSaveEnabled && lastSaveTime) {
      const currentContent = JSON.stringify(editorState.toJSON())
      setLastSavedContent(currentContent)
      setHasUnsavedChanges(false)
    }
  }, [lastSaveTime, isAutoSaveEnabled, editorState])

  // This plugin doesn't render anything, it just manages state
  return null
}
