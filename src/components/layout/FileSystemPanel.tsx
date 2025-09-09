import { useState, useEffect, forwardRef, useImperativeHandle } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { 
  Folder, 
  FolderOpen, 
  FileText, 
  Plus, 
  MoreVertical,
  Trash2,
  Edit3,
  FolderPlus,
  FilePlus,
  Trash
} from "lucide-react"
import Star27 from "@/components/stars/s27"
import { NoteService } from "@/lib/database-service"
import type { FileNode } from "@/lib/types"
import nickGenerator from "nick-generator"


export interface FileSystemPanelRef {
  refreshFileTree: () => Promise<void>
}

interface FileSystemPanelProps {
  onFileClick?: (noteId: number) => void
}

export const FileSystemPanel = forwardRef<FileSystemPanelRef, FileSystemPanelProps>(({ onFileClick }, ref) => {
  const [fileTree, setFileTree] = useState<FileNode[]>([])
  const [loading, setLoading] = useState(true)
  const [editingFile, setEditingFile] = useState<string | null>(null)
  const [editingName, setEditingName] = useState("")
  const [showCreateMenu, setShowCreateMenu] = useState(false)
  const [draggedItem, setDraggedItem] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  // Load file tree from database
  useEffect(() => {
    const loadFileTree = async () => {
      // First ensure temp folder exists
      await ensureTempFolder()
      
      // Then load the file tree
      const result = await NoteService.buildFileTree()
      if (result.success && result.data) {
        setFileTree(result.data)
      } else {
        console.error('Failed to load file tree:', result.error)
      }
      setLoading(false)
    }

    loadFileTree()
  }, [])

  // Ensure temp folder exists in database
  const ensureTempFolder = async () => {
    try {
      const allNotes = await NoteService.getAllNotes()
      if (allNotes.success && allNotes.data) {
        const tempFolder = allNotes.data.find(note => 
          note.isFolder && note.title === 'temp' && note.path === '/temp'
        )
        
        if (!tempFolder) {
          await NoteService.createNote('temp', '', '/temp', true)
        }
      }
    } catch (error) {
      console.error('Failed to ensure temp folder:', error)
    }
  }

  // Refresh file tree from database
  const refreshFileTree = async () => {
    const result = await NoteService.buildFileTree()
    if (result.success && result.data) {
      setFileTree(result.data)
    }
  }

  // Expose refreshFileTree to parent component
  useImperativeHandle(ref, () => ({
    refreshFileTree
  }))

  const toggleFolder = (id: string) => {
    const toggleNode = (nodes: FileNode[]): FileNode[] => {
      return nodes.map(node => {
        if (node.id === id && node.type === 'folder') {
          return { ...node, expanded: !node.expanded }
        }
        if (node.children) {
          return { ...node, children: toggleNode(node.children) }
        }
        return node
      })
    }
    setFileTree(toggleNode(fileTree))
  }

  const deleteFile = async (id: string) => {
    const noteId = parseInt(id)
    const result = await NoteService.deleteNote(noteId)
    if (result.success) {
      // Refresh the file tree
      await refreshFileTree()
    } else {
      console.error('Failed to delete file:', result.error)
    }
  }

  const clearNotesFromFolder = async (folderId: string) => {
    try {
      const folderNoteId = parseInt(folderId)
      
      // Get all notes
      const allNotesResult = await NoteService.getAllNotes()
      if (!allNotesResult.success || !allNotesResult.data) {
        console.error('Failed to get notes:', allNotesResult.error)
        return
      }

      // Find all notes that are children of this folder (not folders themselves)
      const notesToDelete = allNotesResult.data.filter(note => 
        note.parentId === folderNoteId && !note.isFolder
      )

      // Delete each note
      for (const note of notesToDelete) {
        const result = await NoteService.deleteNote(note.id)
        if (!result.success) {
          console.error(`Failed to delete note ${note.title}:`, result.error)
        }
      }

      // Refresh the file tree
      await refreshFileTree()
      
      console.log(`✅ Cleared ${notesToDelete.length} notes from folder`)
    } catch (error) {
      console.error('Error clearing notes from folder:', error)
    }
  }

  const startRename = (id: string, currentName: string) => {
    setEditingFile(id)
    setEditingName(currentName)
  }

  const finishRename = async () => {
    if (editingFile && editingName.trim()) {
      const noteId = parseInt(editingFile)
      
      // Get the note to check if it's a file or folder
      const noteResult = await NoteService.getNoteById(noteId)
      if (noteResult.success && noteResult.data) {
        const note = noteResult.data
        let newTitle = editingName.trim()
        
        // If it's a file and doesn't end with .lexical, add it
        if (!note.isFolder && !newTitle.endsWith('.lexical')) {
          newTitle = `${newTitle}.lexical`
        }
        
        const result = await NoteService.updateNote(noteId, { 
          title: newTitle
        })
        
        if (result.success) {
          // Refresh the file tree
          await refreshFileTree()
        } else {
          console.error('Failed to rename file:', result.error)
        }
      }
    }
    setEditingFile(null)
    setEditingName("")
  }

  const cancelRename = () => {
    setEditingFile(null)
    setEditingName("")
  }

  // Create new folder
  const createNewFolder = async () => {
    try {
      const folderName = `New Folder ${Date.now()}`
      const result = await NoteService.createNote(
        folderName,
        '',
        `/${folderName}`,
        true // isFolder
      )
      
      if (result.success) {
        await refreshFileTree()
        // Auto-start renaming the new folder
        if (result.data?.id) {
          setEditingFile(result.data.id.toString())
          setEditingName(folderName)
        }
      } else {
        console.error('Failed to create folder:', result.error)
      }
    } catch (error) {
      console.error('Error creating folder:', error)
    }
    setShowCreateMenu(false)
  }

  // Create new note
  const createNewNote = async () => {
    try {
      // Find temp folder
      const allNotes = await NoteService.getAllNotes()
      let tempFolderId: number | undefined

      if (allNotes.success && allNotes.data) {
        const tempFolder = allNotes.data.find(note => 
          note.isFolder && note.title === 'temp'
        )
        tempFolderId = tempFolder?.id
      }

      // Create empty note with default content
      const defaultContent = JSON.stringify({
        root: {
          children: [
            {
              children: [],
              direction: "ltr",
              format: "",
              indent: 0,
              type: "paragraph",
              version: 1,
            },
          ],
          direction: "ltr",
          format: "",
          indent: 0,
          type: "root",
          version: 1,
        },
      })

      const baseName = nickGenerator()

      const noteName = `${baseName.split(' ')[0]}-${new Date().getDate()}-${new Date().getFullYear()}.lexical`
      const result = await NoteService.createNote(
        noteName,
        defaultContent,
        `/temp/${noteName}`,
        false, // isFolder
        tempFolderId
      )
      
      if (result.success) {
        await refreshFileTree()
        // Auto-start renaming the new note
        if (result.data?.id) {
          setEditingFile(result.data.id.toString())
          // Remove .lexical for editing (user will see clean name)
          setEditingName(noteName.replace('.lexical', ''))
        }
      } else {
        console.error('Failed to create note:', result.error)
      }
    } catch (error) {
      console.error('Error creating note:', error)
    }
    setShowCreateMenu(false)
  }

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, nodeId: string, nodeType: string) => {
    if (nodeType === 'file') {
      setDraggedItem(nodeId)
      e.dataTransfer.setData('text/plain', nodeId)
      e.dataTransfer.effectAllowed = 'move'
    }
  }

  const handleDragOver = (e: React.DragEvent, nodeId: string, nodeType: string) => {
    if (nodeType === 'folder' && draggedItem && draggedItem !== nodeId) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setDropTarget(nodeId)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear drop target if we're actually leaving the drop zone
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDropTarget(null)
    }
  }

  const handleDrop = async (e: React.DragEvent, targetFolderId: string) => {
    e.preventDefault()
    
    if (draggedItem && targetFolderId) {
      try {
        const fileId = parseInt(draggedItem)
        const folderId = parseInt(targetFolderId)
        
        // Update the file's parent ID in the database
        const result = await NoteService.updateNote(fileId, {
          parentId: folderId
        })
        
        if (result.success) {
          // Refresh the file tree
          await refreshFileTree()
          console.log('✅ File moved successfully!')
        } else {
          console.error('❌ Failed to move file:', result.error)
        }
      } catch (error) {
        console.error('❌ Error moving file:', error)
      }
    }
    
    setDraggedItem(null)
    setDropTarget(null)
  }

  const handleDragEnd = () => {
    setDraggedItem(null)
    setDropTarget(null)
  }

  const renderFileNode = (node: FileNode, depth = 0) => {
    const indent = depth * 16
    const isEditing = editingFile === node.id

    return (
      <div key={node.id}>
        <div
          className={`flex items-center gap-2 p-1 ${
            node.type === 'folder' ? 'cursor-pointer' : 'cursor-pointer'
          } ${
            dropTarget === node.id ? 'bg-blue-100 border-2 border-blue-400 border-dashed' : 'hover:bg-gray-100'
          } ${
            draggedItem === node.id ? 'opacity-50' : ''
          }`}
          style={{ paddingLeft: `${indent + 8}px` }}
          draggable={node.type === 'file' && !isEditing}
          onDragStart={(e) => handleDragStart(e, node.id, node.type)}
          onDragOver={(e) => handleDragOver(e, node.id, node.type)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, node.id)}
          onDragEnd={handleDragEnd}
          onClick={() => {
            if (isEditing) return
            if (node.type === 'folder') {
              toggleFolder(node.id)
            } else if (node.type === 'file' && node.noteId && onFileClick) {
              onFileClick(node.noteId)
            }
          }}
        >
          {node.type === 'folder' ? (
            node.expanded ? (
              <FolderOpen className="h-4 w-4 text-blue-600" />
            ) : (
              <Folder className="h-4 w-4 text-blue-600" />
            )
          ) : (
            <FileText className="h-4 w-4 text-gray-600" />
          )}
          
          {isEditing ? (
            <Input
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onBlur={finishRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') finishRename()
                if (e.key === 'Escape') cancelRename()
              }}
              className="flex-1 text-sm font-mono h-6 border-2 border-black"
              autoFocus
            />
          ) : (
            <span className="text-sm font-mono text-black flex-1 break-words leading-tight">
              {/* Mobile-friendly filename display */}
              <span className="block md:hidden">
                {node.name.length > 15 ? (
                  <>
                    {node.name.substring(0, 12)}
                    <br />
                    {node.name.substring(12)}
                  </>
                ) : (
                  node.name
                )}
              </span>
              {/* Desktop filename display */}
              <span className="hidden md:block truncate">
                {node.name}
              </span>
            </span>
          )}
          
          {!isEditing && (
            <Popover>
              <PopoverTrigger asChild>
                  <Button 
                  size="sm" 
                  className="h-6 w-6 p-0 hover:bg-blue-300 border-2 border-black bg-white"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreVertical className="h-3 w-3" />
                </Button>
              </PopoverTrigger>
              <PopoverContent 
                className="w-40 p-1 border-2 border-black shadow-[4px_4px_0px_0px_#000] bg-white"
                align="end"
              >
                <div className="space-y-1">
                  <Button
                    size="sm"
                    className="w-full justify-start text-left font-mono text-sm border-2 border-black hover:bg-blue-300 bg-white"
                    onClick={() => startRename(node.id, node.name)}
                  >
                    <Edit3 className="h-3 w-3 mr-2" />
                    Rename
                  </Button>
                  
                  {/* Clear Notes option - only for folders */}
                  {node.type === 'folder' && (
                    <Button
                      size="sm"
                      className="w-full justify-start text-left font-mono text-sm text-orange-600 border-2 border-black hover:bg-blue-300 bg-white"
                      onClick={() => clearNotesFromFolder(node.id)}
                    >
                      <Trash className="h-3 w-3 mr-2" />
                      Clear Notes
                    </Button>
                  )}
                  
                  <Button
                    size="sm"
                    className="w-full justify-start text-left font-mono text-sm text-red-600 border-2 border-black hover:bg-blue-300 bg-white"
                    onClick={() => node.noteId && deleteFile(node.id)}
                  >
                    <Trash2 className="h-3 w-3 mr-2" />
                    Delete
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
        
        {node.type === 'folder' && node.expanded && node.children && (
          <div>
            {node.children.map(child => renderFileNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <Card className="h-full border-4 border-black shadow-[4px_4px_0px_0px_#000] bg-white">
      <CardHeader className="border-b-4 border-black bg-blue-300 p-3">
        <CardTitle className="text-lg font-black text-black flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Star27 size={20} color="#000" />
            FILES
          </span>
          <Popover open={showCreateMenu} onOpenChange={setShowCreateMenu}>
            <PopoverTrigger asChild>
              <Button
                size="sm"
                className="h-6 w-6 p-0 border-2 border-black shadow-[2px_2px_0px_0px_#000] bg-white hover:bg-gray-100 text-black"
              >
                <Plus className="h-3 w-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent 
              className="w-44 p-1 border-2 border-black shadow-[4px_4px_0px_0px_#000] bg-white"
              align="end"
            >
              <div className="space-y-1">
                <Button
                  size="sm"
                  className="w-full justify-start text-left font-mono text-sm hover:bg-green-100 border-2 border-black"
                  onClick={createNewFolder}
                >
                  <FolderPlus className="h-3 w-3 mr-2" />
                  New Folder
                </Button>
                <Button
                  size="sm"
                  className="w-full justify-start text-left font-mono text-sm hover:bg-blue-100 border-2 border-black"
                  onClick={createNewNote}
                >
                  <FilePlus className="h-3 w-3 mr-2" />
                  New Note
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 h-[calc(100%-4rem)]">
        <ScrollArea className="h-full">
          <div className="p-3 space-y-1">
            {loading ? (
              <div className="text-center text-gray-500 font-mono">Loading files...</div>
            ) : fileTree.length === 0 ? (
              <div className="text-center text-gray-500 font-mono text-sm">
                No files yet. Save your first note! 📝
              </div>
            ) : (
              fileTree.map(node => renderFileNode(node))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
})
