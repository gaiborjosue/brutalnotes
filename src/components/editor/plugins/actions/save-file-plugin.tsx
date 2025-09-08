// BRUTAL NOTES - Save File Action Plugin

import { useState, useEffect } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { $getRoot } from "lexical"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Save, FileText } from "lucide-react"
import { NoteService } from "@/lib/database-service"

interface SaveFilePluginProps {
  onFileSaved?: () => void
  currentAutoSavedFileId?: number | null
  onAutoSavedFileChange?: (fileId: number | null) => void
}

export function SaveFilePlugin({ onFileSaved, currentAutoSavedFileId, onAutoSavedFileChange }: SaveFilePluginProps) {
  const [editor] = useLexicalComposerContext()
  const [isOpen, setIsOpen] = useState(false)
  const [fileName, setFileName] = useState("")
  const [saving, setSaving] = useState(false)

  // Load current auto-saved file name when dialog opens
  useEffect(() => {
    if (isOpen && currentAutoSavedFileId) {
      const loadFileName = async () => {
        try {
          const allNotes = await NoteService.getAllNotes()
          if (allNotes.success && allNotes.data) {
            const currentFile = allNotes.data.find(note => note.id === currentAutoSavedFileId)
            if (currentFile) {
              // Remove .lexical extension for editing
              const nameWithoutExt = currentFile.title.replace('.lexical', '')
              setFileName(nameWithoutExt)
            }
          }
        } catch (error) {
          console.error('Error loading current file name:', error)
        }
      }
      loadFileName()
    } else if (isOpen) {
      setFileName("") // Clear if no auto-saved file
    }
  }, [isOpen, currentAutoSavedFileId])

  const handleSave = async () => {
    if (!fileName.trim()) return

    setSaving(true)
    try {
      // Get current editor content
      const editorState = editor.getEditorState()
      const contentJson = JSON.stringify(editorState.toJSON())

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
        setSaving(false)
        return
      }

      // Save the note to temp folder
      const noteTitle = fileName.trim().endsWith('.lexical') ? fileName.trim() : `${fileName.trim()}.lexical`
      const notePath = `/temp/${noteTitle}`

      let result

      // If we have a current auto-saved file, update it with the new name
      if (currentAutoSavedFileId) {
        result = await NoteService.updateNote(currentAutoSavedFileId, {
          title: noteTitle,
          content: contentJson,
          path: notePath,
          updatedAt: new Date()
        })
      } else {
        // Create new file
        result = await NoteService.createNote(
          noteTitle,
          contentJson,
          notePath,
          false, // isFolder
          tempFolderId
        )
      }

      if (result.success) {
        console.log('🔥 File saved successfully:', noteTitle)
        setIsOpen(false)
        setFileName("")
        onFileSaved?.() // Refresh file tree
        
        // Clear current auto-saved file tracking since we've manually saved
        onAutoSavedFileChange?.(null)
        
        // Clear the editor for new content
        editor.update(() => {
          const root = $getRoot()
          root.clear()
        })
      } else {
        console.error('❌ Failed to save file:', result.error)
        alert('Failed to save file. Please try again.')
      }
    } catch (error) {
      console.error('❌ Error saving file:', error)
      alert('Error saving file. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !saving) {
      handleSave()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          className="border-2 border-black shadow-[2px_2px_0px_0px_#000] bg-green-400 hover:bg-green-500 text-black font-black gap-2"
        >
          <Save className="h-4 w-4" />
          Save File
        </Button>
      </DialogTrigger>
      <DialogContent className="border-4 border-black shadow-[8px_8px_0px_0px_#000] bg-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-black text-black flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {currentAutoSavedFileId ? 'RENAME & SAVE FILE' : 'SAVE TO TEMP FOLDER'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          <div>
            <label className="text-sm font-black text-black mb-2 block">
              FILE NAME:
            </label>
            <Input
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={currentAutoSavedFileId ? "Enter new name" : "brutal-note"}
              className="border-2 border-black shadow-[2px_2px_0px_0px_#000] bg-white text-black font-mono"
              autoFocus
            />
            <p className="text-xs text-gray-600 mt-1 font-mono">
              .lexical extension will be added automatically
            </p>
          </div>
          <div className="flex gap-2 pt-2">
            <Button
              onClick={() => setIsOpen(false)}
              variant="neutral"
              className="flex-1 border-2 border-black shadow-[2px_2px_0px_0px_#000] bg-gray-200 hover:bg-gray-300 text-black font-black"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!fileName.trim() || saving}
              className="flex-1 border-2 border-black shadow-[2px_2px_0px_0px_#000] bg-green-400 hover:bg-green-500 text-black font-black"
            >
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
