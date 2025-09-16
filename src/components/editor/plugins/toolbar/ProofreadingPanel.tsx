import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { CheckIcon, XIcon, CopyIcon, AlertTriangleIcon, EyeIcon, CodeIcon } from "lucide-react"
import ReactMarkdown from "react-markdown"

interface ProofreadingPanelProps {
  originalText?: string
  correctedText: string
  corrections?: {
    startIndex: number
    endIndex: number
    suggestion: string
    type: string
    explanation?: string
  }[]
  onAccept: () => void
  onReject: () => void
  onClose: () => void
}

export function ProofreadingPanel({
  correctedText,
  onAccept,
  onReject,
  onClose
}: ProofreadingPanelProps) {
  const [copiedFeedback, setCopiedFeedback] = useState(false)
  const [viewMode, setViewMode] = useState<'text' | 'preview'>('text')

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(correctedText)
      setCopiedFeedback(true)
      setTimeout(() => setCopiedFeedback(false), 2000)
    } catch (error) {
      console.error("Failed to copy text:", error)
    }
  }

  // Check if the text appears to be markdown
  const isMarkdown = (text: string) => {
    const markdownPatterns = [
      /^#{1,6}\s/m, // Headers
      /\*\*.*?\*\*/g, // Bold
      /\*.*?\*/g, // Italic
      /\[.*?\]\(.*?\)/g, // Links
      /^[-*+]\s/m, // Lists
      /`.*?`/g, // Inline code
      /^```/m, // Code blocks
      /^\d+\.\s/m, // Numbered lists
    ]
    return markdownPatterns.some(pattern => pattern.test(text))
  }

  const hasMarkdown = isMarkdown(correctedText)

  const renderDiffView = () => {
    if (!hasMarkdown) {
      // Simple corrected text view only for non-markdown
      return (
        <div className="space-y-4">
          <div>
            <div className="bg-green-50 border border-green-200 rounded-md p-3 text-sm text-green-800 font-medium">
              {correctedText}
            </div>
          </div>
        </div>
      )
    }

    // Enhanced view with tabs for markdown content
    return (
      <div className="space-y-4">
        {/* Tab Navigation */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setViewMode('text')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              viewMode === 'text'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <CodeIcon className="w-4 h-4 inline mr-2" />
            Corrected Text
          </button>
          <button
            onClick={() => setViewMode('preview')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              viewMode === 'preview'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <EyeIcon className="w-4 h-4 inline mr-2" />
            Markdown Preview
          </button>
        </div>

        {/* Content Area */}
        <div className="min-h-[120px]">
          {viewMode === 'text' ? (
            <div className="bg-green-50 border border-green-200 rounded-md p-3 text-sm text-green-800 font-mono whitespace-pre-wrap">
              {correctedText}
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-md p-4 prose prose-sm max-w-none">
              <ReactMarkdown>{correctedText}</ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <Card className="border-t border-gray-200 bg-white">
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-700 flex items-center gap-2">
            🔍 Proofreading Results
          </h3>
          <Button
            size="sm"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 bg-transparent border-none"
          >
            <XIcon className="w-4 h-4" />
          </Button>
        </div>

        {/* Info Message */}
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-md p-3 flex items-start gap-2">
          <AlertTriangleIcon className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-blue-800">
            <span className="font-medium">Smart Proofreading:</span> This preserves your markdown formatting (headers, lists, links, bold text, etc.) while correcting grammar and spelling.
          </p>
        </div>

        {/* Content */}
        <div className="space-y-4">
          {renderDiffView()}

          <Separator />

          {/* Actions */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Button
                onClick={onAccept}
                className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2"
                size="sm"
              >
                <CheckIcon className="w-4 h-4" />
                Accept Changes
              </Button>
              <Button
                onClick={onReject}
                className="border border-red-200 text-red-600 hover:bg-red-50 flex items-center gap-2"
                size="sm"
              >
                <XIcon className="w-4 h-4" />
                Reject
              </Button>
            </div>

            <Button
              onClick={handleCopy}
              className="border border-gray-200 bg-white hover:bg-gray-50 flex items-center gap-2"
              size="sm"
            >
              <CopyIcon className="w-4 h-4" />
              {copiedFeedback ? "Copied!" : "Copy Text"}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  )
}
