/* eslint-disable @typescript-eslint/no-unused-vars */
"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Bot, TriangleAlert } from "lucide-react"
import { $getRoot } from "lexical"

import { useToolbarContext } from "@/components/editor/context/toolbar-context"
import { $createCollapsibleContainerNode } from "@/components/editor/nodes/collapsible-container-node"
import { $createCollapsibleTitleNode } from "@/components/editor/nodes/collapsible-title-node"
import { $createCollapsibleContentNode } from "@/components/editor/nodes/collapsible-content-node"
import { $createParagraphNode, $createTextNode } from "lexical"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger } from "@/components/ui/select"
import Star28 from "@/components/stars/s28"
import ApiService from "@/lib/api-service"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Copy, Check, Sparkles, ArrowLeftToLine } from "lucide-react"
import AIDetectionService, { type AIDetectionResponse } from "@/lib/ai-detection-service"
import { useOnlineStatus } from "@/hooks/useOnlineStatus"
import { showErrorToast, showProcessingToast, showWarningToast } from "@/lib/notifications"
import {
  builtInAINeedsDownload,
  createBuiltInAIDownloadMonitor,
  createSummarizerSession,
  finalizeBuiltInAIDownload,
  getSummarizerAvailability,
  type BuiltInAIAvailabilityStatus,
} from "@/lib/chromium-ai"
import {
  getWritingAssistanceErrorDetails,
  resolveWritingAssistanceProvider,
  summarizeWithCloud,
  type WritingAssistanceProvider,
} from "@/lib/writing-assistance-service"

function isBuiltInAISessionCreationError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "InvalidStateError") {
    return true
  }

  if (!(error instanceof Error)) {
    return false
  }

  const normalizedMessage = error.message.toLowerCase()
  return (
    normalizedMessage.includes("unable to create a session") ||
    normalizedMessage.includes("check the result of availability() first")
  )
}

