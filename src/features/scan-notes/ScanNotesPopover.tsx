import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { AlertTriangle, Camera, CheckCircle2, ChevronDown, Loader2, RefreshCcw, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useHostScanSession } from './useHostScanSession'
import { cn } from '@/lib/utils'
import { transcribeImageToMarkdown } from './image-transcriber'

const STATUS_LABELS: Record<string, string> = {
  idle: 'Ready to start',
  creating: 'Creating session…',
  ready: 'Waiting for device',
  connecting: 'Negotiating connection…',
  connected: 'Connected',
  receiving: 'Receiving photo…',
  completed: 'Photo received!',
  error: 'Session error',
}

interface ScanNotesPopoverProps {
  buttonClassName?: string
  onCreateNote?: (markdown: string) => void
}

type ProcessingStatus = 'idle' | 'processing' | 'success' | 'error'

type ProcessingSource = 'p2p' | 'manual'

export function ScanNotesPopover({ buttonClassName, onCreateNote }: ScanNotesPopoverProps) {
  const [open, setOpen] = useState(false)
  const manualUploadInputRef = useRef<HTMLInputElement | null>(null)
  const [manualFileName, setManualFileName] = useState<string | null>(null)
  const [manualUploadError, setManualUploadError] = useState<string | null>(null)
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>('idle')
  const [processingMessage, setProcessingMessage] = useState<string | null>(null)
  const [processingError, setProcessingError] = useState<string | null>(null)
  const [processingSource, setProcessingSource] = useState<ProcessingSource | null>(null)
  const [isQrExpanded, setIsQrExpanded] = useState(false)

  const closeSessionRef = useRef<() => Promise<void>>(async () => {})

  const processImageFile = useCallback(
    async (file: File, source: ProcessingSource) => {
      setProcessingSource(source)
      setProcessingStatus('processing')
      setProcessingMessage('Transcribing notes with Firebase AI…')
      setProcessingError(null)

      try {
        const markdown = await transcribeImageToMarkdown(file)
        const trimmed = markdown.trim()
        if (!trimmed) {
          throw new Error('The AI did not return any content for this image.')
        }

        const title = file.name ? file.name.replace(/\.[^/.]+$/, '') : 'Scanned Notes'
        const formatted = `## 📷 Digitized Notes — ${title}\n\n${trimmed}\n`

        onCreateNote?.(formatted)

        setProcessingStatus('success')
        setProcessingMessage('Notes inserted into the editor. Review and save when ready.')
        setProcessingError(null)

        if (source === 'manual') {
          setManualFileName(null)
          if (manualUploadInputRef.current) {
            manualUploadInputRef.current.value = ''
          }
        }
      } catch (err) {
        console.error('Failed to transcribe image notes:', err)
        setProcessingStatus('error')
        setProcessingMessage(null)
        setProcessingError(err instanceof Error ? err.message : 'Unable to transcribe the image. Please try again.')
      } finally {
        if (source === 'p2p') {
          void closeSessionRef.current()
        }
      }
    },
    [onCreateNote]
  )

  const hostSessionOptions = useMemo(() => ({
    onImageReady: async (file: File) => {
      await processImageFile(file, 'p2p')
    },
  }), [processImageFile])

  const {
    sessionInfo,
    qrCodeDataUrl,
    status,
    connectionState,
    error,
    receivedFileName,
    bytesReceived,
    totalBytesExpected,
    restart,
    closeSession,
  } = useHostScanSession(open && isQrExpanded, hostSessionOptions)

  closeSessionRef.current = closeSession

  const statusLabel = STATUS_LABELS[status] ?? status
  const progressPercent = totalBytesExpected > 0 ? Math.min(100, Math.floor((bytesReceived / totalBytesExpected) * 100)) : 0
  const connectionLabel = connectionState === 'closed' ? 'not connected' : connectionState.replace(/_/g, ' ')

  useEffect(() => {
    if (!open) {
      setIsQrExpanded(false)
      setManualFileName(null)
      setManualUploadError(null)
      setProcessingStatus('idle')
      setProcessingMessage(null)
      setProcessingError(null)
      setProcessingSource(null)
      if (manualUploadInputRef.current) {
        manualUploadInputRef.current.value = ''
      }
    }
  }, [open])

  useEffect(() => {
    if (!isQrExpanded) {
      void closeSessionRef.current()
    } else {
      setProcessingStatus('idle')
      setProcessingMessage(null)
      setProcessingError(null)
      setProcessingSource(null)
    }
  }, [isQrExpanded])

  const handleManualFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (processingStatus === 'processing') {
      return
    }

    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    if (!file.type.startsWith('image/')) {
      setManualUploadError('Please upload an image file (PNG, JPG, HEIC, etc).')
      setManualFileName(null)
      return
    }

    setManualUploadError(null)
    setManualFileName(file.name)
    console.log('manual upload file; name of file', file.name)
    void processImageFile(file, 'manual')
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              className={cn(
                'border-2 border-black shadow-[2px_2px_0px_0px_#000] bg-purple-400 hover:bg-purple-500 text-black font-black brutal-hover h-8 px-4',
                buttonClassName
              )}
              size="sm"
              disabled={processingStatus === 'processing'}
            >
              {status === 'creating' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              <span className="hidden md:inline ml-2">Scan Notes</span>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" avoidCollisions={false} sideOffset={4}>
          <p className="font-mono font-black">PAPER → DIGITAL</p>
        </TooltipContent>
      </Tooltip>

      <PopoverContent className="w-[320px] border-4 border-black shadow-[8px_8px_0px_0px_#000] font-mono p-4 bg-neutral-50" sideOffset={8}>
        <input
          ref={manualUploadInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleManualFileChange}
        />

        <div className="space-y-4">
          <div className="border-2 border-black bg-white p-3 space-y-2">
            <p className="text-xs text-neutral-600 text-center">Upload an image of your notes to convert them to Markdown.</p>
            <Button
              variant="neutral"
              className="w-full border-2 border-black shadow-[2px_2px_0px_0px_#000] bg-white hover:bg-neutral-100"
              onClick={() => manualUploadInputRef.current?.click()}
              disabled={processingStatus === 'processing'}
            >
              Upload Image
            </Button>
            {manualUploadError ? (
              <div className="border border-black bg-red-100 px-2 py-1 text-xs text-red-700">
                {manualUploadError}
              </div>
            ) : null}
            {manualFileName ? (
              <div className="border border-black bg-blue-100 px-2 py-1 text-xs text-blue-700">
                Selected: {manualFileName}
              </div>
            ) : null}
          </div>

          <div className="border-2 border-black bg-white p-3 space-y-2">
            <Button
              variant="neutral"
              className="w-full justify-between border-2 border-black shadow-[2px_2px_0px_0px_#000] bg-white hover:bg-neutral-100"
              onClick={() => setIsQrExpanded((prev) => !prev)}
              disabled={processingStatus === 'processing' && processingSource === 'p2p'}
            >
              <span>Scan with phone (QR)</span>
              <ChevronDown className={cn('h-4 w-4 transition-transform', isQrExpanded && 'rotate-180')} />
            </Button>

            {isQrExpanded ? (
              <div className="space-y-3 text-xs text-neutral-600">
                {error ? (
                  <div className="bg-red-100 border-2 border-black px-3 py-2 text-sm text-red-700">
                    <p className="font-bold">Connection error</p>
                    <p className="mt-1">{error}</p>
                  </div>
                ) : null}

                {sessionInfo && qrCodeDataUrl ? (
                  <div className="border-2 border-black bg-white p-3 flex flex-col items-center gap-2">
                    <img src={qrCodeDataUrl} alt="Scan to connect" className="w-40 h-40" />
                    <p className="text-xs text-neutral-600 text-center">
                      Scan this QR code with your phone to send a photo of your notes.
                    </p>
                    <div className="w-full text-[10px] text-neutral-500 break-all text-center bg-neutral-100 border border-dashed border-neutral-400 px-2 py-1">
                      {sessionInfo.guestJoinUrl}
                    </div>
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-neutral-400 bg-neutral-100 p-6 text-center text-xs text-neutral-500">
                    Preparing session…
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">Connection</span>
                    <span>{connectionLabel}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">Status</span>
                    <span>{statusLabel}</span>
                  </div>
                  {status === 'receiving' || status === 'completed' ? (
                    <div className="flex flex-col gap-1">
                      <span className="font-semibold">Transfer</span>
                      <div className="h-2 w-full bg-neutral-200 border border-black">
                        <div className="h-full bg-green-500" style={{ width: `${progressPercent}%` }} />
                      </div>
                      <span>
                        {bytesReceived.toLocaleString()} / {totalBytesExpected.toLocaleString()} bytes ({progressPercent}%)
                      </span>
                    </div>
                  ) : null}
                  {receivedFileName ? (
                    <div className="border border-black bg-green-100 px-2 py-1 text-green-700 font-semibold">
                      Received: {receivedFileName}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="text-xs text-neutral-500 text-center">Open to connect your phone and capture notes instantly.</p>
            )}
          </div>

          {processingStatus !== 'idle' && (
            <div
              className={cn(
                'border-2 border-black px-3 py-2 text-xs flex flex-col gap-1',
                processingStatus === 'processing' && 'bg-yellow-100 text-yellow-800',
                processingStatus === 'success' && 'bg-green-100 text-green-700',
                processingStatus === 'error' && 'bg-red-100 text-red-700'
              )}
            >
              <div className="flex items-center gap-2">
                {processingStatus === 'processing' && <Loader2 className="h-4 w-4 animate-spin" />}
                {processingStatus === 'success' && <CheckCircle2 className="h-4 w-4" />}
                {processingStatus === 'error' && <AlertTriangle className="h-4 w-4" />}
                <span>
                  {processingStatus === 'processing' && (processingMessage ?? 'Processing image…')}
                  {processingStatus === 'success' && (processingMessage ?? 'Notes added to the editor.')}
                  {processingStatus === 'error' && (processingError ?? 'Unable to transcribe the image.')}
                </span>
              </div>
              {processingSource ? (
                <span className="text-[10px] text-neutral-500">
                  Source: {processingSource === 'p2p' ? 'Scan & send' : 'Manual upload'}
                </span>
              ) : null}
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            {isQrExpanded ? (
              <Button
                variant="neutral"
                className="flex-1 border-2 border-black shadow-[2px_2px_0px_0px_#000] bg-white hover:bg-neutral-100"
                onClick={() => {
                  void restart()
                  setProcessingStatus('idle')
                  setProcessingMessage(null)
                  setProcessingError(null)
                  setProcessingSource(null)
                }}
                disabled={status === 'creating' || processingStatus === 'processing'}
              >
                <RefreshCcw className="h-4 w-4 mr-2" />
                Restart
              </Button>
            ) : null}
            <Button
              variant="neutral"
              className={cn(
                'border-2 border-black shadow-[2px_2px_0px_0px_#000] bg-white hover:bg-neutral-100',
                isQrExpanded ? 'flex-1' : 'w-full'
              )}
              onClick={() => {
                setOpen(false)
                void closeSession()
              }}
              disabled={processingStatus === 'processing' && processingSource === 'p2p'}
            >
              Close
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default ScanNotesPopover

