"use client"

import { useState, useEffect, useCallback, memo } from "react"
import { $getSelection, $isRangeSelection } from "lexical"
import { $convertToMarkdownString } from "@lexical/markdown"
import { TRANSFORMERS } from "@lexical/markdown"

import { useToolbarContext } from "@/components/editor/context/toolbar-context"
import { Button } from "@/components/ui/button"
import Star28 from "@/components/stars/s28"
import { proofreadMarkdown, type ProofreaderAPI } from "@/lib/markdown-proofreader"

interface ProofreaderOptions {
  expectedInputLanguages?: string[]
  monitor?: (m: EventTarget) => void
}

interface ProofreadResult {
  correctedInput: string  // Changed from 'corrected' to 'correctedInput'
  corrections: {
    startIndex: number
    endIndex: number
    suggestion: string // Chrome API uses 'suggestion'
    type: string
    explanation?: string
  }[]
}

interface Proofreader {
  proofread: (text: string) => Promise<ProofreadResult>
}

declare global {
  interface Window {
    Proofreader?: {
      availability: () => Promise<'readily' | 'after-download' | 'no'>
      create: (options?: ProofreaderOptions) => Promise<Proofreader>
    }
  }
  
  const Proofreader: {
    availability: () => Promise<'readily' | 'after-download' | 'no'>
    create: (options?: ProofreaderOptions) => Promise<Proofreader>
  }
}

function isChromeWithProofreaderAPI(): boolean {
  // Feature detection as per docs: https://developer.chrome.com/docs/ai/proofreader-api
  if ('Proofreader' in self) {
    return true
  } else {
    return false
  }
}