// Assistance dropdown that groups note-assistance actions
export function AssistancePlugin({ 
  onAIDetectionResult 
}: { 
  onAIDetectionResult?: (result: AIDetectionResponse | null) => void
}) {
  const summarize = useSummarizeAction()
  const cite = useCiteAction()
  const { handleAIDetection, busy: aiDetectionBusy } = useAIDetectionAction(onAIDetectionResult)

  // Disable select interaction while any action is busy
  const isDisabled = summarize.busy || cite.busy || aiDetectionBusy

  return (
    <>
    <Select value={""} disabled={isDisabled}>
      <SelectTrigger className="!h-8 w-min gap-1 sm:gap-2">
        <Bot className="size-4" />
        <span className="hidden sm:inline">Assistance</span>
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
              <TriangleAlert className="size-4 text-yellow-500" />
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

function useSummarizeAction() {
  const { activeEditor } = useToolbarContext()
  const { isOnline } = useOnlineStatus()
  const [checking, setChecking] = useState(true)
  const [busy, setBusy] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [, setProgress] = useState(0)
  const [availabilityStatus, setAvailabilityStatus] = useState<BuiltInAIAvailabilityStatus | null>(null)

  const refreshAvailability = useCallback(async () => {
    setChecking(true)
    try {
      const availability = await getSummarizerAvailability()
      setAvailabilityStatus(availability)
    } catch (e) {
      setAvailabilityStatus('unsupported')
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    void refreshAvailability()
  }, [refreshAvailability])

  useEffect(() => {
    if (availabilityStatus !== 'downloading') {
      return
    }

    const intervalId = window.setInterval(() => {
      void refreshAvailability()
    }, 2000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [availabilityStatus, refreshAvailability])

  const provider = useMemo(
    () => resolveWritingAssistanceProvider(availabilityStatus, isOnline),
    [availabilityStatus, isOnline],
  )
  const supported = provider !== 'unavailable'

  const handle = useCallback(async () => {
    if (!supported || busy) return
    setBusy(true)
    const dismiss = showProcessingToast("Summarizing…")
    let summarizer: Summarizer | null = null
    try {
      const editorState = activeEditor.getEditorState()
      let textContent = ""
      editorState.read(() => {
        const root = $getRoot()
        textContent = root.getTextContent()
      })
      if (!textContent.trim()) {
        showWarningToast("Nothing to summarize", "Add some note content first.")
        setBusy(false)
        return
      }

      let summary = ''
      let activeProvider: WritingAssistanceProvider = provider
      let activeAvailabilityStatus = availabilityStatus

      if (provider === 'built-in') {
        const latestAvailability = await getSummarizerAvailability()
        setAvailabilityStatus(latestAvailability)
        activeAvailabilityStatus = latestAvailability
        activeProvider = resolveWritingAssistanceProvider(latestAvailability, isOnline)
      }

      if (activeProvider === 'built-in') {
        const shouldTrackDownload = builtInAINeedsDownload(activeAvailabilityStatus)

        try {
          summarizer = await createSummarizerSession(
            shouldTrackDownload
              ? createBuiltInAIDownloadMonitor(setDownloading, setProgress)
              : undefined,
          )
        } catch (error) {
          if (!isOnline || !isBuiltInAISessionCreationError(error)) {
            throw error
          }

          setAvailabilityStatus('unsupported')
          activeProvider = 'cloud'
        }

        if (activeProvider === 'built-in') {
          if (!summarizer) {
            throw new Error("Built-in summarizer session could not be created.")
          }

          if (shouldTrackDownload) {
            finalizeBuiltInAIDownload(setDownloading, setProgress)
            void refreshAvailability()
          }

          summary = await summarizer.summarize(textContent, {
            context: 'This is a note or document that needs to be summarized for quick reference.'
          })
        }
      }

      if (activeProvider === 'cloud') {
        summary = await summarizeWithCloud(textContent)
      } else if (activeProvider === 'unavailable') {
        throw new Error("Summarizer is unavailable right now.")
      }

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
      const errorDetails = getWritingAssistanceErrorDetails(e)
      if (errorDetails.kind === "quota") {
        showWarningToast(
          "Cloud summary unavailable",
          errorDetails.retryAfterSeconds
            ? `Writing-assistance quota is exhausted right now. Try again in about ${errorDetails.retryAfterSeconds} seconds.`
            : "Writing-assistance quota is exhausted right now. Try again later or use Chrome built-in AI when available.",
        )
      } else {
        showErrorToast("Failed to generate summary", errorDetails.message || "Please try again.")
      }
      setDownloading(false)
    } finally {
      summarizer?.destroy()
      dismiss()
      setBusy(false)
    }
  }, [supported, busy, availabilityStatus, activeEditor, provider, refreshAvailability])

  const label = useMemo(() => {
    if (checking) return "Checking…"
    if (!supported) return isOnline ? "Summarize (cloud)" : "Summarize (unavailable)"
    if (downloading || availabilityStatus === 'downloading') return "Downloading…"
    if (busy) return "Summarizing…"
    if (provider === 'cloud') return "Summarize (cloud)"
    return builtInAINeedsDownload(availabilityStatus) ? "Summarize*" : "Summarize"
  }, [checking, supported, downloading, busy, availabilityStatus, provider, isOnline])

  return { supported, busy: busy || downloading || checking, handle, label }
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
        showWarningToast("Nothing to analyze", "Add some note content first.")
        return
      }
      
      const result = await AIDetectionService.detectAI({
        text: textContent,
        score_string: false,
        sentence_scores: true
      })

      if (result.success && result.data) {
        onAIDetectionResult?.(result.data)
      } else {
        showErrorToast("AI detection failed", result.error || "Unknown error")
        onAIDetectionResult?.(null)
      }
    } catch (error) {
      console.error("Error during AI detection:", error)
      showErrorToast("Failed to detect AI content", "Please try again.")
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
