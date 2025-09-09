// Dialog component to warn users about unsaved changes
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { AlertTriangle, Save, Trash2, X } from "lucide-react"

interface UnsavedChangesDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onSave: () => Promise<void>
  onDiscard: () => void
  onCancel: () => void
  actionDescription: string // e.g., "switch to another file", "create a new file"
}

export function UnsavedChangesDialog({
  isOpen,
  onOpenChange,
  onSave,
  onDiscard,
  onCancel,
  actionDescription
}: UnsavedChangesDialogProps) {
  const handleSave = async () => {
    await onSave()
    onOpenChange(false)
  }

  const handleDiscard = () => {
    onDiscard()
    onOpenChange(false)
  }

  const handleCancel = () => {
    onCancel()
    onOpenChange(false)
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="border-4 border-black shadow-[8px_8px_0px_0px_#000] bg-white max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-xl font-black text-black">
            <AlertTriangle className="h-6 w-6 text-orange-500" />
            UNSAVED CHANGES
          </DialogTitle>
          <DialogDescription className="text-black font-mono mt-3">
            You have unsaved changes in the current note. What would you like to do before you {actionDescription}?
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-col gap-3 mt-6">
          <Button
            onClick={handleSave}
            className="w-full border-2 border-black shadow-[2px_2px_0px_0px_#000] bg-green-400 hover:bg-green-500 text-black font-black brutal-hover"
          >
            <Save className="h-4 w-4 mr-2" />
            SAVE CHANGES
          </Button>
          
          <Button
            onClick={handleDiscard}
            variant="outline"
            className="w-full border-2 border-black shadow-[2px_2px_0px_0px_#000] bg-red-400 hover:bg-red-500 text-black font-black brutal-hover"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            DISCARD CHANGES
          </Button>
          
          <Button
            onClick={handleCancel}
            variant="outline"
            className="w-full border-2 border-black shadow-[2px_2px_0px_0px_#000] bg-gray-300 hover:bg-gray-400 text-black font-black brutal-hover"
          >
            <X className="h-4 w-4 mr-2" />
            CANCEL
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
