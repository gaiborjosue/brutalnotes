import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { TodoPanel } from "./TodoPanel"
import { FileSystemPanel } from "./FileSystemPanel"
import { PomodoroPanel } from "./PomodoroPanel"
import { BrutalEditor } from "./BrutalEditor"
import { useRef, useState, useCallback } from "react"
import { NoteService } from "@/lib/database-service"
import { Camera, Menu } from "lucide-react"
import Star24 from "@/components/stars/s24"

export function MainLayout() {
  const fileSystemRef = useRef<{ refreshFileTree: () => Promise<void> } | null>(null)
  const [loadFileContent, setLoadFileContent] = useState<((content: string, fileId: number) => void) | null>(null)
  const [isSheetOpen, setIsSheetOpen] = useState(false)

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

  const handleFileClick = async (noteId: number) => {
    // Load file content into editor
    if (loadFileContent) {
      try {
        const result = await NoteService.getNoteById(noteId)
        if (result.success && result.data) {
          loadFileContent(result.data.content, noteId)
        } else {
          console.error('Failed to load file:', result.error)
        }
      } catch (error) {
        console.error('Error loading file:', error)
      }
    }
  }

  const renderSidebarPanels = () => (
    <div className="space-y-4 h-full">
      {/* Todo Panel */}
      <div className="h-[calc(33.333%-0.5rem)]">
        <TodoPanel />
      </div>
      
      {/* File System Panel */}
      <div className="h-[calc(33.333%-0.5rem)]">
        <FileSystemPanel ref={fileSystemRef} onFileClick={handleFileClick} />
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
                        <div className="h-full pt-4">
                          {renderSidebarPanels()}
                        </div>
                      </SheetContent>
                    </Sheet>
                    
                    <Star24 size={32} color="#000" />
                    BRUTAL NOTES
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
                          <span className="hidden sm:inline ml-2">Scan Notes</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="font-mono font-black">PAPER → DIGITAL</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 h-[calc(100%-5rem)] relative overflow-hidden">
                       {/* Rich Text Editor */}
                       <div className="h-full max-h-full overflow-hidden">
                         <BrutalEditor onFileSaved={handleFileSaved} onLoadFile={handleLoadFile} />
                       </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

