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
import ApiService from "@/lib/api-service"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Copy, Check, Sparkles, ArrowLeftToLine } from "lucide-react"
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
  const cite = useCiteAction()
  const { handleAIDetection, busy: aiDetectionBusy } = useAIDetectionAction(onAIDetectionResult)

  // Disable select interaction while any action is busy
  const isDisabled = summarize.busy || proofreaderBusy || cite.busy || aiDetectionBusy

  return (
    <>
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
            onPointerUp={() => {
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
            value="cite"
            disabled={cite.busy}
            onPointerUp={() => {
              cite.open()
            }}
          >
            <div className="flex items-center gap-1">
              <Star28
                className="text-blue-600 dark:text-blue-400"
                pathClassName="stroke-black dark:stroke-white"
                size={16}
                strokeWidth={2}
              />
              <span>Cite{cite.busy ? "…" : ""}</span>
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
    {cite.dialog}
    </>
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
  const [, setProgress] = useState(0)
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
        context: 'This is a note or document that needs to be summarized for quick reference.'
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
    if (downloading) return "Downloading…"
    if (busy) return "Summarizing…"
    return availabilityStatus === 'after-download' ? "Summarize*" : "Summarize"
  }, [checking, supported, downloading, busy, availabilityStatus])

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
  const [, setProgress] = useState(0)
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

// --- Cite action hook ---
function useCiteAction() {
  const { activeEditor } = useToolbarContext()
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState("")
  const [style, setStyle] = useState<'apa' | 'mla'>('apa')
  const [result, setResult] = useState<string>("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>("")
  const [copied, setCopied] = useState(false)

  const submit = useCallback(async () => {
    if (!url.trim()) {
      setError("Please enter a URL")
      return
    }
    setBusy(true)
    setError("")
    setResult("")
    const res = await ApiService.createCitationFromUrl({ url, style })
    setBusy(false)
    if (!res.success || !res.data) {
      setError(res.error || "Failed to generate citation")
      return
    }
    setResult(res.data.citation)
  }, [url, style])

  const copyToClipboard = useCallback(async () => {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (e) {
      console.warn('Failed to copy to clipboard', e)
    }
  }, [result])

  const insertIntoEditor = useCallback(() => {
    if (!result) return
    activeEditor.update(() => {
      const root = $getRoot()
      const p = $createParagraphNode()
      p.append($createTextNode(result))
      root.append(p)
    })
    setOpen(false)
  }, [result, activeEditor])

  const dialog = (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cite</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid gap-1">
            <Label htmlFor="cite-url">URL</Label>
            <Input id="cite-url" placeholder="https://example.com/article" value={url} onChange={(e) => setUrl(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label>Style</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={style === 'apa' ? 'default' : 'neutral'}
                size="sm"
                onClick={() => setStyle('apa')}
                className="flex-1"
              >
                APA
              </Button>
              <Button
                type="button"
                variant={style === 'mla' ? 'default' : 'neutral'}
                size="sm"
                onClick={() => setStyle('mla')}
                className="flex-1"
              >
                MLA
              </Button>
            </div>
          </div>
          <div className="text-red-600 text-xs min-h-4">{error}</div>
          <div className="grid gap-1">
            <Label>Result</Label>
            <div className="p-2 border-2 border-black bg-white font-mono text-xs min-h-12 max-h-40 overflow-auto whitespace-pre-wrap">{result || (busy ? "Generating…" : "")}</div>
          </div>
        </div>
        <DialogFooter className="flex gap-2">
          <Button variant="default" onClick={submit} disabled={busy}>
            <Sparkles className="w-4 h-4 mr-1" />
            Generate
          </Button>
          <Button variant="neutral" onClick={copyToClipboard} disabled={!result}>
            {copied ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
            {copied ? "Copied!" : "Copy"}
          </Button>
          <Button variant="neutral" onClick={insertIntoEditor} disabled={!result}>
            <ArrowLeftToLine className="w-4 h-4 mr-1" />
            Insert
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  return {
    busy,
    open: () => setOpen(true),
    dialog,
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


