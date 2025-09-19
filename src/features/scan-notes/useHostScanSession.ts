import { useCallback, useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import ScanSessionService, { type ScanSessionCreateResult, type UploadFetchResult } from '@/lib/scan-session-service'

type HostSessionState =
  | 'idle'
  | 'creating'
  | 'waiting_upload'
  | 'processing'
  | 'completed'
  | 'error'

type HostScanSessionResult = {
  sessionInfo: ScanSessionCreateResult | null
  qrCodeDataUrl: string | null
  status: HostSessionState
  error: string | null
  receivedFileName: string | null
  restart: () => Promise<void>
  closeSession: () => Promise<void>
}

interface HostScanSessionOptions {
  onImageReady?: (
    file: File,
    context?: {
      base64Data: string
      mimeType: string
    }
  ) => Promise<void> | void
}

const POLL_INTERVAL_MS = 2000
const MAX_POLL_DURATION_MS = 5 * 60 * 1000

export function useHostScanSession(isActive: boolean, options: HostScanSessionOptions = {}): HostScanSessionResult {
  const [sessionInfo, setSessionInfo] = useState<ScanSessionCreateResult | null>(null)
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<HostSessionState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [receivedFileName, setReceivedFileName] = useState<string | null>(null)

  const sessionInfoRef = useRef<ScanSessionCreateResult | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollStartedAtRef = useRef<number | null>(null)
  const isCleaningUpRef = useRef(false)
  const isPollInFlightRef = useRef(false)
  const isProcessingUploadRef = useRef(false)

  const clearPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
      pollStartedAtRef.current = null
    }
  }, [])

  const cleanup = useCallback(async () => {
    if (isCleaningUpRef.current) {
      return
    }
    isCleaningUpRef.current = true
    clearPoll()
    setSessionInfo(null)
    setQrCodeDataUrl(null)
    setReceivedFileName(null)
    setStatus('idle')
    setError(null)
    isPollInFlightRef.current = false
    isProcessingUploadRef.current = false
    isCleaningUpRef.current = false
  }, [clearPoll])

  const closeSession = useCallback(async () => {
    const activeSession = sessionInfoRef.current
    if (!activeSession) {
      await cleanup()
      return
    }

    try {
      await ScanSessionService.completeSession(activeSession.sessionId, activeSession.hostKey, false)
    } catch (err) {
      console.warn('Failed to mark scan session complete', err)
    } finally {
      await cleanup()
    }
  }, [cleanup])

  const convertUploadToFile = useCallback(async (
    upload: UploadFetchResult
  ): Promise<{ file: File; base64Data: string; mimeType: string }> => {
    const mimeType = upload.mimeType || 'application/octet-stream'
    const base64Payload = upload.base64Data.includes(',')
      ? upload.base64Data.split(',').pop() ?? ''
      : upload.base64Data
    const sanitizedBase64 = base64Payload.replace(/\s/g, '')
    if (!sanitizedBase64) {
      throw new Error('Uploaded image data was empty')
    }

    const padRemainder = sanitizedBase64.length % 4
    const normalizedBase64 = padRemainder === 0 ? sanitizedBase64 : sanitizedBase64.padEnd(sanitizedBase64.length + (4 - padRemainder), '=')

    const dataUrl = `data:${mimeType};base64,${normalizedBase64}`

    try {
      const response = await fetch(dataUrl)
      if (!response.ok) {
        throw new Error(`Failed to rebuild image: ${response.status}`)
      }
      const blob = await response.blob()
      return {
        file: new File([blob], upload.fileName, { type: mimeType, lastModified: Date.now() }),
        base64Data: normalizedBase64,
        mimeType,
      }
    } catch (firstError) {
      try {
        const decodeBase64 = (data: string): string => {
          if (typeof window !== 'undefined' && typeof window.atob === 'function') {
            return window.atob(data)
          }
          if (typeof atob === 'function') {
            return atob(data)
          }
          throw new Error('Base64 decoding is not supported in this environment')
        }

        const byteString = decodeBase64(normalizedBase64)
        const buffer = new Uint8Array(byteString.length)
        for (let i = 0; i < byteString.length; i += 1) {
          buffer[i] = byteString.charCodeAt(i)
        }
        const blob = new Blob([buffer], { type: mimeType })
        return {
          file: new File([blob], upload.fileName, { type: mimeType, lastModified: Date.now() }),
          base64Data: normalizedBase64,
          mimeType,
        }
      } catch (fallbackError) {
        const error = fallbackError instanceof Error ? fallbackError : firstError
        throw error instanceof Error ? error : new Error('Failed to rebuild uploaded file')
      }
    }
  }, [])

  useEffect(() => {
    sessionInfoRef.current = sessionInfo
  }, [sessionInfo])

  const processUploadedImage = useCallback(
    async (upload: UploadFetchResult) => {
      setStatus('processing')
      setReceivedFileName(upload.fileName)

      try {
        const { file, base64Data, mimeType } = await convertUploadToFile(upload)
        if (options.onImageReady) {
          await options.onImageReady(file, { base64Data, mimeType })
        }
        const activeSession = sessionInfoRef.current
        if (activeSession?.hostKey) {
          await ScanSessionService.completeSession(upload.sessionId, activeSession.hostKey, false)
        }
        setStatus('completed')
      } catch (err) {
        console.error('Failed to process uploaded image', err)
        setError(err instanceof Error ? err.message : 'Failed to process uploaded image')
        setStatus('error')
      } finally {
        clearPoll()
      }
    },
    [clearPoll, convertUploadToFile, options]
  )

  const startPolling = useCallback(
    (createdSession: ScanSessionCreateResult) => {
      clearPoll()
      pollStartedAtRef.current = Date.now()

      const poll = async () => {
        if (!pollStartedAtRef.current || isPollInFlightRef.current) {
          return
        }
        const elapsed = Date.now() - pollStartedAtRef.current
        if (elapsed > MAX_POLL_DURATION_MS) {
          clearPoll()
          setStatus('error')
          setError('Timed out waiting for upload. Try restarting the QR session or upload manually.')
          return
        }

        isPollInFlightRef.current = true
        try {
          const upload = await ScanSessionService.fetchUploadedImage(createdSession.sessionId, createdSession.hostKey)
          if (upload) {
            if (isProcessingUploadRef.current) {
              return
            }
            isProcessingUploadRef.current = true
            try {
              await processUploadedImage(upload)
            } finally {
              isProcessingUploadRef.current = false
            }
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          if (!message.includes('No image uploaded')) {
            console.warn('Polling upload failed:', err)
          }
        } finally {
          isPollInFlightRef.current = false
        }
      }

      pollRef.current = setInterval(poll, POLL_INTERVAL_MS)
      void poll()
    },
    [clearPoll, processUploadedImage]
  )

  const createSession = useCallback(async () => {
    setStatus('creating')
    setError(null)
    setReceivedFileName(null)

    try {
      const info = await ScanSessionService.createSession()
      setSessionInfo(info)
      setStatus('waiting_upload')

      const qrDataUrl = await QRCode.toDataURL(info.guestJoinUrl, {
        errorCorrectionLevel: 'M',
        margin: 1,
        scale: 6,
      })
      setQrCodeDataUrl(qrDataUrl)

      startPolling(info)
    } catch (err) {
      console.error('Failed to create scan session', err)
      setError(err instanceof Error ? err.message : 'Failed to create scan session')
      setStatus('error')
    }
  }, [startPolling])

  const restart = useCallback(async () => {
    await closeSession()
    await createSession()
  }, [closeSession, createSession])

  useEffect(() => {
    if (!isActive || sessionInfo) {
      return
    }
    void createSession()
  }, [isActive, sessionInfo, createSession])

  useEffect(() => {
    if (!isActive) {
      void closeSession()
    }
  }, [isActive, closeSession])

  useEffect(() => {
    return () => {
      void closeSession()
    }
  }, [closeSession])

  return {
    sessionInfo,
    qrCodeDataUrl,
    status,
    error,
    receivedFileName,
    restart,
    closeSession,
  }
}

export default useHostScanSession
