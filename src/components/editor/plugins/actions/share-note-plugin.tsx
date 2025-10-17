// Share Note Plugin - Generate shareable URLs with encoded content

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { $convertToMarkdownString } from "@lexical/markdown"
import { TRANSFORMERS } from "@lexical/markdown"
import { Share } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCallback } from "react"
import { encodeContent, showShareToast, showEmptyNoteToast } from "@/lib/share-utils"

export function ShareNotePlugin() {
  const [editor] = useLexicalComposerContext()

  const handleShare = useCallback(() => {
    editor.read(() => {
      try {
        // Get the markdown content from the editor using proper transformers
        const markdownContent = $convertToMarkdownString(TRANSFORMERS)
        
        if (!markdownContent.trim()) {
          showEmptyNoteToast()
          return
        }

        // Encode the content
        const encodedContent = encodeContent(markdownContent)
        
        if (!encodedContent) {
          console.error('Failed to encode content for sharing')
          return
        }

        // Generate the shareable URL
        const baseUrl = window.location.origin + window.location.pathname
        const shareUrl = `${baseUrl}#doc=${encodedContent}`

        // Copy to clipboard
        navigator.clipboard.writeText(shareUrl).then(() => {
          showShareToast()
        }).catch((error) => {
          console.error('Failed to copy to clipboard:', error)
          // Fallback: show the URL in a temporary input for manual copying
          const input = document.createElement('input')
          input.value = shareUrl
          document.body.appendChild(input)
          input.select()
          document.execCommand('copy')
          document.body.removeChild(input)
          showShareToast()
        })

      } catch (error) {
        console.error('Error sharing note:', error)
      }
    })
  }, [editor])

  return (
    <Button
      variant="default"
      size="sm"
      onClick={handleShare}
      className="gap-1.5 border-2 border-black bg-white text-black shadow-[2px_2px_0px_0px_#000] hover:translate-x-1 hover:translate-y-1 hover:shadow-none font-black disabled:opacity-50 disabled:bg-gray-200"
      title="Share note via URL"
    >
      <Share className="w-4 h-4" />
      <span className="hidden sm:inline">Share</span>
    </Button>
  )
}
