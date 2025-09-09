// BRUTAL NOTES - Auto Save Plugin

import { useState, useEffect, useCallback, useRef } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { RotateCw, RotateCwSquare } from "lucide-react"
import { NoteService } from "@/lib/database-service"
import nickGenerator from "nick-generator"

interface AutoSavePluginProps {
  onFileSaved?: () => void
  currentAutoSavedFileId?: number | null
  onAutoSavedFileChange?: (fileId: number | null) => void
}

export function AutoSavePlugin({ onFileSaved, currentAutoSavedFileId, onAutoSavedFileChange }: AutoSavePluginProps) {
  const [editor] = useLexicalComposerContext()
  const [isAutoSaveEnabled, setIsAutoSaveEnabled] = useState(false) // Default disabled until user types
  const [userHasTyped, setUserHasTyped] = useState(false) // Track if user has started typing
  const [isAutoSaving, setIsAutoSaving] = useState(false)
  const [lastSaveTime, setLastSaveTime] = useState<Date | null>(null)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const currentFileIdRef = useRef<number | null>(currentAutoSavedFileId || null)

  // Update the ref when the prop changes
  useEffect(() => {
    currentFileIdRef.current = currentAutoSavedFileId || null
  }, [currentAutoSavedFileId])

  const createNickFileName = async (): Promise<string> => {
    try {
      // Generate a nickname (e.g., "Impressive Grasshopper")
      const baseName = nickGenerator()
      
      // Add a short random number (1-99) to avoid conflicts
      const randomSuffix = Math.floor(Math.random() * 99) + 1
      const fileName = `${baseName}-${randomSuffix}.lexical`
      
      // Check if this name already exists
      const allNotes = await NoteService.getAllNotes()
      if (allNotes.success && allNotes.data) {
        const existingFile = allNotes.data.find(note => 
          !note.isFolder && note.title === fileName
        )
        
        // If name exists, try again with a different suffix
        if (existingFile) {
          const newSuffix = Math.floor(Math.random() * 999) + 100
          return `${baseName}-${newSuffix}.lexical`
        }
      }
      
      return fileName
    } catch (error) {
      console.error('Error generating nick filename:', error)
      // Fallback to simple naming
      const randomId = Math.floor(Math.random() * 999) + 1
      return `note-${randomId}.lexical`
    }
  }

  const autoSave = useCallback(async () => {
    if (!isAutoSaveEnabled) return

    setIsAutoSaving(true)
    try {
      // Get current editor content
      const editorState = editor.getEditorState()
      const contentJson = JSON.stringify(editorState.toJSON())

      // Check if content is empty (just empty paragraph)
      const isEmpty = contentJson.includes('"children":[]') && 
                     contentJson.split('"type":"paragraph"').length <= 2

      if (isEmpty) {
        setIsAutoSaving(false)
        return
      }

      // Find temp folder (should always exist since database is initialized first)
      const allNotes = await NoteService.getAllNotes()
      let tempFolderId: number | undefined

      if (allNotes.success && allNotes.data) {
        const tempFolder = allNotes.data.find(note => 
          note.isFolder && note.title === 'temp'
        )
        tempFolderId = tempFolder?.id
      }

      // Temp folder should always exist after database initialization
      if (!tempFolderId) {
        console.error('❌ Temp folder not found - database initialization may have failed')
        setIsAutoSaving(false)
        return
      }

      let result

      // If we have a current auto-saved file, update it
      if (currentFileIdRef.current) {
        result = await NoteService.updateNote(currentFileIdRef.current, {
          content: contentJson,
          updatedAt: new Date()
        })
      } else {
        // Create new nick-named file
        const fileName = await createNickFileName()
        const notePath = `/temp/${fileName}`

        result = await NoteService.createNote(
          fileName,
          contentJson,
          notePath,
          false, // isFolder
          tempFolderId
        )

        // Track this as the current auto-saved file
        if (result.success && result.data) {
          currentFileIdRef.current = result.data.id
          onAutoSavedFileChange?.(result.data.id)
        }
      }

      if (result.success) {
        setLastSaveTime(new Date())
        onFileSaved?.() // Refresh file tree
        console.log('💾 Auto-saved successfully')
      } else {
        console.error('❌ Auto-save failed:', result.error)
      }
    } catch (error) {
      console.error('❌ Auto-save error:', error)
    } finally {
      setIsAutoSaving(false)
    }
  }, [editor, isAutoSaveEnabled, onFileSaved, onAutoSavedFileChange])

  // Detect when user starts typing and enable auto-save
  useEffect(() => {
    const editorState = editor.getEditorState()
    const contentJson = JSON.stringify(editorState.toJSON())
    
    // Check if editor has meaningful content (not just empty paragraph)
    const hasContent = !contentJson.includes('"children":[]') || 
                      contentJson.split('"type":"paragraph"').length > 2 ||
                      contentJson.includes('"text":') // Any text content
    
    if (hasContent && !userHasTyped) {
      // User has started typing for the first time
      setUserHasTyped(true)
      setIsAutoSaveEnabled(true)
      console.log('🔥 User started typing - Auto-save enabled!')
    }
    
    // Only run auto-save if enabled and user has typed
    if (!isAutoSaveEnabled || !userHasTyped) return

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    // Set minimal timeout for auto-save (100ms after last change to batch rapid typing)
    saveTimeoutRef.current = setTimeout(() => {
      autoSave()
    }, 100)

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [editor.getEditorState(), autoSave, userHasTyped, isAutoSaveEnabled])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [])

  const toggleAutoSave = () => {
    if (!userHasTyped) {
      // If user hasn't typed yet, just toggle the preference
      setIsAutoSaveEnabled(!isAutoSaveEnabled)
    } else {
      // If user has typed, allow manual toggle
      setIsAutoSaveEnabled(!isAutoSaveEnabled)
      if (isAutoSaveEnabled) {
        // If disabling, clear any pending auto-save
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current)
        }
      }
    }
  }

  const formatLastSaveTime = () => {
    if (!lastSaveTime) return "Never"
    const now = new Date()
    const diff = now.getTime() - lastSaveTime.getTime()
    
    if (diff < 60000) return "Just now"
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return lastSaveTime.toLocaleDateString()
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="sm"
          onClick={toggleAutoSave}
          className={`border-2 border-black shadow-[2px_2px_0px_0px_#000] font-black gap-2 ${
            isAutoSaveEnabled 
              ? 'bg-blue-400 hover:bg-blue-500 text-black' 
              : 'bg-gray-300 hover:bg-gray-400 text-black'
          }`}
          disabled={isAutoSaving}
        >
          {isAutoSaving ? (
            <RotateCw className="h-4 w-4 animate-spin" />
          ) : (
            <RotateCwSquare className="h-4 w-4" />
          )}
          Auto Save {isAutoSaveEnabled ? 'ON' : 'OFF'}
        </Button>
      </TooltipTrigger>
      <TooltipContent className="border-2 border-black shadow-[4px_4px_0px_0px_#000] bg-white text-black font-mono">
        <div className="text-center">
          <div className="font-black">AUTO-SAVE {isAutoSaveEnabled ? 'ENABLED' : 'DISABLED'}</div>
          <div className="text-xs mt-1">
            {!userHasTyped ? (
              'Will auto-enable when you start typing'
            ) : isAutoSaveEnabled ? (
              <>
                Saves instantly on every edit to temp folder
                <br />
                Last saved: {formatLastSaveTime()}
              </>
            ) : (
              'Click to enable automatic saving'
            )}
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

