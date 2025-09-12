"use client"

import { useState, useEffect, useCallback } from "react"
import { $getRoot } from "lexical"
import { $createCollapsibleContainerNode } from "@/components/editor/nodes/collapsible-container-node"
import { $createCollapsibleTitleNode } from "@/components/editor/nodes/collapsible-title-node"
import { $createCollapsibleContentNode } from "@/components/editor/nodes/collapsible-content-node"
import { $createParagraphNode, $createTextNode } from "lexical"

import { useToolbarContext } from "@/components/editor/context/toolbar-context"
import { Button } from "@/components/ui/button"
import Star8 from "@/components/stars/s8"

interface SummarizerOptions {
  type?: 'key-points' | 'tl;dr' | 'teaser' | 'headline'
  format?: 'markdown' | 'plain-text'
  length?: 'short' | 'medium' | 'long'
}

interface SummarizeOptions {
  context?: string
}

interface Summarizer {
  summarize: (text: string, options?: SummarizeOptions) => Promise<string>
}

declare global {
  interface Window {
    Summarizer?: {
      availability: () => Promise<'readily' | 'after-download' | 'no'>
      create: (options?: SummarizerOptions) => Promise<Summarizer>
    }
  }
  
  const Summarizer: {
    availability: () => Promise<'readily' | 'after-download' | 'no'>
    create: (options?: SummarizerOptions) => Promise<Summarizer>
  }
}

function isChromeWithSummarizerAPI(): boolean {
  console.log("🔍 Checking for Summarizer API support...")
  
  // Feature detection as per docs: https://developer.chrome.com/docs/ai/summarizer-api
  if ('Summarizer' in self) {
    console.log("✅ Summarizer API is supported")
    return true
  } else {
    console.log("❌ Summarizer API is not supported")
    return false
  }
}

export function SummarizeToolbarPlugin() {
  const { activeEditor } = useToolbarContext()
  const [isSupported, setIsSupported] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [checkingSupport, setCheckingSupport] = useState(true)

  console.log("🔧 SummarizeToolbarPlugin rendered, isSupported:", isSupported, "checkingSupport:", checkingSupport)

  useEffect(() => {
    // Check if the Summarizer API is supported
    const checkSupport = async () => {
      console.log("🚀 Starting API support check...")
      setCheckingSupport(true)
      
      if (isChromeWithSummarizerAPI()) {
        try {
          console.log("📡 Calling Summarizer.availability()...")
          const availability = await Summarizer.availability()
          console.log("📊 API availability response:", availability)
          
          if (availability === 'no') {
            console.log("❌ Summarizer API isn't usable")
            setIsSupported(false)
          } else {
            console.log("✅ Summarizer API is available:", availability)
            setIsSupported(true)
          }
        } catch (error) {
          console.error("❌ Error checking availability:", error)
          setIsSupported(false)
        }
      } else {
        console.log("❌ Summarizer not supported in this browser")
        setIsSupported(false)
      }
      
      setCheckingSupport(false)
      console.log("🏁 API support check completed")
    }

    checkSupport()
  }, [])

  const handleSummarize = useCallback(async () => {
    if (!isSupported || isLoading) return

    setIsLoading(true)
    
    try {
      // Get the current editor content
      const editorState = activeEditor.getEditorState()
      let textContent = ""
      
      editorState.read(() => {
        const root = $getRoot()
        textContent = root.getTextContent()
      })

      if (!textContent.trim()) {
        alert("No content to summarize")
        setIsLoading(false)
        return
      }

      // Create the summarizer
      const summarizer = await Summarizer.create({
        type: 'key-points',
        format: 'plain-text',
        length: 'medium'
      })

      // Generate summary
      const summary = await summarizer.summarize(textContent, {
        context: 'This is a note or document that needs to be summarized for quick reference.'
      })

      // Insert the summary at the top of the document
      activeEditor.update(() => {
        const root = $getRoot()
        
        // Create collapsible container for the summary
        const collapsibleContainer = $createCollapsibleContainerNode(true) // true means it starts open
        
        // Create title node
        const titleNode = $createCollapsibleTitleNode()
        const titleParagraph = $createParagraphNode()
        const titleText = $createTextNode("Summary of your note:")
        titleParagraph.append(titleText)
        titleNode.append(titleParagraph)
        
        // Create content node with the summary
        const contentNode = $createCollapsibleContentNode()
        const summaryParagraph = $createParagraphNode()
        const summaryText = $createTextNode(summary)
        summaryParagraph.append(summaryText)
        contentNode.append(summaryParagraph)
        
        // Append title and content to container
        collapsibleContainer.append(titleNode, contentNode)
        
        // Insert at the beginning of the document
        const firstChild = root.getFirstChild()
        if (firstChild) {
          firstChild.insertBefore(collapsibleContainer)
        } else {
          root.append(collapsibleContainer)
        }
      })

    } catch (error) {
      console.error("Error generating summary:", error)
      alert("Failed to generate summary. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }, [activeEditor, isSupported, isLoading])

  // Show loading state while checking support
  if (checkingSupport) {
    console.log("⏳ Still checking support...")
    return (
      <Button
        disabled={true}
        title="Checking AI API availability..."
        aria-label="Checking"
        size="sm"
        className="!h-8 flex items-center gap-1 px-2 opacity-50"
      >
        <Star8
          className="text-red-500 dark:text-blue-500"
          pathClassName="stroke-black dark:stroke-white"
          size={16}
          strokeWidth={2}
        />
        <span className="text-xs font-black">Checking...</span>
      </Button>
    )
  }

  // Only render the button if the API is supported (Chrome with Summarizer API)
  // TEMPORARY: Show button for debugging even if API not supported
  if (!isSupported) {
    console.log("🚫 Button not rendered - API not supported")
    // Temporarily render a disabled button for debugging
    return (
      <Button
        disabled={true}
        title="Summarize (API not available)"
        aria-label="Summarize"
        size="sm"
        className="!h-8 flex items-center gap-1 px-2 opacity-50"
      >
        <Star8
          className="text-red-500 dark:text-blue-500"
          pathClassName="stroke-black dark:stroke-white"
          size={16}
          strokeWidth={2}
        />
        <span className="text-xs font-black">No AI API</span>
      </Button>
    )
  }

  console.log("✅ Rendering summarize button!")

  return (
    <Button
      disabled={isLoading}
      onClick={handleSummarize}
      title="Summarize your note using AI"
      aria-label="Summarize"
      size="sm"
      className="!h-8 flex items-center gap-1 px-2"
    >
      <Star8
        className="text-red-500 dark:text-blue-500"
        pathClassName="stroke-black dark:stroke-white"
        size={16}
        strokeWidth={2}
      />
      <span className="text-xs font-black">
        {isLoading ? "Summarizing..." : "Summarize"}
      </span>
    </Button>
  )
}
