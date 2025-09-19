import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { CheckCircle2, Loader2, Smartphone, UploadCloud, WifiOff } from 'lucide-react'
import ScanSessionService from '@/lib/scan-session-service'
import { cn } from '@/lib/utils'

type MobileSessionState =
  | 'initial'
  | 'validating'
  | 'ready'
  | 'uploading'
  | 'uploaded'
  | 'error'

interface QueryParams {
  sessionId: string | null
  guestKey: string | null
}

const parseQueryParams = (): QueryParams => {
  try {
    const searchParams = new URLSearchParams(window.location.search)
    return {
      sessionId: searchParams.get('session'),
      guestKey: searchParams.get('key'),
    }
  } catch (error) {
    console.warn('Failed to parse query params', error)
    return { sessionId: null, guestKey: null }
  }
}

export function MobileScanPage() {
  const [state, setState] = useState<MobileSessionState>('initial')
  const [error, setError] = useState<string | null>(null)
  const [infoMessage, setInfoMessage] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string>('')
  const [uploading, setUploading] = useState(false)

  const { sessionId, guestKey } = useMemo(parseQueryParams, [])
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!sessionId || !guestKey) {
      setError('Missing session information. Please rescan the QR code from Brutal Notes.')
      setState('error')
      return
    }

    const initialise = async () => {
      setState('validating')
      setError(null)
      try {
        const validation = await ScanSessionService.validateSession(sessionId, guestKey)
        if (validation.role !== 'guest') {
          throw new Error('This link is not valid for guest devices')
        }
        setState('ready')
        setInfoMessage('Tap the button below to capture or choose a photo of your notes.')
      } catch (validationError) {
        console.error('Failed to validate scan session', validationError)
        setError(validationError instanceof Error ? validationError.message : 'Unable to join scan session')
        setState('error')
      }
    }

    void initialise()
  }, [guestKey, sessionId])

  const resetInput = () => {
    if (inputRef.current) {
      inputRef.current.value = ''
    }
  }

  const handleUpload = useCallback(
    async (file: File) => {
      if (!sessionId || !guestKey) {
        return
      }

      setUploading(true)
      setState('uploading')
      setError(null)
      setInfoMessage('Uploading image to Brutal Notes…')

      try {
        await ScanSessionService.uploadImage(sessionId, guestKey, file)
        setState('uploaded')
        setInfoMessage('Upload complete! You can return to Brutal Notes on your computer.')
      } catch (uploadError) {
        console.error('Failed to upload image:', uploadError)
        setError(uploadError instanceof Error ? uploadError.message : 'Failed to upload image. Please try again.')
        setState('error')
      } finally {
        setUploading(false)
      }
    },
    [guestKey, sessionId]
  )

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file (PNG, JPG, HEIC, etc).')
      resetInput()
      return
    }

    setFileName(file.name)
    setError(null)
    void handleUpload(file)
  }

  const renderStatus = () => {
    if (error) {
      return (
        <div className="mt-4 rounded-md border-2 border-black bg-red-100 p-4 text-sm text-red-700">
          <p className="font-semibold">Unable to continue</p>
          <p className="mt-1 leading-relaxed">{error}</p>
        </div>
      )
    }

    switch (state) {
      case 'initial':
      case 'validating':
        return (
          <div className="mt-4 flex flex-col items-center gap-3 text-sm text-neutral-600">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-center">Preparing secure upload session…</p>
          </div>
        )
      case 'ready':
        return (
          <div className="mt-4 rounded-md border border-dashed border-neutral-400 bg-neutral-100 p-3 text-center text-sm text-neutral-600">
            {infoMessage}
          </div>
        )
      case 'uploading':
        return (
          <div className="mt-4 space-y-3 text-sm text-neutral-600">
            <p className="font-semibold">Uploading {fileName || 'image'}…</p>
            <div className="h-2 w-full border border-black bg-white">
              <div className="h-full w-full bg-purple-500 animate-pulse" />
            </div>
            <p className="text-xs">This may take a moment depending on your connection.</p>
          </div>
        )
      case 'uploaded':
        return (
          <div className="mt-4 flex flex-col items-center gap-3 rounded-md border-2 border-black bg-green-100 p-4 text-green-700">
            <CheckCircle2 className="h-6 w-6" />
            <p className="text-center font-semibold">Photo delivered to Brutal Notes!</p>
            <button
              onClick={() => window.history.back()}
              className="rounded border-2 border-black bg-white px-3 py-1 text-xs font-semibold text-neutral-800 shadow-[2px_2px_0px_0px_#000] transition hover:bg-neutral-200"
            >
              Done
            </button>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-neutral-100 px-6 py-10 font-mono text-neutral-900">
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-6">
        <Smartphone className="h-10 w-10" />
        <div className="text-center">
          <h1 className="text-xl font-black">BRUTAL NOTES — Upload Notes</h1>
          <p className="mt-2 text-sm text-neutral-600">Upload a photo of your handwritten notes to sync them to Brutal Notes.</p>
        </div>

        <label
          className={cn(
            'flex w-full flex-col items-center gap-3 rounded-lg border-2 border-black bg-white p-4 text-center transition hover:bg-neutral-50',
            uploading && 'pointer-events-none opacity-75'
          )}
        >
          <span className="text-sm font-semibold">
            {state === 'uploaded' ? 'Upload complete!' : 'Tap to capture or choose photo'}
          </span>
          <UploadCloud className="h-6 w-6" />
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileChange}
            disabled={uploading || state === 'uploaded'}
          />
        </label>

        {infoMessage && !error ? (
          <p className="text-xs text-neutral-500 text-center">{infoMessage}</p>
        ) : null}

        {state === 'error' && !error ? (
          <div className="mt-4 flex flex-col items-center gap-3 rounded-md border-2 border-black bg-yellow-100 p-4 text-yellow-700">
            <WifiOff className="h-6 w-6" />
            <p className="text-center font-semibold">Connection issue</p>
            <p className="text-center text-sm">Please go back to Brutal Notes and tap “Scan Notes” again to start a new session.</p>
          </div>
        ) : null}

        {renderStatus()}
      </div>
    </div>
  )
}

export default MobileScanPage
