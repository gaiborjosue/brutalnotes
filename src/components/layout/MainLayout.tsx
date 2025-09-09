import { useEffect, useRef, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { VisuallyHidden } from "@/components/ui/visually-hidden"
import { TodoPanel } from "./TodoPanel"
import { FileSystemPanel } from "./FileSystemPanel"
import { PomodoroPanel } from "./PomodoroPanel"
import { BrutalEditor } from "./BrutalEditor"
import { UnsavedChangesDialog } from "@/components/editor/editor-ui/unsaved-changes-dialog"
import { NoteService } from "@/lib/database-service"
import { Camera, Menu, LogOut, Wifi, WifiOff } from "lucide-react"
import Star24 from "@/components/stars/s24"
import { useAuth } from "@/contexts/AuthContext"

export function MainLayout() {
  const { user, signOut } = useAuth()
  const fileSystemRef = useRef<{ refreshFileTree: () => Promise<void> } | null>(null)
  const [loadFileContent, setLoadFileContent] = useState<((content: string, fileId: number) => void) | null>(null)
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [currentFileId, setCurrentFileId] = useState<number | null>(null)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  
  
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

  const handleCameraCapture = () => {
    alert("📸 Camera feature coming soon! This will allow you to capture paper notes and convert them to digital text.")
  }

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

  // Handle auto-saved file changes to track current file
  const handleAutoSavedFileChange = useCallback((fileId: number | null) => {
    if (fileId) {
      setCurrentFileId(fileId) // Track auto-saved files as current
      // Refresh file tree to show the newly created auto-saved file
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
  const checkUnsavedChanges = (action: () => void, description: string) => {
    if (hasUnsavedChanges && unsavedSaveFunction) {
      setPendingAction(() => action)
      setActionDescription(description)
      setShowUnsavedDialog(true)
      return false // Action blocked
    }
    action()
    return true // Action performed
  }

  const handleFileClick = async (noteId: number) => {
    const loadFile = async () => {
      // Load file content into editor
      if (loadFileContent) {
        try {
          const result = await NoteService.getNoteById(noteId)
          if (result.success && result.data) {
            loadFileContent(result.data.content, noteId)
            setCurrentFileId(noteId) // Track the currently opened file
          } else {
            console.error('Failed to load file:', result.error)
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
    <div className="space-y-4 h-full">
      {/* Todo Panel */}
      <div className="h-[calc(33.333%-0.5rem)]">
        <TodoPanel />
      </div>
      
      {/* File System Panel */}
      <div className="h-[calc(33.333%-0.5rem)]">
        <FileSystemPanel 
          ref={fileSystemRef} 
          onFileClick={handleFileClick}
          onNewFileClick={(createFileAction) => {
            checkUnsavedChanges(createFileAction, "create a new file")
          }}
          onFileDeleted={handleFileDeleted}
          onFolderCleared={handleFolderCleared}
          currentFileId={currentFileId}
        />
      </div>
      
      {/* Pomodoro Panel */}
      <div className="h-[calc(33.333%-0.5rem)]">
        <PomodoroPanel />
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-neutral-50 font-mono">
      <div className="w-full">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-2 h-screen p-2">
          {/* Desktop Sidebar - Hidden on tablet/mobile */}
          <div className="hidden lg:block lg:col-span-1 space-y-2 overflow-hidden">
            {renderSidebarPanels()}
          </div>

          {/* Main Editor Panel */}
          <div className="col-span-1 lg:col-span-4">
            <Card className="h-full border-4 border-black shadow-[8px_8px_0px_0px_#000] bg-white">
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
                        className="w-96 border-4 border-black shadow-[8px_8px_0px_0px_#000] bg-white p-4"
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
                            {isOnline ? "ONLINE - Auto-sync active" : "OFFLINE - Changes saved locally"}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    {/* User Info */}
                    <div className="hidden sm:block text-sm font-bold text-gray-700 mr-2">
                      {user?.email}
                    </div>
                    
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            onClick={handleCameraCapture}
                            className="border-2 border-black shadow-[2px_2px_0px_0px_#000] bg-purple-400 hover:bg-purple-500 text-black font-black brutal-hover h-8 px-4"
                            size="sm"
                          >
                            <Camera className="h-4 w-4" />
                            <span className="hidden md:inline ml-2">Scan Notes</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="font-mono font-black">PAPER → DIGITAL</p>
                        </TooltipContent>
                      </Tooltip>
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
                        <TooltipContent>
                          <p className="font-mono font-black">SIGN OUT</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 h-[calc(100%-5rem)] relative overflow-hidden">
                       {/* Rich Text Editor */}
                       <div className="h-full max-h-full overflow-hidden">
                         <BrutalEditor 
                           onFileSaved={handleFileSaved} 
                           onLoadFile={handleLoadFile}
                           onUnsavedChangesWarning={handleUnsavedChangesWarning}
                           onAutoSavedFileChange={handleAutoSavedFileChange}
                           currentFileId={currentFileId}
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

