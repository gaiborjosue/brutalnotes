import { useState, useEffect, useCallback, useMemo, useRef, forwardRef, useImperativeHandle, type KeyboardEvent } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { 
  Folder, 
  FolderOpen, 
  FileText, 
  MoreVertical,
  Trash2,
  Edit3,
  FolderPlus,
  FilePlus,
  Trash,
  Search,
  X,
  CircleHelp,
} from "lucide-react"
import Star27 from "@/components/stars/s27"
import type { FileNode } from "@/lib/types"
import { useNotes } from "@/hooks"
import { cn } from "@/lib/utils"

const TEMP_FOLDER_NAME = "temp"
const TEMP_FOLDER_LABEL = "Drafts"
const DEFAULT_FOLDER_NAME = "New folder"
const DEFAULT_NOTE_NAME = "Untitled note"

function isProtectedFolderName(name: string): boolean {
  return name === TEMP_FOLDER_NAME
}

function getDisplayName(node: Pick<FileNode, "type" | "name">): string {
  return node.type === "folder" && isProtectedFolderName(node.name) ? TEMP_FOLDER_LABEL : node.name
}

function countDescendantFiles(node: FileNode): number {
  if (node.type === "file") {
    return 1
  }

  return (node.children ?? []).reduce((total, child) => total + countDescendantFiles(child), 0)
}

function filterFileTree(nodes: FileNode[], query: string): FileNode[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) {
    return nodes
  }

  return nodes.flatMap((node) => {
    const labelMatches = getDisplayName(node).toLowerCase().includes(normalizedQuery)
    const filteredChildren = node.children ? filterFileTree(node.children, normalizedQuery) : undefined
    const hasMatchingChildren = Boolean(filteredChildren && filteredChildren.length > 0)

    if (!labelMatches && !hasMatchingChildren) {
      return []
    }

    return [
      {
        ...node,
        expanded: node.type === "folder" ? true : node.expanded,
        children: node.type === "folder"
          ? (labelMatches ? node.children : filteredChildren)
          : node.children,
      },
    ]
  })
}

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
  collapsed?: boolean
  onToggle?: () => void
  className?: string
}

