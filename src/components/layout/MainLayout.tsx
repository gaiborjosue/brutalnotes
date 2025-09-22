import { useEffect, useRef, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { VisuallyHidden } from "@/components/ui/visually-hidden"
import { FocusTooltip } from "@/components/ui/focus-tooltip"
import { TodoPanel } from "./TodoPanel"
import { FileSystemPanel } from "./FileSystemPanel"
import { RecordingPanel } from "./RecordingPanel"
import { BrutalEditor } from "./BrutalEditor"
import { UnsavedChangesDialog } from "@/components/editor/editor-ui/unsaved-changes-dialog"
import { useNotes } from "@/hooks"
import { usePanelFocus } from "@/hooks/usePanelFocus"
import { Menu, LogOut, Wifi, WifiOff } from "lucide-react"
import Star24 from "@/components/stars/s24"
import { useAuth } from "@/contexts/AuthContext"
import { ScanNotesPopover } from "@/features/scan-notes/ScanNotesPopover"

export function MainLayout() {
  const { user, signOut } = useAuth()
  const { getNoteById } = useNotes()
  const fileSystemRef = useRef<{ refreshFileTree: () => Promise<void> } | null>(null)
  const [loadFileContent, setLoadFileContent] = useState<((content: string, fileId: number) => void) | null>(null)
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [currentFileId, setCurrentFileId] = useState<number | null>(null)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  
  // Panel focus management for Ctrl+hover/click
  const { 
    handlePanelHover,
    handlePanelLeave,
    handlePanelClick,
    isFocused,
    shouldShowTooltip
  } = usePanelFocus()
  
  // Editor content insertion/ref replacement helpers
  const insertContentRef = useRef<((content: string) => void) | null>(null)
  const replaceContentRef = useRef<((content: string) => void) | null>(null)
  
  // Unsaved changes management
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [unsavedSaveFunction, setUnsavedSaveFunction] = useState<(() => Promise<void>) | null>(null)
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false)
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)
  const [actionDescription, setActionDescription] = useState("")

  // Listen for online/offline status changes
  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const handleFileSaved = async () => {
    // Refresh the file system panel when a file is saved
    if (fileSystemRef.current?.refreshFileTree) {
      await fileSystemRef.current.refreshFileTree()
    }
  }

  const handleLoadFile = useCallback((loadFunction: (content: string, fileId: number) => void) => {
    setLoadFileContent(() => loadFunction)
  }, [])

  // Handle unsaved changes warning from editor
  const handleUnsavedChangesWarning = useCallback((unsavedChanges: boolean, saveFunction: () => Promise<void>) => {
    setHasUnsavedChanges(unsavedChanges)
    setUnsavedSaveFunction(() => saveFunction)
  }, [])

  const handleScannedNotesGenerated = useCallback((markdown: string) => {
    if (replaceContentRef.current) {
      replaceContentRef.current(markdown)
      setCurrentFileId(null)
      setHasUnsavedChanges(true)
      setUnsavedSaveFunction(null)
    } else {
      console.warn('Editor is not ready to receive scanned notes.')
    }
  }, [])

  // Handle current file changes to track active file
  const handleCurrentFileChange = useCallback((fileId: number | null) => {
    if (fileId) {
      setCurrentFileId(fileId) // Track current files
      // Refresh file tree to show the newly created file
      fileSystemRef.current?.refreshFileTree()
    }
  }, [])

  // Handle file deletion - clear editor if current file was deleted
  const handleFileDeleted = useCallback((deletedFileId: number) => {
    if (currentFileId === deletedFileId) {
      // Clear the current file state
      setCurrentFileId(null)
      // Clear any unsaved changes state
      setHasUnsavedChanges(false)
      setUnsavedSaveFunction(null)
      
      // Load empty editor content
      if (loadFileContent) {
        const emptyContent = JSON.stringify({
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
        loadFileContent(emptyContent, 0) // Use 0 as placeholder for empty state
      }
    }
  }, [currentFileId, loadFileContent])

  // Handle folder clearing - clear editor if current file was in the cleared folder
  const handleFolderCleared = useCallback((deletedNoteIds: number[]) => {
    if (currentFileId && deletedNoteIds.includes(currentFileId)) {
      // Current file was among the cleared notes, clear the editor
      setCurrentFileId(null)
      setHasUnsavedChanges(false)
      setUnsavedSaveFunction(null)
      
      // Load empty editor content
      if (loadFileContent) {
        const emptyContent = JSON.stringify({
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
        loadFileContent(emptyContent, 0) // Use 0 as placeholder for empty state
      }
    }
  }, [currentFileId, loadFileContent])

  // Check for unsaved changes before performing an action
  const checkUnsavedChanges = (action: () => void | Promise<void>, description: string) => {
    if (hasUnsavedChanges && unsavedSaveFunction) {
      setPendingAction(() => action)
      setActionDescription(description)
      setShowUnsavedDialog(true)
      return false // Action blocked
    }
    try {
      const result = action()
      if (result && typeof (result as Promise<void>).then === 'function') {
        ;(result as Promise<void>).catch(error => {
          if (error !== null && error !== undefined) {
            console.error(`Async action failed (${description}):`, error)
          }
        })
      }
    } catch (error) {
      console.error(`Action threw synchronously (${description}):`, error)
    }
    return true // Action performed
  }

  const handleFileClick = async (noteId: number) => {
    const loadFile = async () => {
      // Load file content into editor
      if (loadFileContent) {
        try {
          const note = await getNoteById(noteId)
          if (note) {
            loadFileContent(note.content, noteId)
            setCurrentFileId(noteId) // Track the currently opened file
          } else {
            console.error('Failed to load file: Note not found')
          }
        } catch (error) {
          console.error('Error loading file:', error)
        }
      }
    }

    checkUnsavedChanges(loadFile, "switch to another file")
  }

  // Dialog handlers
  const handleSaveAndContinue = async () => {
    if (unsavedSaveFunction) {
      await unsavedSaveFunction()
      if (pendingAction) {
        pendingAction()
        setPendingAction(null)
      }
    }
  }

  const handleDiscardAndContinue = () => {
    if (pendingAction) {
      pendingAction()
      setPendingAction(null)
    }
  }

  const handleCancelAction = () => {
    setPendingAction(null)
    setActionDescription("")
  }

  const renderSidebarPanels = () => (
    <div className="flex flex-col gap-2 h-full min-h-0">
      {/* Todo Panel */}
      <div 
        className={`flex-1 min-h-0 relative transition-all duration-200 ${
          isFocused('todo') ? 'flex-[3] z-10' : ''
        }`}
        onMouseEnter={() => handlePanelHover('todo')}
        onMouseLeave={handlePanelLeave}
        onClick={() => handlePanelClick('todo')}
      >
        <TodoPanel />
        {shouldShowTooltip('todo') && (
          <FocusTooltip show={true} isFocused={isFocused('todo')} />
        )}
      </div>
      
      {/* File System Panel */}
      <div 
        className={`flex-1 min-h-0 relative transition-all duration-200 ${
          isFocused('files') ? 'flex-[3] z-10' : ''
        }`}
        onMouseEnter={() => handlePanelHover('files')}
        onMouseLeave={handlePanelLeave}
        onClick={() => handlePanelClick('files')}
      >
        <FileSystemPanel 
          ref={fileSystemRef} 
          onFileClick={handleFileClick}
          onNewFileClick={(createFileAction) => {
            checkUnsavedChanges(createFileAction, "create a new file")
          }}
          beforeFileMove={async (moveAction) => {
            if (hasUnsavedChanges && unsavedSaveFunction) {
              setPendingAction(() => {
                moveAction().catch(error => {
                  console.error('Failed to move note after resolving unsaved changes:', error)
                })
              })
              setActionDescription("move the note to a different folder")
              setShowUnsavedDialog(true)
              return false
            }

            await moveAction()
            return true
          }}
          onFileDeleted={handleFileDeleted}
          onFolderCleared={handleFolderCleared}
          currentFileId={currentFileId}
        />
        {shouldShowTooltip('files') && (
          <FocusTooltip show={true} isFocused={isFocused('files')} />
        )}
      </div>
      
      {/* Recording Panel */}
      <div 
        className={`flex-1 min-h-0 relative transition-all duration-200 ${
          isFocused('record') ? 'flex-[3] z-10' : ''
        }`}
        onMouseEnter={() => handlePanelHover('record')}
        onMouseLeave={handlePanelLeave}
        onClick={() => handlePanelClick('record')}
      >
        <RecordingPanel onInsertContent={(content: string) => insertContentRef.current?.(content)} />
        {shouldShowTooltip('record') && (
          <FocusTooltip show={true} isFocused={isFocused('record')} />
        )}
      </div>
    </div>
  )

  return (
    <div className="min-h-[100dvh] bg-neutral-50 font-mono">
      <div className="w-full h-[100dvh] p-2">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-2 h-full">
          {/* Desktop Sidebar - Hidden on tablet/mobile */}
          <div className="hidden lg:block lg:col-span-1 min-h-0 overflow-visible">
            {renderSidebarPanels()}
          </div>

          {/* Main Editor Panel */}
          <div className="col-span-1 lg:col-span-4 min-h-0">
            <Card className="h-full min-h-0 border-4 border-black shadow-[8px_8px_0px_0px_#000] bg-white">
              <CardHeader className="border-b-4 border-black bg-neutral-100">
                <CardTitle className="text-2xl font-black text-black flex items-center justify-between w-full">
                  <div className="flex items-center gap-3">
                    {/* Mobile Hamburger Menu */}
                    <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
                      <SheetTrigger asChild>
                        <Button 
                          size="sm" 
                          className="lg:hidden h-8 px-3 border-2 border-black shadow-[2px_2px_0px_0px_#000] bg-blue-400 hover:bg-blue-500 text-black font-black"
                        >
                          <Menu className="h-4 w-4" />
                        </Button>
                      </SheetTrigger>
                      <SheetContent 
                        side="left" 
                        className="w-[min(90vw,22rem)] border-4 border-black shadow-[8px_8px_0px_0px_#000] bg-white p-4"
                      >
                        <VisuallyHidden>
                          <SheetTitle>Navigation Menu</SheetTitle>
                        </VisuallyHidden>
                        <div className="h-full pt-4">
                          {renderSidebarPanels()}
                        </div>
                      </SheetContent>
                    </Sheet>
                    
                    <Star24 size={32} color="#000" />
                    BRUTAL NOTES
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Connectivity Status - subtle and contextual */}
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center">
                            {isOnline ? (
                              <Wifi size={16} className="text-green-600 mr-2" />
                            ) : (
                              <WifiOff size={16} className="text-red-600 mr-2" />
                            )}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="font-mono font-black">
                            {isOnline ? 'ONLINE' : 'OFFLINE'}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    {/* User Info */}
                    <div className="hidden sm:block text-sm font-bold text-gray-700 mr-2">
                      {user?.email}
                    </div>
                    
                    <TooltipProvider>
                      <ScanNotesPopover onCreateNote={handleScannedNotesGenerated} />
                    </TooltipProvider>

                    {/* Logout Button */}
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            onClick={() => signOut()}
                            className="border-2 border-black shadow-[2px_2px_0px_0px_#000] bg-red-400 hover:bg-red-500 text-black font-black brutal-hover h-8 px-4"
                            size="sm"
                          >
                            <LogOut className="h-4 w-4" />
                            <span className="hidden md:inline ml-2">Logout</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" avoidCollisions={false} sideOffset={4}>
                          <p className="font-mono font-black">SIGN OUT</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 h-[calc(100%-4rem)] relative overflow-hidden min-h-0">
                       {/* Rich Text Editor */}
                       <div className="h-full max-h-full overflow-hidden">
                         <BrutalEditor 
                           onFileSaved={handleFileSaved} 
                           onLoadFile={handleLoadFile}
                           onUnsavedChangesWarning={handleUnsavedChangesWarning}
                           onCurrentFileChange={handleCurrentFileChange}
                           currentFileId={currentFileId}
                           onInsertContent={(insertFn) => { insertContentRef.current = insertFn }}
                           onReplaceContent={(replaceFn) => { replaceContentRef.current = replaceFn ?? null }}
                         />
                       </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      
      {/* Unsaved Changes Dialog */}
      <UnsavedChangesDialog
        isOpen={showUnsavedDialog}
        onOpenChange={setShowUnsavedDialog}
        onSave={handleSaveAndContinue}
        onDiscard={handleDiscardAndContinue}
        onCancel={handleCancelAction}
        actionDescription={actionDescription}
      />
    </div>
  )
}
