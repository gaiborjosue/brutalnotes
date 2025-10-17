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
import { decodeContent } from "@/lib/share-utils"
import { Menu, LogOut, UserRound, Wifi, WifiOff } from "lucide-react"
import Star24 from "@/components/stars/s24"
import { useAuth } from "@/contexts/AuthContext"
import { ScanNotesPopover } from "@/features/scan-notes/ScanNotesPopover"
import { TourStep, TourProvider } from "@/components/guided-tour"

export function MainLayout() {
  const { user, signOut } = useAuth()
  const { getNoteById } = useNotes()
  const fileSystemRef = useRef<{ refreshFileTree: () => Promise<void> } | null>(null)
  const [loadFileContent, setLoadFileContent] = useState<((content: string, fileId: number) => void) | null>(null)
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [currentFileId, setCurrentFileId] = useState<number | null>(null)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [isFreshSignup, setIsFreshSignup] = useState(false)
  const [activeMobilePanel, setActiveMobilePanel] = useState<'todo' | 'files' | 'record' | null>(null)
  
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
  const loadSharedMarkdownRef = useRef<((markdown: string) => void) | null>(null)
  
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

  // Check if user is a fresh signup (haven't completed the tour)
  useEffect(() => {
    if (user) {
      const tourCompleted = localStorage.getItem(`brutal-notes-tour-completed-${user.id}`)
      setIsFreshSignup(!tourCompleted)
    }
  }, [user])

  // Handle tour completion
  const handleTourComplete = useCallback(() => {
    if (user) {
      localStorage.setItem(`brutal-notes-tour-completed-${user.id}`, 'true')
      setIsFreshSignup(false)
    }
  }, [user])

  // Handle shared URLs with encoded content
  useEffect(() => {
    const handleSharedContent = () => {
      const hash = window.location.hash
      if (hash.startsWith('#doc=')) {
        const encodedContent = hash.substring(5) // Remove '#doc=' prefix
        const decodedContent = decodeContent(encodedContent)
        
        if (decodedContent) {
          // Set the decoded markdown content for the editor
          // Use the dedicated shared markdown loader which forces markdown parsing
          if (loadSharedMarkdownRef.current) {
            loadSharedMarkdownRef.current(decodedContent)
          }
          // Clear the hash to clean up the URL
          window.history.replaceState(null, '', window.location.pathname)
          
          // Show a toast to indicate shared content was loaded
          const toast = document.createElement('div')
          toast.className = `
            fixed top-4 right-4 z-50 max-w-sm w-full
            bg-blue-500/80 backdrop-blur-sm text-white
            px-4 py-3 rounded-lg shadow-lg
            border border-blue-300/20
            font-mono text-sm font-bold
            animate-in slide-in-from-top-2 duration-300
          `
          toast.innerHTML = `
            <div class="flex items-center gap-2">
              <svg class="w-4 h-4 text-blue-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              <span>Shared note loaded</span>
            </div>
          `
          
          document.body.appendChild(toast)
          
          setTimeout(() => {
            toast.style.animation = 'fade-out 300ms ease-out forwards'
            setTimeout(() => {
              document.body.removeChild(toast)
            }, 300)
          }, 3000)
        }
      }
    }

    // Handle on mount
    handleSharedContent()
    
    // Handle hash changes (if user navigates to shared URL while app is open)
    window.addEventListener('hashchange', handleSharedContent)
    
    return () => {
      window.removeEventListener('hashchange', handleSharedContent)
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

  const handleMobilePanelToggle = (panel: 'todo' | 'files' | 'record') => {
    setActiveMobilePanel(prev => (prev === panel ? null : panel))
  }

  const renderSidebarPanels = (isMobileVariant = false) => (
    <div className={`flex flex-col ${isMobileVariant ? 'gap-2' : 'gap-2'} ${isMobileVariant ? 'h-auto' : 'h-full min-h-0'}`}>
      {/* Todo Panel */}
      <div 
        className={`relative transition-all duration-200 ${
          isMobileVariant
            ? 'flex-none w-full'
            : `flex-1 min-h-0 ${isFocused('todo') ? 'flex-[3] z-10' : ''}`
        } ${
          isMobileVariant && activeMobilePanel === 'todo' ? 'z-10' : isMobileVariant ? 'opacity-80' : ''
        }`}
        onMouseEnter={!isMobileVariant ? () => handlePanelHover('todo') : undefined}
        onMouseLeave={!isMobileVariant ? handlePanelLeave : undefined}
        onClick={!isMobileVariant ? () => handlePanelClick('todo') : undefined}
      >
        <TourStep
          id="todo-panel"
          title="TODO Panel"
          content="This is your TODO panel where you can manage your tasks and keep track of what needs to be done. Click on it or use Ctrl+hover to expand it."
          position="right"
          order={1}
        >
          <TodoPanel
            collapsed={isMobileVariant ? activeMobilePanel !== 'todo' : false}
            onToggle={isMobileVariant ? () => handleMobilePanelToggle('todo') : undefined}
            className={isMobileVariant && activeMobilePanel === 'todo' ? 'min-h-[55vh] max-h-[75vh]' : undefined}
          />
        </TourStep>
        {!isMobileVariant && shouldShowTooltip('todo') && (
          <FocusTooltip show={true} isFocused={isFocused('todo')} />
        )}
      </div>
      
      {/* File System Panel */}
      <div 
        className={`relative transition-all duration-200 ${
          isMobileVariant
            ? 'flex-none w-full'
            : `flex-1 min-h-0 ${isFocused('files') ? 'flex-[3] z-10' : ''}`
        } ${
          isMobileVariant && activeMobilePanel === 'files' ? 'z-10' : isMobileVariant ? 'opacity-80' : ''
        }`}
        onMouseEnter={!isMobileVariant ? () => handlePanelHover('files') : undefined}
        onMouseLeave={!isMobileVariant ? handlePanelLeave : undefined}
        onClick={!isMobileVariant ? () => handlePanelClick('files') : undefined}
      >
        <TourStep
          id="files-panel"
          title="Files Panel"
          content="This is your Files panel where you can manage your notes and documents. Create new files, organize them into folders, and access your existing notes. Click on it or use Ctrl+hover to expand it."
          position="right"
          order={2}
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
            collapsed={isMobileVariant ? activeMobilePanel !== 'files' : false}
            onToggle={isMobileVariant ? () => handleMobilePanelToggle('files') : undefined}
            className={isMobileVariant && activeMobilePanel === 'files' ? 'min-h-[55vh] max-h-[75vh]' : undefined}
          />
        </TourStep>
        {!isMobileVariant && shouldShowTooltip('files') && (
          <FocusTooltip show={true} isFocused={isFocused('files')} />
        )}
      </div>
      
      {/* Recording Panel */}
      <div 
        className={`relative transition-all duration-200 ${
          isMobileVariant
            ? 'flex-none w-full'
            : `flex-1 min-h-0 ${isFocused('record') ? 'flex-[3] z-10' : ''}`
        } ${
          isMobileVariant && activeMobilePanel === 'record' ? 'z-10' : isMobileVariant ? 'opacity-80' : ''
        }`}
        onMouseEnter={!isMobileVariant ? () => handlePanelHover('record') : undefined}
        onMouseLeave={!isMobileVariant ? handlePanelLeave : undefined}
        onClick={!isMobileVariant ? () => handlePanelClick('record') : undefined}
      >
        <TourStep
          id="record-panel"
          title="Recording Panel"
          content="This is your Recording panel where you can record audio notes and convert them to text. Great for capturing ideas on the go! Click on it or use Ctrl+hover to expand it."
          position="right"
          order={3}
        >
          <RecordingPanel
            onInsertContent={(content: string) => insertContentRef.current?.(content)}
            collapsed={isMobileVariant ? activeMobilePanel !== 'record' : false}
            onToggle={isMobileVariant ? () => handleMobilePanelToggle('record') : undefined}
            className={isMobileVariant && activeMobilePanel === 'record' ? 'min-h-[55vh] max-h-[75vh]' : undefined}
          />
        </TourStep>
        {!isMobileVariant && shouldShowTooltip('record') && (
          <FocusTooltip show={true} isFocused={isFocused('record')} />
        )}
      </div>
    </div>
  )

  return (
    <TourProvider
      autoStart={isFreshSignup}
      shouldStart={isFreshSignup}
      onTourComplete={handleTourComplete}
      storageKey={`brutal-notes-tour-completed-${user?.id}`}
    >
      <div className="min-h-[100dvh] bg-neutral-50 font-mono">
        <div className="w-full h-[100dvh] p-2">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-2 h-full">
            {/* Desktop Sidebar - Hidden on tablet/mobile */}
            <div className="hidden lg:block lg:col-span-1 min-h-0 overflow-visible">
              {renderSidebarPanels()}
            </div>

            {/* Main Editor Panel */}
            <div className="col-span-1 lg:col-span-4 min-h-0">
              <TourStep
                id="main-editor"
                title="Main Editor"
                content="This is your main editor where the magic happens! Write, format, and organize your notes with our powerful rich text editor. It supports markdown, code blocks, and much more."
                position="left"
                order={5}
              >
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
                              {renderSidebarPanels(true)}
                            </div>
                          </SheetContent>
                        </Sheet>
                        
                        <Star24 size={32} color="#000" />
                        BRUTAL NOTE
                      </div>
                      <div className="flex items-center gap-2">
                        {/* Connectivity Status - subtle and contextual */}
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center">
                                {isOnline ? (
                                  <Wifi className="mr-2 h-6 w-6 text-green-600" />
                                ) : (
                                  <WifiOff className="mr-2 h-6 w-6 text-red-600" />
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
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="hidden sm:inline-flex items-center justify-center mr-2">
                                <UserRound className="h-6 w-6 text-gray-700" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" avoidCollisions={false} sideOffset={4}>
                              <p className="font-mono font-black">
                                {user?.email ?? "No email"}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        
                        <TooltipProvider>
                          <TourStep
                            id="scan-notes-button"
                            title="Scan Notes"
                            content="Use this button to scan handwritten notes or documents and convert them to digital text. Perfect for digitizing your physical notes!"
                            position="bottom"
                            order={4}
                          >
                            <ScanNotesPopover onCreateNote={handleScannedNotesGenerated} />
                          </TourStep>
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
                               onLoadSharedMarkdown={(loadMarkdownFn) => { loadSharedMarkdownRef.current = loadMarkdownFn ?? null }}
                             />
                           </div>
                  </CardContent>
                </Card>
              </TourStep>
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
    </TourProvider>
  )
}