function ProofreadToolbarPluginComponent({ onProofreadingResult }: { 
  onProofreadingResult?: (data: {
    originalText: string
    correctedText: string
    corrections?: {
      startIndex: number
      endIndex: number
      suggestion: string
      type: string
      explanation?: string
    }[]
  } | null) => void 
}) {
  const { activeEditor } = useToolbarContext()
  const [isSupported, setIsSupported] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [checkingSupport, setCheckingSupport] = useState(true)
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [availabilityStatus, setAvailabilityStatus] = useState<'readily' | 'after-download' | 'no' | null>(null)

  useEffect(() => {
    // Check if the Proofreader API is supported
    const checkSupport = async () => {
      setCheckingSupport(true)
      
      if (isChromeWithProofreaderAPI()) {
        try {
          // Use the method you specified: Proofreader.availability()
          const availability = await Proofreader.availability()
            .then(result => {
              console.log("Proofreader availability result:", result);
              return result;
            })
            .catch(err => {
              console.error("Error checking Proofreader availability:", err);
              return 'no' as const;
            });
          
          setAvailabilityStatus(availability as 'readily' | 'after-download' | 'no')
          
          if (availability === 'no') {
            setIsSupported(false)
          } else {
            setIsSupported(true)
          }
        } catch (error) {
          console.error("❌ Error checking Proofreader API availability:", error)
          setIsSupported(false)
        }
      } else {
        setIsSupported(false)
      }
      
      setCheckingSupport(false)
    }

    checkSupport()
  }, [])

  const handleProofread = useCallback(async () => {
    if (!isSupported || isLoading) return

    setIsLoading(true)
    
    try {
      // Get the current editor content as markdown
      const editorState = activeEditor.getEditorState()
      let markdownContent = ""
      
      editorState.read(() => {
        const selection = $getSelection()
        if ($isRangeSelection(selection) && !selection.isCollapsed()) {
          // For selections, we'll use plain text for now (markdown selection is complex)
          markdownContent = selection.getTextContent()
        } else {
          // Use entire document converted to markdown
          markdownContent = $convertToMarkdownString(TRANSFORMERS)
        }
      })

      if (!markdownContent.trim()) {
        alert("No content to proofread")
        setIsLoading(false)
        return
      }

      // Check if we need to download the model first
      if (availabilityStatus === 'after-download') {
        console.log("📥 Model needs to be downloaded first...")
        setIsDownloading(true)
        setDownloadProgress(0)
      }

      // Create the proofreader with download monitoring
      const proofreader = await Proofreader.create({
        expectedInputLanguages: ['en'],
        monitor(m) {
          m.addEventListener('downloadprogress', (e) => {
            const progressEvent = e as Event & { loaded: number }
            const progress = Math.round(progressEvent.loaded * 100)
            console.log(`📥 Downloaded ${progress}%`)
            setDownloadProgress(progress)
            
            if (progress >= 100) {
              setIsDownloading(false)
              console.log("✅ Model download completed!")
            }
          })
        }
      })

      // If we were downloading, mark as complete
      if (isDownloading) {
        setIsDownloading(false)
        setDownloadProgress(100)
      }

      console.log("🔍 Proofreading markdown content...")

      // Use the new markdown-aware proofreading system
      const result = await proofreadMarkdown(markdownContent, proofreader as ProofreaderAPI)

      // Send markdown-preserved result to parent component
      if (onProofreadingResult) {
        onProofreadingResult({
          originalText: result.originalMarkdown,
          correctedText: result.correctedMarkdown,
          corrections: result.blocks.flatMap(block => block.corrections || [])
        })
      } else {
        console.warn("No onProofreadingResult callback provided")
      }

      console.log("✅ Markdown proofreading completed successfully!");

    } catch (error) {
      console.error("❌ Error proofreading markdown:", error)
      alert("Failed to proofread content. Please try again.")
      setIsDownloading(false)
    } finally {
      setIsLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSupported, isLoading, availabilityStatus])

  // Show loading state while checking support
  if (checkingSupport) {
    return (
      <Button
        disabled={true}
        title="Checking AI API availability..."
        aria-label="Checking"
        size="sm"
        className="!h-8 flex items-center gap-1 px-2 opacity-50"
      >
        <Star28
          className="text-green-500 dark:text-green-400 animate-spin"
          pathClassName="stroke-black dark:stroke-white"
          size={16}
          strokeWidth={2}
        />
        <span className="text-xs font-black">Checking...</span>
      </Button>
    )
  }

  // Only render the button if the API is supported (Chrome with Proofreader API)
  // TEMPORARY: Show button for debugging even if API not supported
  if (!isSupported) {
    // Temporarily render a disabled button for debugging
    return (
      <Button
        disabled={true}
        title="Proofread (API not available)"
        aria-label="Proofread"
        size="sm"
        className="!h-8 flex items-center gap-1 px-2 opacity-50"
      >
        <Star28
          className="text-green-500 dark:text-green-400"
          pathClassName="stroke-black dark:stroke-white"
          size={16}
          strokeWidth={2}
        />
        <span className="text-xs font-black">No AI API</span>
      </Button>
    )
  }

  // Show different button states based on what's happening
  const getButtonContent = () => {
    if (isDownloading) {
      return {
        icon: <Star28
          className="text-green-500 dark:text-green-400 animate-pulse"
          pathClassName="stroke-black dark:stroke-white"
          size={16}
          strokeWidth={2}
        />,
        text: `Downloading... ${downloadProgress}%`,
        title: `Downloading AI model: ${downloadProgress}%`
      }
    }
    
    if (isLoading) {
      return {
        icon: <Star28
          className="text-green-500 dark:text-green-400 animate-spin"
          pathClassName="stroke-black dark:stroke-white"
          size={16}
          strokeWidth={2}
        />,
        text: "Proofreading...",
        title: "Proofreading your text..."
      }
    }
    
    // Show different text based on availability status
    if (availabilityStatus === 'after-download') {
      return {
        icon: <Star28
          className="text-green-500 dark:text-green-400"
          pathClassName="stroke-black dark:stroke-white"
          size={16}
          strokeWidth={2}
        />,
        text: "Proofread*",
        title: "Proofread your text using AI (will download model first time)"
      }
    }
    
    return {
      icon: <Star28
        className="text-green-500 dark:text-green-400"
        pathClassName="stroke-black dark:stroke-white"
        size={16}
        strokeWidth={2}
      />,
      text: "Proofread",
      title: "Proofread your text using AI"
    }
  }

  const buttonContent = getButtonContent()

  return (
    <Button
      disabled={isLoading || isDownloading}
      onClick={handleProofread}
      title={buttonContent.title}
      aria-label="Proofread"
      size="sm"
      className="!h-8 flex items-center gap-1 px-2"
    >
      {buttonContent.icon}
      <span className="text-xs font-black">
        {buttonContent.text}
      </span>
    </Button>
  )
}

// Export memoized version to prevent unnecessary re-renders
export const ProofreadToolbarPlugin = memo(function ProofreadToolbarPlugin(props: { 
  onProofreadingResult?: (data: {
    originalText: string
    correctedText: string
    corrections?: {
      startIndex: number
      endIndex: number
      suggestion: string
      type: string
      explanation?: string
    }[]
  } | null) => void 
}) {
  return <ProofreadToolbarPluginComponent {...props} />
})
