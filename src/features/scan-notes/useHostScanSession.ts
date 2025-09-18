import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import ScanSessionService, {
  type ScanSessionCreateResult,
  type CandidateBatchResult,
} from '@/lib/scan-session-service'

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
]

type HostSessionState = 'idle' | 'creating' | 'ready' | 'connecting' | 'connected' | 'receiving' | 'completed' | 'error'

type HostScanSessionResult = {
  sessionInfo: ScanSessionCreateResult | null
  qrCodeDataUrl: string | null
  status: HostSessionState
  connectionState: RTCPeerConnectionState | 'closed'
  error: string | null
  receivedFileName: string | null
  bytesReceived: number
  totalBytesExpected: number
  restart: () => Promise<void>
  closeSession: () => Promise<void>
}

interface FileMetadata {
  name: string
  size: number
  mimeType?: string
}

const CHUNK_POLL_INTERVAL = 1500

interface HostScanSessionOptions {
  onImageReady?: (file: File) => Promise<void> | void
}

export function useHostScanSession(isOpen: boolean, options: HostScanSessionOptions = {}): HostScanSessionResult {
  const [sessionInfo, setSessionInfo] = useState<ScanSessionCreateResult | null>(null)
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<HostSessionState>('idle')
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState | 'closed'>('closed')
  const [error, setError] = useState<string | null>(null)
  const [receivedFileName, setReceivedFileName] = useState<string | null>(null)
  const [bytesReceived, setBytesReceived] = useState<number>(0)
  const [totalBytesExpected, setTotalBytesExpected] = useState<number>(0)

  const peerRef = useRef<RTCPeerConnection | null>(null)
  const dataChannelRef = useRef<RTCDataChannel | null>(null)
  const answerPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const candidatePollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const metadataRef = useRef<FileMetadata | null>(null)
  const pendingChunksRef = useRef<Uint8Array[]>([])
  const isCleaningUpRef = useRef(false)
  const sessionInfoRef = useRef<ScanSessionCreateResult | null>(null)

  useEffect(() => {
    sessionInfoRef.current = sessionInfo
  }, [sessionInfo])

  const cleanup = useCallback(async () => {
    if (isCleaningUpRef.current) {
      return
    }
    isCleaningUpRef.current = true

    if (answerPollRef.current) {
      clearInterval(answerPollRef.current)
      answerPollRef.current = null
    }
    if (candidatePollRef.current) {
      clearInterval(candidatePollRef.current)
      candidatePollRef.current = null
    }

    dataChannelRef.current?.close()
    dataChannelRef.current = null

    if (peerRef.current) {
      peerRef.current.onicecandidate = null
      peerRef.current.onconnectionstatechange = null
      peerRef.current.close()
      peerRef.current = null
    }

    metadataRef.current = null
    pendingChunksRef.current = []
    setBytesReceived(0)
    setTotalBytesExpected(0)
    isCleaningUpRef.current = false
  }, [])

  const completeRemoteSession = useCallback(async () => {
    const info = sessionInfoRef.current
    if (!info) {
      return
    }
    try {
      await ScanSessionService.completeSession(info.sessionId, info.hostKey, 'host')
    } catch (completionError) {
      console.warn('Failed to mark scan session complete', completionError)
    }
  }, [])

  const resetState = useCallback(async () => {
    await cleanup()
    setSessionInfo(null)
    setQrCodeDataUrl(null)
    setStatus('idle')
    setConnectionState('closed')
    setError(null)
    setReceivedFileName(null)
    setBytesReceived(0)
    setTotalBytesExpected(0)
  }, [cleanup])

  const createSession = useCallback(async () => {
    setStatus('creating')
    setError(null)
    setReceivedFileName(null)

    try {
      const info = await ScanSessionService.createSession()
      setSessionInfo(info)
      setStatus('ready')

      const qrDataUrl = await QRCode.toDataURL(info.guestJoinUrl, {
        errorCorrectionLevel: 'M',
        margin: 1,
        scale: 6,
      })
      setQrCodeDataUrl(qrDataUrl)
    } catch (creationError) {
      console.error('Failed to create scan session', creationError)
      setError(creationError instanceof Error ? creationError.message : 'Failed to create scan session')
      setStatus('error')
    }
  }, [])

  const restart = useCallback(async () => {
    await resetState()
    await createSession()
  }, [resetState, createSession])

  const closeSession = useCallback(async () => {
    await completeRemoteSession()
    await resetState()
  }, [completeRemoteSession, resetState])

  const handleFileComplete = useCallback(async () => {
    const metadata = metadataRef.current
    if (!metadata || !sessionInfo) {
      return
    }

    const totalBytes = pendingChunksRef.current.reduce((sum, chunk) => sum + chunk.byteLength, 0)
    if (totalBytes < metadata.size) {
      return
    }

    setStatus('completed')
    setReceivedFileName(metadata.name)
    console.log('file uploaded by user; name of file', metadata.name)

    try {
      await ScanSessionService.notifyFileReceived(sessionInfo.sessionId, sessionInfo.hostKey, metadata.name, 'host')
    } catch (notifyError) {
      console.warn('Failed to notify backend about file reception', notifyError)
    }

    try {
      dataChannelRef.current?.send(JSON.stringify({ type: 'ack', fileName: metadata.name }))
    } catch (sendError) {
      console.warn('Failed to send ACK to guest device', sendError)
    }

    try {
      const mimeType = metadata.mimeType || 'image/png'
      const blob = new Blob(pendingChunksRef.current, { type: mimeType })
      const fileName = metadata.name || `scan-notes-${Date.now()}.png`
      const file = new File([blob], fileName, { type: mimeType })

      if (options.onImageReady) {
        await options.onImageReady(file)
      }
    } catch (processingError) {
      console.error('Error converting received image for processing:', processingError)
      setStatus('error')
      setError('Failed to process the received image. Try again or use manual upload.')
    } finally {
      pendingChunksRef.current = []
      metadataRef.current = null
    }
  }, [options, sessionInfo])

  useEffect(() => {
    if (isOpen && !sessionInfo && status === 'idle') {
      void createSession()
    }
  }, [isOpen, sessionInfo, status, createSession])

  useEffect(() => {
    if (!isOpen) {
      void closeSession()
    }
  }, [isOpen, closeSession])

  useEffect(() => {
    return () => {
      void closeSession()
    }
  }, [closeSession])

  useEffect(() => {
    if (!sessionInfo || !isOpen) {
      return
    }

    const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    peerRef.current = peer

    setConnectionState(peer.connectionState)

    const dataChannel = peer.createDataChannel('scan-notes-files', { ordered: true })
    dataChannel.binaryType = 'arraybuffer'
    dataChannelRef.current = dataChannel

    dataChannel.onmessage = (event) => {
      if (typeof event.data === 'string') {
        try {
          const message = JSON.parse(event.data)
          if (message.type === 'file-metadata') {
            metadataRef.current = {
              name: message.name,
              size: Number(message.size) || 0,
              mimeType: message.mimeType,
            }
            setStatus('receiving')
            setTotalBytesExpected(Number(message.size) || 0)
            pendingChunksRef.current = []
            setBytesReceived(0)
          } else if (message.type === 'file-complete') {
            void handleFileComplete()
          }
        } catch (parseError) {
          console.warn('Failed to parse data channel message', parseError)
        }
      } else if (event.data instanceof ArrayBuffer) {
        const chunk = new Uint8Array(event.data)
        pendingChunksRef.current.push(chunk)
        setBytesReceived((prev) => prev + chunk.byteLength)
      }
    }

    dataChannel.onopen = () => {
      setStatus((prev) => (prev === 'ready' ? 'connecting' : prev))
    }

    dataChannel.onerror = (event) => {
      console.error('Data channel error', event)
      setError('Connection error while receiving file')
      setStatus('error')
    }

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        void ScanSessionService.submitCandidate(sessionInfo.sessionId, sessionInfo.hostKey, 'host', event.candidate).catch((candidateError) => {
          console.warn('Failed to submit ICE candidate', candidateError)
        })
      }
    }

    peer.onconnectionstatechange = () => {
      setConnectionState(peer.connectionState)
      if (peer.connectionState === 'connected') {
        setStatus((prev) => (prev === 'connecting' ? 'connected' : prev))
      }
      if (['disconnected', 'failed', 'closed'].includes(peer.connectionState)) {
        void closeSession()
      }
    }

    const prepareOffer = async () => {
      try {
        const offer = await peer.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false })
        await peer.setLocalDescription(offer)
        await ScanSessionService.submitOffer(sessionInfo.sessionId, sessionInfo.hostKey, offer)
        setStatus('connecting')
      } catch (offerError) {
        console.error('Failed to create/send offer', offerError)
        setError('Failed to negotiate connection')
        setStatus('error')
      }
    }

    void prepareOffer()

    answerPollRef.current = setInterval(async () => {
      if (!peerRef.current || peerRef.current.currentRemoteDescription) {
        if (answerPollRef.current) {
          clearInterval(answerPollRef.current)
          answerPollRef.current = null
        }
        return
      }
      try {
        const answer = await ScanSessionService.fetchAnswer(sessionInfo.sessionId, sessionInfo.hostKey)
        if (answer && answer.sdp) {
          await peerRef.current.setRemoteDescription({ type: answer.type, sdp: answer.sdp })
          if (answerPollRef.current) {
            clearInterval(answerPollRef.current)
            answerPollRef.current = null
          }
        } else if (Date.now() - new Date(sessionInfo.createdAt).getTime() > 15000) {
          if (answerPollRef.current) {
            clearInterval(answerPollRef.current)
            answerPollRef.current = null
          }
          setError('Timed out waiting for device to respond. Try restarting the scan session.')
          setStatus('error')
        }
      } catch (answerError) {
        if (answerPollRef.current) {
          clearInterval(answerPollRef.current)
          answerPollRef.current = null
        }
        console.warn('Failed to fetch remote answer', answerError)
      }
    }, CHUNK_POLL_INTERVAL)

    candidatePollRef.current = setInterval(async () => {
      if (!peerRef.current) {
        return
      }
      try {
        const batch: CandidateBatchResult = await ScanSessionService.consumeCandidates(
          sessionInfo.sessionId,
          sessionInfo.hostKey,
          'host'
        )
        batch.candidates.forEach((candidate) => {
          if (!candidate) {
            return
          }
          const rtcCandidate = new RTCIceCandidate(candidate as RTCIceCandidateInit)
          void peerRef.current?.addIceCandidate(rtcCandidate).catch((candidateError) => {
            console.warn('Failed to add ICE candidate', candidateError)
          })
        })
      } catch (candidateError) {
        console.warn('Failed to consume ICE candidates', candidateError)
      }
    }, CHUNK_POLL_INTERVAL)

    return () => {
      if (answerPollRef.current) {
        clearInterval(answerPollRef.current)
        answerPollRef.current = null
      }
      if (candidatePollRef.current) {
        clearInterval(candidatePollRef.current)
        candidatePollRef.current = null
      }
      dataChannelRef.current?.close()
      peerRef.current?.close()
      peerRef.current = null
    }
  }, [sessionInfo, isOpen, handleFileComplete, closeSession])

  return useMemo(() => ({
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
  }), [
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
  ])
}

export default useHostScanSession
