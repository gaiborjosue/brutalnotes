import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { 
  Folder, 
  FolderOpen, 
  FileText, 
  MoreVertical,
  Trash2,
  Edit3,
  FolderPlus,
  FilePlus,
  Trash
} from "lucide-react"
import Star27 from "@/components/stars/s27"
import type { FileNode } from "@/lib/types"
import { useNotes } from "@/hooks"
import nickGenerator from "nick-generator"


export interface FileSystemPanelRef {
  refreshFileTree: () => Promise<void>
}

interface FileSystemPanelProps {
  onFileClick?: (noteId: number) => void
  onNewFileClick?: (createFileAction: () => void) => void
  onFileDeleted?: (noteId: number) => void
  onFolderCleared?: (deletedNoteIds: number[]) => void
  currentFileId?: number | null
  beforeFileMove?: (moveAction: () => Promise<void>) => Promise<boolean>
}

export const FileSystemPanel = forwardRef<FileSystemPanelRef, FileSystemPanelProps>(({ onFileClick, onNewFileClick, onFileDeleted, onFolderCleared, currentFileId, beforeFileMove }, ref) => {
  const { 
    notes, 
    fileTree: shapeFileTree, 
    createNote, 
    updateNote, 
    deleteNote, 
    getNoteById,
    isInitialLoading, 
    isSyncing, 
    isLiveSync,
    error,
    refresh: refreshNotes
  } = useNotes()
  const [fileTree, setFileTree] = useState<FileNode[]>([])
  const [editingFile, setEditingFile] = useState<string | null>(null)
  const [editingName, setEditingName] = useState("")
  const [draggedItem, setDraggedItem] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)

  // Ensure temp folder exists on component mount
  useEffect(() => {
    const ensureTempFolder = async () => {
      if (isInitialized || isInitialLoading) return
      
      try {
        const tempFolders = notes.filter(note => 
          note.isFolder && note.title === 'temp'
        )
        
        if (tempFolders.length === 0) {
          console.log('🔧 Initializing temp folder for new user')
          try {
            await createNote('temp', '', 'temp', true, undefined)
            console.log('✅ Temp folder created successfully')
          } catch (error) {
            console.error('❌ Failed to create temp folder:', error)
          }
        } else if (tempFolders.length > 1) {
          console.warn('⚠️ Multiple temp folders detected:', tempFolders.length)
          // Keep only the first temp folder, delete the others
          for (let i = 1; i < tempFolders.length; i++) {
            const extraTempFolder = tempFolders[i]
            if (extraTempFolder.id) {
              console.log(`🗑️ Removing duplicate temp folder: ${extraTempFolder.id}`)
              await deleteNote(extraTempFolder.id)
            }
          }
        }
        setIsInitialized(true)
      } catch (error) {
        console.error('Error ensuring temp folder exists:', error)
        setIsInitialized(true)
      }
    }

    ensureTempFolder()
  }, [isInitialLoading, isInitialized, notes, createNote, deleteNote])

  const mergeTreeState = useCallback((previous: FileNode[], next: FileNode[]): FileNode[] => {
    const previousExpanded = new Map(previous.map(node => [node.id, node]))

    const apply = (nodes: FileNode[]): FileNode[] =>
      nodes.map(node => {
        const prev = previousExpanded.get(node.id)
        return {
          ...node,
          expanded: prev?.expanded ?? node.expanded,
          children: node.children ? apply(node.children) : undefined,
        }
      })

    return apply(next)
  }, [])

  useEffect(() => {
    setFileTree(prev => mergeTreeState(prev, shapeFileTree))
  }, [shapeFileTree, mergeTreeState])

  const refreshFileTree = useCallback(async () => {
    setFileTree(prev => mergeTreeState(prev, shapeFileTree))
  }, [mergeTreeState, shapeFileTree])

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
    try {
      await deleteNote(noteId)
      // Notify parent that file was deleted
      onFileDeleted?.(noteId)
      // Refresh the file tree
      await refreshFileTree()
    } catch (error) {
      console.error('Failed to delete file:', error)
    }
  }

  const clearNotesFromFolder = async (folderId: string) => {
    try {
      const folderNoteId = parseInt(folderId)
      
      // Find all notes that are children of this folder (not folders themselves)
      const notesToDelete = notes.filter(note => 
        note.parentId === folderNoteId && !note.isFolder
      )

      // Delete each note and collect successfully deleted IDs
      const deletedNoteIds: number[] = []
      for (const note of notesToDelete) {
        if (note.id) {
          try {
            await deleteNote(note.id)
            deletedNoteIds.push(note.id)
          } catch (error) {
            console.error(`Failed to delete note ${note.title}:`, error)
          }
        }
      }

      // Notify parent about cleared notes
      if (deletedNoteIds.length > 0) {
        onFolderCleared?.(deletedNoteIds)
      }

      // Refresh the file tree
      await refreshFileTree()
      
      console.log(`✅ Cleared ${deletedNoteIds.length} notes from folder`)
    } catch (error) {
      console.error('Error clearing notes from folder:', error)
    }
  }

  const startRename = (id: string, currentName: string) => {
    if (currentName === 'temp') {
      return
    }
    setEditingFile(id)
    setEditingName(currentName)
  }

  const finishRename = async () => {
    if (editingFile && editingName.trim()) {
      const noteId = parseInt(editingFile)
      
      // Get the note to check if it's a file or folder
      try {
        const note = await getNoteById(noteId)
        if (note && note.isFolder && note.title === 'temp') {
          setEditingFile(null)
          setEditingName("")
          return
        }
        let newTitle = editingName.trim()
        
        // If it's a file and doesn't end with .lexical, add it
        if (note && !note.isFolder && !newTitle.endsWith('.lexical')) {
          newTitle = `${newTitle}.lexical`
        }
        
        await updateNote(noteId, { title: newTitle })
        
        // Refresh the file tree
        await refreshFileTree()
      } catch (error) {
        console.error('Failed to rename file:', error)
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
      const newFolder = await createNote(
        folderName,
        '',
        folderName,
        true // isFolder
      )
      
      if (newFolder) {
        await refreshFileTree()
        // Auto-start renaming the new folder
        if (newFolder.id) {
          setEditingFile(newFolder.id.toString())
          setEditingName(folderName)
        }
      }
    } catch (error) {
      console.error('Error creating folder:', error)
    }
  }

  // Create new note
  const createNewNote = async () => {
    try {
      // Find temp folder (should always exist since database is initialized first)
      let tempFolderId: number | undefined

      const tempFolder = notes.find(note => 
        note.isFolder && note.title === 'temp'
      )
      tempFolderId = tempFolder?.id

      // If temp folder doesn't exist, create it first
      if (!tempFolderId) {
        console.log('🔧 Creating missing temp folder')
        const newTempFolder = await createNote(
          'temp',
          '',
          'temp',
          true // isFolder
        )
        
        if (newTempFolder?.id) {
          tempFolderId = newTempFolder.id
          await refreshFileTree() // Refresh to show the new temp folder
        } else {
          console.error('❌ Failed to create temp folder')
          return
        }
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
      const newNote = await createNote(
        noteName,
        defaultContent,
        `temp/${noteName}`,
        false, // isFolder
        tempFolderId
      )
      
      if (newNote) {
        await refreshFileTree()
        // Auto-start renaming the new note
        if (newNote.id) {
          const newId = newNote.id
          setEditingFile(newId.toString())
          // Remove .lexical for editing (user will see clean name)
          setEditingName(noteName.replace('.lexical', ''))
          
          // Automatically open the new file in the editor after a brief delay
          // This allows the user to see the file being created and gives time for renaming
          setTimeout(() => {
            if (onFileClick) {
              console.log('📖 Auto-opening newly created file in editor')
              onFileClick(newId)
            }
          }, 100)
        }
      }
    } catch (error) {
      console.error('Error creating note:', error)
    }
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
        
        const [fileNote, parentNote] = await Promise.all([
          getNoteById(fileId),
          getNoteById(folderId)
        ])

        if (!fileNote) {
          throw new Error('File to move not found')
        }

        if (!parentNote) {
          throw new Error('Target folder not found')
        }

        const fileNameFromPath = fileNote.path
          ? fileNote.path.split('/').filter(Boolean).pop() ?? fileNote.title
          : fileNote.title

        const finalFileName = fileNameFromPath.endsWith('.lexical')
          ? fileNameFromPath
          : `${fileNameFromPath}.lexical`

        const parentPath = parentNote.path ?? ''
        const normalizedParentPath = parentPath.replace(/^\/+|\/+$/g, '')
        const newPath = normalizedParentPath ? `${normalizedParentPath}/${finalFileName}` : finalFileName

        const performMove = async () => {
          try {
            await updateNote(fileId, {
              parentId: folderId,
              path: newPath
            })

            // Refresh the file tree immediately so the user sees the new location
            await refreshFileTree()

            console.log('✅ File moved successfully!')
          } catch (error) {
            console.error('❌ Failed to move file:', error)
          }
        }

        if (beforeFileMove) {
          const allowed = await beforeFileMove(performMove)
          if (!allowed) {
            setDraggedItem(null)
            setDropTarget(null)
            return
          }
        } else {
          await performMove()
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
    const isCurrentFile = node.type === 'file' && node.noteId === currentFileId

    return (
      <div key={node.id}>
        <div
          className={`flex items-center gap-2 p-1 ${
            node.type === 'folder' ? 'cursor-pointer' : 'cursor-pointer'
          } ${
            isCurrentFile 
              ? 'bg-yellow-200 border-2 border-yellow-400 shadow-[2px_2px_0px_0px_#000] font-bold' 
              : dropTarget === node.id 
                ? 'bg-blue-100 border-2 border-blue-400 border-dashed' 
                : 'hover:bg-gray-100'
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
            <FileText className={`h-4 w-4 ${isCurrentFile ? 'text-yellow-800' : 'text-gray-600'}`} />
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
              className="flex-1 text-xs font-mono h-6 border-2 border-black"
              autoFocus
            />
          ) : (
            <span className="text-xs font-mono text-black flex-1 w-0 leading-tight" title={node.name}>
              <span className="block truncate">{node.name}</span>
            </span>
          )}
          
          {!isEditing && (
            <Popover>
              <PopoverTrigger asChild>
                <Button 
                  size="sm" 
                  className="h-6 w-6 p-0 hover:bg-blue-300 border-2 border-black bg-white shrink-0"
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
                    className="w-full justify-start text-left font-mono text-xs border-2 border-black hover:bg-blue-300 bg-white"
                    onClick={() => startRename(node.id, node.name)}
                    disabled={node.type === 'folder' && node.name === 'temp'}
                  >
                    <Edit3 className="h-3 w-3 mr-2" />
                    Rename
                  </Button>
                  
                  {/* Clear Notes option - only for folders */}
                  {node.type === 'folder' && (
                    <Button
                      size="sm"
                      className="w-full justify-start text-left font-mono text-xs text-orange-600 border-2 border-black hover:bg-blue-300 bg-white"
                      onClick={() => clearNotesFromFolder(node.id)}
                    >
                      <Trash className="h-3 w-3 mr-2" />
                      Clear Notes
                    </Button>
                  )}
                  
                  <Button
                    size="sm"
                    className="w-full justify-start text-left font-mono text-xs text-red-600 border-2 border-black hover:bg-blue-300 bg-white"
                    onClick={() => node.noteId && deleteFile(node.id)}
                    disabled={node.type === 'folder' && node.name === 'temp'}
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
    <Card className="h-full min-h-0 border-4 border-black shadow-[4px_4px_0px_0px_#000] bg-white flex flex-col">
      <CardHeader className="border-b-4 border-black bg-blue-300 p-3">
        <CardTitle className="text-lg font-black text-black flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Star27 size={20} color="#000" />
            FILES
            {/* Show sync status with subtle dots */}
            {isInitialLoading && (
              <span className="text-xs font-mono text-gray-600 bg-yellow-200 px-2 py-1 rounded">
                LOADING...
              </span>
            )}
            {isSyncing && !isInitialLoading && (
              <div 
                className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" 
                title="Syncing..."
              />
            )}
            {isLiveSync && (
              <div 
                className="w-2 h-2 bg-green-500 rounded-full" 
                title="Live sync active"
              />
            )}
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="h-7 px-2 border-2 border-black shadow-[2px_2px_0px_0px_#000] bg-white hover:bg-gray-100 text-black"
              onClick={createNewFolder}
              title="New folder"
            >
              <FolderPlus className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              className="h-7 px-2 border-2 border-black shadow-[2px_2px_0px_0px_#000] bg-white hover:bg-gray-100 text-black"
              onClick={() => {
                if (onNewFileClick) {
                  onNewFileClick(createNewNote)
                } else {
                  createNewNote()
                }
              }}
              title="New note"
            >
              <FilePlus className="h-4 w-4" />
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 pt-0 flex-1 min-h-0">
        <ScrollArea className="h-full min-h-0">
          <div className="p-3 pb-4 space-y-1">
            {isInitialLoading ? (
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
