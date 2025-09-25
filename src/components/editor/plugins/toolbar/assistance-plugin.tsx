/* eslint-disable @typescript-eslint/no-unused-vars */
"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Bot } from "lucide-react"
import { $getRoot } from "lexical"
import { $convertToMarkdownString } from "@lexical/markdown"
import { TRANSFORMERS } from "@lexical/markdown"

import { useToolbarContext } from "@/components/editor/context/toolbar-context"
import { $createCollapsibleContainerNode } from "@/components/editor/nodes/collapsible-container-node"
import { $createCollapsibleTitleNode } from "@/components/editor/nodes/collapsible-title-node"
import { $createCollapsibleContentNode } from "@/components/editor/nodes/collapsible-content-node"
import { $createParagraphNode, $createTextNode } from "lexical"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger } from "@/components/ui/select"
import Star28 from "@/components/stars/s28"
import { proofreadMarkdown, type ProofreaderAPI } from "@/lib/markdown-proofreader"
import { showProcessingToast } from "@/lib/share-utils"
import AIDetectionService, { type AIDetectionResponse } from "@/lib/ai-detection-service"

// Assistance dropdown that groups Summarize, Proofread, and Detect AI actions
export function AssistancePlugin({ 
  onProofreadingResult,
  onAIDetectionResult 
}: { 
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
  onAIDetectionResult?: (result: AIDetectionResponse | null) => void
}) {
  const summarize = useSummarizeAction()
  const { handleProofread, proofreaderSupported, busy: proofreaderBusy } = useProofreadAction(onProofreadingResult)
  const { handleAIDetection, busy: aiDetectionBusy } = useAIDetectionAction(onAIDetectionResult)

  // Disable select interaction while any action is busy
  const isDisabled = summarize.busy || proofreaderBusy || aiDetectionBusy

  return (
    <Select value={""} disabled={isDisabled}>
      <SelectTrigger className="!h-8 w-min gap-1">
        <Bot className="size-4" />
        <span>Assistance</span>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem
            value="summarize"
            disabled={!summarize.supported || summarize.busy}
            onPointerUp={(e) => {
              // Radix Select closes on selection; fire after pointer up
              summarize.handle()
            }}
          >
            <div className="flex items-center gap-1">
              <Star28
                className="text-purple-500 dark:text-blue-500"
                pathClassName="stroke-black dark:stroke-white"
                size={16}
                strokeWidth={2}
              />
              <span>{summarize.label}</span>
            </div>
          </SelectItem>
          <SelectItem
            value="proofread"
            disabled={!proofreaderSupported || proofreaderBusy}
            onPointerUp={() => {
              handleProofread()
            }}
          >
            <div className="flex items-center gap-1">
              <Star28
                className="text-green-500 dark:text-green-400"
                pathClassName="stroke-black dark:stroke-white"
                size={16}
                strokeWidth={2}
              />
              <span>Proofread{proofreaderBusy ? "…" : ""}</span>
            </div>
          </SelectItem>
          <SelectItem
            value="detect-ai"
            disabled={aiDetectionBusy}
            onPointerUp={() => {
              handleAIDetection()
            }}
          >
            <div className="flex items-center gap-1">
              <Bot className="size-4 text-blue-500" />
              <span>Detect AI{aiDetectionBusy ? "…" : ""}</span>
            </div>
          </SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

// --- Summarize action hook (reuses existing toolbar plugin logic) ---
interface SummarizerOptions {
  type?: 'key-points' | 'tl;dr' | 'teaser' | 'headline'
  format?: 'markdown' | 'plain-text'
  length?: 'short' | 'medium' | 'long'
  monitor?: (m: EventTarget) => void
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
  return 'Summarizer' in self
}

function useSummarizeAction() {
  const { activeEditor } = useToolbarContext()
  const [supported, setSupported] = useState(false)
  const [checking, setChecking] = useState(true)
  const [busy, setBusy] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [availabilityStatus, setAvailabilityStatus] = useState<'readily' | 'after-download' | 'no' | null>(null)

  useEffect(() => {
    const check = async () => {
      setChecking(true)
      if (isChromeWithSummarizerAPI()) {
        try {
          const availability = await Summarizer.availability()
          setAvailabilityStatus(availability)
          setSupported(availability !== 'no')
        } catch (e) {
          setSupported(false)
        }
      } else {
        setSupported(false)
      }
      setChecking(false)
    }
    check()
  }, [])

  const handle = useCallback(async () => {
    if (!supported || busy) return
    setBusy(true)
    const dismiss = showProcessingToast("Summarizing…")
    try {
      const editorState = activeEditor.getEditorState()
      let textContent = ""
      editorState.read(() => {
        const root = $getRoot()
        textContent = root.getTextContent()
      })
      if (!textContent.trim()) {
        alert("No content to summarize")
        setBusy(false)
        return
      }

      if (availabilityStatus === 'after-download') {
        setDownloading(true)
        setProgress(0)
      }

      const summarizer = await Summarizer.create({
        type: 'key-points',
        format: 'plain-text',
        length: 'medium',
        monitor(m) {
          m.addEventListener('downloadprogress', (e) => {
            const ev = e as Event & { loaded: number }
            const p = Math.round(ev.loaded * 100)
            setProgress(p)
            if (p >= 100) setDownloading(false)
          })
        }
      })

      if (downloading) {
        setDownloading(false)
        setProgress(100)
      }

      const summary = await summarizer.summarize(textContent, {
        context: 'This is a note or document that needs to be summarized for quick reference.',
        outputLanguage: 'en'
      })

      activeEditor.update(() => {
        const root = $getRoot()
        const collapsibleContainer = $createCollapsibleContainerNode(true)
        const titleNode = $createCollapsibleTitleNode()
        const titleParagraph = $createParagraphNode()
        const titleText = $createTextNode("Summary of your note:")
        titleParagraph.append(titleText)
        titleNode.append(titleParagraph)
        const contentNode = $createCollapsibleContentNode()
        const summaryParagraph = $createParagraphNode()
        const summaryText = $createTextNode(summary)
        summaryParagraph.append(summaryText)
        contentNode.append(summaryParagraph)
        collapsibleContainer.append(titleNode, contentNode)
        const firstChild = root.getFirstChild()
        if (firstChild) {
          firstChild.insertBefore(collapsibleContainer)
        } else {
          root.append(collapsibleContainer)
        }
      })
    } catch (e) {
      console.error("Error generating summary:", e)
      alert("Failed to generate summary. Please try again.")
      setDownloading(false)
    } finally {
      dismiss()
      setBusy(false)
    }
  }, [supported, busy, availabilityStatus, activeEditor, downloading])

  const label = useMemo(() => {
    if (checking) return "Checking…"
    if (!supported) return "Summarize (unavailable)"
    if (downloading) return `Downloading… ${progress}%`
    if (busy) return "Summarizing…"
    return availabilityStatus === 'after-download' ? "Summarize*" : "Summarize"
  }, [checking, supported, downloading, progress, busy, availabilityStatus])

  return { supported, busy: busy || downloading || checking, handle, label }
}

// --- Proofread action hook (reuses existing toolbar plugin logic) ---
interface ProofreaderOptions {
  expectedInputLanguages?: string[]
  monitor?: (m: EventTarget) => void
}

interface ProofreadResult {
  correctedInput: string
  corrections: {
    startIndex: number
    endIndex: number
    suggestion: string
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
  return 'Proofreader' in self
}

function useProofreadAction(onProofreadingResult?: (data: {
  originalText: string
  correctedText: string
  corrections?: {
    startIndex: number
    endIndex: number
    suggestion: string
    type: string
    explanation?: string
  }[]
} | null) => void) {
  const { activeEditor } = useToolbarContext()
  const [supported, setSupported] = useState(false)
  const [checking, setChecking] = useState(true)
  const [busy, setBusy] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [availabilityStatus, setAvailabilityStatus] = useState<'readily' | 'after-download' | 'no' | null>(null)

  useEffect(() => {
    const check = async () => {
      setChecking(true)
      if (isChromeWithProofreaderAPI()) {
        try {
          const availability = await Proofreader.availability()
          setAvailabilityStatus(availability)
          setSupported(availability !== 'no')
        } catch (e) {
          setSupported(false)
        }
      } else {
        setSupported(false)
      }
      setChecking(false)
    }
    check()
  }, [])

  const handleProofread = useCallback(async () => {
    if (!supported || busy) return
    setBusy(true)
    const dismiss = showProcessingToast("Proofreading…")
    try {
      const editorState = activeEditor.getEditorState()
      let markdownContent = ""
      editorState.read(() => {
        // Prefer entire document converted to markdown for structure-preserving proofreading
        markdownContent = $convertToMarkdownString(TRANSFORMERS)
      })

      if (!markdownContent.trim()) {
        alert("No content to proofread")
        setBusy(false)
        return
      }

      if (availabilityStatus === 'after-download') {
        setDownloading(true)
        setProgress(0)
      }

      const proofreader = await Proofreader.create({
        expectedInputLanguages: ['en'],
        monitor(m) {
          m.addEventListener('downloadprogress', (e) => {
            const ev = e as Event & { loaded: number }
            const p = Math.round(ev.loaded * 100)
            setProgress(p)
            if (p >= 100) setDownloading(false)
          })
        }
      })

      if (downloading) {
        setDownloading(false)
        setProgress(100)
      }

      const result = await proofreadMarkdown(markdownContent, proofreader as ProofreaderAPI)
      if (onProofreadingResult) {
        onProofreadingResult({
          originalText: result.originalMarkdown,
          correctedText: result.correctedMarkdown,
          corrections: result.blocks.flatMap((b) => b.corrections || [])
        })
      }
    } catch (e) {
      console.error("Error proofreading markdown:", e)
      alert("Failed to proofread content. Please try again.")
      setDownloading(false)
    } finally {
      dismiss()
      setBusy(false)
    }
  }, [supported, busy, availabilityStatus, activeEditor, downloading, onProofreadingResult])

  return {
    handleProofread,
    proofreaderSupported: supported && !checking,
    busy: busy || downloading || checking,
  }
}

// --- AI Detection action hook ---
function useAIDetectionAction(onAIDetectionResult?: (result: AIDetectionResponse | null) => void) {
  const { activeEditor } = useToolbarContext()
  const [busy, setBusy] = useState(false)

  const handleAIDetection = useCallback(async () => {
    if (busy) return
    setBusy(true)
    const dismiss = showProcessingToast("Detecting AI content…")
    
    try {
      const editorState = activeEditor.getEditorState()
      let textContent = ""
      
      editorState.read(() => {
        const root = $getRoot()
        textContent = root.getTextContent()
      })

      if (!textContent.trim()) {
        alert("No content to analyze")
        return
      }

      console.log('Sending text for AI detection (first 200 chars):', textContent.substring(0, 200))
      
      const result = await AIDetectionService.detectAI({
        text: textContent,
        score_string: false,
        sentence_scores: true
      })

      if (result.success && result.data) {
        console.log('AI detection result:', result.data)
        if (result.data.sentence_scores && result.data.sentence_scores.length > 0) {
          console.log('First detected sentence:', result.data.sentence_scores[0])
        }
        onAIDetectionResult?.(result.data)
      } else {
        alert(`AI Detection failed: ${result.error || 'Unknown error'}`)
        onAIDetectionResult?.(null)
      }
    } catch (error) {
      console.error("Error during AI detection:", error)
      alert("Failed to detect AI content. Please try again.")
      onAIDetectionResult?.(null)
    } finally {
      dismiss()
      setBusy(false)
    }
  }, [busy, activeEditor, onAIDetectionResult])

  return {
    handleAIDetection,
    busy
  }
}