export const FileSystemPanel = forwardRef<FileSystemPanelRef, FileSystemPanelProps>(({ onFileClick, onNewFileClick, onFileDeleted, onFolderCleared, currentFileId, beforeFileMove, collapsed = false, onToggle, className }, ref) => {
  const { 
    notes, 
    fileTree: shapeFileTree, 
    createNote, 
    updateNote, 
    deleteNote, 
    isInitialLoading, 
    isSyncing, 
    isLiveSync,
  } = useNotes()
  const [fileTree, setFileTree] = useState<FileNode[]>([])
  const [editingFile, setEditingFile] = useState<string | null>(null)
  const [editingName, setEditingName] = useState("")
  const [draggedItem, setDraggedItem] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Ensure temp folder exists on component mount
  useEffect(() => {
    const ensureTempFolder = async () => {
      if (isInitialized || isInitialLoading) return
      
      try {
        const tempFolders = notes.filter(note => 
          note.isFolder && note.title === TEMP_FOLDER_NAME
        )
        
        if (tempFolders.length === 0) {
          console.log('🔧 Initializing temp folder for new user')
          try {
            await createNote(TEMP_FOLDER_NAME, '', TEMP_FOLDER_NAME, true, undefined)
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

  useEffect(() => {
    if (!isSearchOpen) {
      return
    }

    searchInputRef.current?.focus()
  }, [isSearchOpen])

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
    // Find note by client ID
    const note = notes.find(note => note.clientId === id)
    if (!note || !note.id) {
      console.error('Note to delete not found:', id)
      return
    }
    
    try {
      await deleteNote(note.id)
      // Notify parent that file was deleted
      onFileDeleted?.(note.id)
      // Refresh the file tree
      await refreshFileTree()
    } catch (error) {
      console.error('Failed to delete file:', error)
    }
  }

  const clearNotesFromFolder = async (folderId: string) => {
    try {
      // Find folder by client ID
      const folderNote = notes.find(note => note.clientId === folderId)
      if (!folderNote || !folderNote.id) {
        console.error('Folder to clear not found:', folderId)
        return
      }
      
      // Find all notes that are children of this folder (not folders themselves)
      const notesToDelete = notes.filter(note => 
        note.parentId === folderNote.id && !note.isFolder
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
        if (currentName === TEMP_FOLDER_NAME) {
      return
    }
    setEditingFile(id)
    setEditingName(currentName)
  }

  const finishRename = async () => {
    if (editingFile && editingName.trim()) {
      // Find note by client ID
      const note = notes.find(note => note.clientId === editingFile)
      if (!note || !note.id) {
        console.error('Note to rename not found:', editingFile)
        setEditingFile(null)
        setEditingName("")
        return
      }
      
      // Get the note to check if it's a file or folder
      try {
        // Check if it's the temp folder (can't be renamed)
        if (note.isFolder && note.title === TEMP_FOLDER_NAME) {
          setEditingFile(null)
          setEditingName("")
          return
        }
        
        let newTitle = editingName.trim()
        
        // If it's a file and doesn't end with .lexical, add it
        if (!note.isFolder && !newTitle.endsWith('.lexical')) {
          newTitle = `${newTitle}.lexical`
        }
        
        await updateNote(note.id, { title: newTitle })
        
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
      const newFolder = await createNote(
        DEFAULT_FOLDER_NAME,
        '',
        DEFAULT_FOLDER_NAME,
        true // isFolder
      )
      
      if (newFolder) {
        await refreshFileTree()
        // Auto-start renaming the new folder
        if (newFolder.clientId) {
          setEditingFile(newFolder.clientId)
          setEditingName(DEFAULT_FOLDER_NAME)
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
        note.isFolder && note.title === TEMP_FOLDER_NAME
      )
      tempFolderId = tempFolder?.id

      // If temp folder doesn't exist, create it first
      if (!tempFolderId) {
        console.log('🔧 Creating missing temp folder')
        const newTempFolder = await createNote(
          TEMP_FOLDER_NAME,
          '',
          undefined, // path will be generated automatically
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

      const noteName = `${DEFAULT_NOTE_NAME}.lexical`
      const newNote = await createNote(
        noteName,
        defaultContent,
        undefined, // path will be generated automatically from parent relationship
        false, // isFolder
        tempFolderId
      )
      
      if (newNote) {
        await refreshFileTree()
        // Auto-start renaming the new note
        if (newNote.id && newNote.clientId) {
          const newId = newNote.id
          setEditingFile(newNote.clientId)
          // Remove .lexical for editing (user will see clean name)
          setEditingName(DEFAULT_NOTE_NAME)
          
          // Automatically open the new file in the editor after a brief delay
          // This allows the user to see the file being created and gives time for renaming
          setTimeout(() => {
            if (onFileClick) {
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
        // Find notes by client ID since node.id is now client ID string
        const fileNote = notes.find(note => note.clientId === draggedItem)
        const parentNote = notes.find(note => note.clientId === targetFolderId)

        if (!fileNote || !fileNote.id) {
          throw new Error('File to move not found')
        }

        if (!parentNote || !parentNote.id) {
          throw new Error('Target folder not found')
        }

        const fileNoteId = fileNote.id
        const parentNoteId = parentNote.id

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
            await updateNote(fileNoteId, {
              parentId: parentNoteId,
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

  const visibleTree = useMemo(
    () => filterFileTree(fileTree, searchQuery),
    [fileTree, searchQuery],
  )

  const handleCreateFolderClick = (event: React.MouseEvent) => {
    event.stopPropagation()
    void createNewFolder()
  }

  const handleCreateNoteClick = (event: React.MouseEvent) => {
    event.stopPropagation()
    if (onNewFileClick) {
      onNewFileClick(createNewNote)
      return
    }

    void createNewNote()
  }

  const handleSearchToggle = (event: React.MouseEvent) => {
    event.stopPropagation()
    setIsSearchOpen((previous) => (searchQuery ? true : !previous))
  }

  const handleSearchDismiss = (event: React.MouseEvent) => {
    event.stopPropagation()
    if (searchQuery) {
      setSearchQuery("")
      searchInputRef.current?.focus()
      return
    }

    setIsSearchOpen(false)
  }

  const renderFileNode = (node: FileNode, depth = 0) => {
    const indent = depth * 16
    const isEditing = editingFile === node.id
    const isCurrentFile = node.type === 'file' && node.noteId === currentFileId
    const folderFileCount = node.type === 'folder' ? countDescendantFiles(node) : 0
    const displayName = getDisplayName(node)
    const canManageNode = !(node.type === "folder" && isProtectedFolderName(node.name))

    return (
      <div key={node.id}>
        <div
          className={cn(
            "group flex items-center gap-2 rounded-base border-2 px-2 py-1.5 transition-colors",
            "cursor-pointer",
            isCurrentFile
              ? "border-black bg-main/35 shadow-[2px_2px_0px_0px_#000]"
              : dropTarget === node.id
                ? "border-blue-500 bg-blue-100 border-dashed"
                : "border-transparent hover:border-black/20 hover:bg-black/5",
            draggedItem === node.id && "opacity-50",
          )}
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
              <FolderOpen className="h-4 w-4 shrink-0 text-blue-600" />
            ) : (
              <Folder className="h-4 w-4 shrink-0 text-blue-600" />
            )
          ) : (
            <FileText className={cn("h-4 w-4 shrink-0", isCurrentFile ? "text-black" : "text-gray-600")} />
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
            <div className="min-w-0 flex-1" title={displayName}>
              <span className={cn(
                "block truncate text-sm leading-tight text-black",
                node.type === "folder" ? "font-black" : "font-mono",
                isCurrentFile && "font-black",
              )}>
                {displayName}
              </span>
              {node.type === "folder" ? (
                <span className="block text-[10px] font-mono uppercase tracking-wide text-black/55">
                  {folderFileCount === 0 ? "Empty" : `${folderFileCount} ${folderFileCount === 1 ? "note" : "notes"}`}
                </span>
              ) : null}
            </div>
          )}
          
          {!isEditing && (
            <Popover>
              <PopoverTrigger asChild>
                <Button 
                  size="sm" 
                  variant="neutral"
                  className={cn(
                    "size-7 shrink-0 p-0",
                    "opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100",
                    isCurrentFile && "opacity-100",
                  )}
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreVertical />
                </Button>
              </PopoverTrigger>
              <PopoverContent 
                className="w-44 p-1"
                align="end"
              >
                <div className="flex flex-col gap-1">
                  <Button
                    size="sm"
                    variant="neutral"
                    className="w-full justify-start text-left font-mono text-xs"
                    onClick={() => startRename(node.id, node.name)}
                    disabled={!canManageNode}
                  >
                    <Edit3 data-icon="inline-start" />
                    Rename
                  </Button>
                  
                  {node.type === 'folder' && folderFileCount > 0 && (
                    <Button
                      size="sm"
                      variant="neutral"
                      className="w-full justify-start text-left font-mono text-xs text-orange-700"
                      onClick={() => clearNotesFromFolder(node.id)}
                    >
                      <Trash data-icon="inline-start" />
                      Clear Notes
                    </Button>
                  )}
                  
                  <Button
                    size="sm"
                    variant="neutral"
                    className="w-full justify-start text-left font-mono text-xs text-red-600"
                    onClick={() => node.noteId && deleteFile(node.id)}
                    disabled={!canManageNode}
                  >
                    <Trash2 data-icon="inline-start" />
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

  const handleHeaderKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onToggle) return
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      onToggle()
    }
  }

  const cardClasses = collapsed
    ? "gap-0 pt-6 pb-0 border-4 border-black shadow-[4px_4px_0px_0px_#000] bg-white"
    : "h-full min-h-0 gap-0 pt-6 pb-0 border-4 border-black shadow-[4px_4px_0px_0px_#000] bg-white flex flex-col"

  return (
    <Card
      className={`${cardClasses} ${onToggle ? "cursor-pointer" : ""} ${className ?? ""}`.trim()}
      aria-expanded={!collapsed}
    >
      <CardHeader
        className="border-b-4 border-black bg-blue-300 p-3"
        onClick={onToggle}
        role={onToggle ? "button" : undefined}
        tabIndex={onToggle ? 0 : undefined}
        onKeyDown={handleHeaderKeyDown}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <CardTitle className="flex items-center gap-2 text-lg font-black text-black">
                <Star27 size={20} color="#000" />
                FILES
              </CardTitle>

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex size-5 items-center justify-center text-black/60 transition-colors hover:text-black focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-black/20"
                    aria-label="Files help"
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <CircleHelp />
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="bottom"
                  className="max-w-[240px] rounded-base border-2 border-border bg-background px-3 py-2 font-mono text-[11px] uppercase tracking-wide text-foreground shadow-shadow"
                >
                  New notes start in Drafts. Drag files into folders when you want structure.
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "inline-flex size-5 items-center justify-center text-black/60 transition-colors hover:text-black focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-black/20",
                      (isSearchOpen || Boolean(searchQuery)) && "text-black",
                    )}
                    aria-label="Search files"
                    onClick={handleSearchToggle}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <Search />
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="bottom"
                  className="rounded-base border-2 border-border bg-background px-3 py-2 font-mono text-[11px] uppercase tracking-wide text-foreground shadow-shadow"
                >
                  Search files
                </TooltipContent>
              </Tooltip>
            </div>

            <div
              className={cn(
                "grid transition-all duration-200 ease-out",
                isSearchOpen || searchQuery ? "mt-2 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
              )}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              <div className="min-h-0 overflow-hidden">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/45" />
                  <Input
                    ref={searchInputRef}
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    onKeyDown={(event) => {
                      event.stopPropagation()
                      if (event.key === "Escape") {
                        if (searchQuery) {
                          setSearchQuery("")
                        } else {
                          setIsSearchOpen(false)
                        }
                      }
                    }}
                    placeholder="Search files and folders"
                    className="h-9 border-black bg-white pr-10 pl-9 font-mono"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="neutral"
                    className="absolute right-1 top-1/2 size-7 -translate-y-1/2 p-0"
                    onClick={handleSearchDismiss}
                    title={searchQuery ? "Clear search" : "Close search"}
                  >
                    <X />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isInitialLoading && (
              <span className="rounded-base border-2 border-black bg-yellow-200 px-2 py-1 text-[10px] font-mono font-black uppercase tracking-wide text-black">
                Loading
              </span>
            )}
            {isSyncing && !isInitialLoading && (
              <div
                className="h-2.5 w-2.5 rounded-full bg-yellow-500 animate-pulse"
                title="Syncing..."
              />
            )}
            {isLiveSync && (
              <div
                className="h-2.5 w-2.5 rounded-full bg-green-500"
                title="Live sync active"
              />
            )}
          </div>
        </div>
      </CardHeader>
      {!collapsed && (
        <CardContent className="flex flex-1 min-h-0 flex-col p-0 pt-0">
          <div className="grid grid-cols-2 border-b-2 border-black/10 bg-blue-100" onClick={(event) => event.stopPropagation()}>
            <div className="border-r-2 border-black">
              <Button
                size="sm"
                variant="noShadow"
                className="h-10 w-full rounded-none border-0 bg-yellow-300 font-black text-black hover:bg-yellow-400"
                onClick={handleCreateNoteClick}
              >
                <FilePlus data-icon="inline-start" />
                New note
              </Button>
            </div>
            <div>
              <Button
                size="sm"
                variant="noShadow"
                className="h-10 w-full rounded-none border-0 bg-blue-100 font-black text-black hover:bg-blue-200"
                onClick={handleCreateFolderClick}
              >
                <FolderPlus data-icon="inline-start" />
                New folder
              </Button>
            </div>
          </div>

          <ScrollArea className="flex-1 min-h-0">
            <div className="p-3 pb-4">
              {isInitialLoading ? (
                <div className="py-8 text-center text-sm font-mono text-gray-500">Loading files...</div>
              ) : visibleTree.length === 0 && searchQuery ? (
                <div className="rounded-base border-2 border-dashed border-black/30 bg-black/5 px-4 py-8 text-center">
                  <p className="font-black text-black">No matches for "{searchQuery}"</p>
                  <p className="mt-1 text-sm font-mono text-black/60">Try a different name or clear the search.</p>
                  <Button
                    size="sm"
                    variant="neutral"
                    className="mt-3"
                    onClick={() => setSearchQuery("")}
                  >
                    Clear search
                  </Button>
                </div>
              ) : visibleTree.length === 0 ? (
                <div className="rounded-base border-2 border-dashed border-black/30 bg-black/5 px-4 py-8 text-center">
                  <p className="font-black text-black">No files yet</p>
                  <p className="mt-1 text-sm font-mono text-black/60">Create a note to start filling this space.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {visibleTree.map(node => renderFileNode(node))}
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      )}
    </Card>
  )
})
