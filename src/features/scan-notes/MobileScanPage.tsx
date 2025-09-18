import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { CheckCircle2, Loader2, Smartphone, WifiOff } from 'lucide-react'
import ScanSessionService from '@/lib/scan-session-service'
import { cn } from '@/lib/utils'

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
]

type MobileSessionState =
  | 'initial'
  | 'validating'
  | 'waiting-offer'
  | 'connecting'
  | 'ready-to-send'
  | 'sending'
  | 'completed'
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

const CHUNK_SIZE = 64 * 1024
const POLL_INTERVAL = 1500

export function MobileScanPage() {
  const [state, setState] = useState<MobileSessionState>('initial')
  const [error, setError] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number>(0)
  const [fileName, setFileName] = useState<string>('')
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>('new')

  const { sessionId, guestKey } = useMemo(parseQueryParams, [])

  const peerRef = useRef<RTCPeerConnection | null>(null)
  const dataChannelRef = useRef<RTCDataChannel | null>(null)
  const offerPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const candidatePollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pendingFileRef = useRef<File | null>(null)
  const isMountedRef = useRef(true)

  useEffect(() => {
    return () => {
      isMountedRef.current = false
      dataChannelRef.current?.close()
      peerRef.current?.close()
      if (offerPollRef.current) {
        clearInterval(offerPollRef.current)
      }
      if (candidatePollRef.current) {
        clearInterval(candidatePollRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!sessionId || !guestKey) {
      setError('Missing session information. Please rescan the QR code from Brutal Notes.')
      setState('error')
      return
    }

    const initialise = async () => {
      setState('validating')
      try {
        const validation = await ScanSessionService.validateSession(sessionId, guestKey)
        if (validation.role !== 'guest') {
          throw new Error('This link is not valid for guest devices')
        }
        await setupPeerConnection()
        setState('waiting-offer')
      } catch (validationError) {
        console.error('Failed to validate scan session', validationError)
        setError(validationError instanceof Error ? validationError.message : 'Unable to join scan session')
        setState('error')
      }
    }

    const setupPeerConnection = async () => {
      const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS })
      peerRef.current = peer

      peer.onicecandidate = (event) => {
        if (event.candidate) {
          void ScanSessionService.submitCandidate(sessionId, guestKey, 'guest', event.candidate).catch((candidateError) => {
            console.warn('Failed to submit guest ICE candidate', candidateError)
          })
        }
      }

      peer.onconnectionstatechange = () => {
        setConnectionState(peer.connectionState)
        if (peer.connectionState === 'connected') {
          setState('ready-to-send')
        }
        if (['disconnected', 'failed'].includes(peer.connectionState)) {
          setError('Connection lost. Please return to Brutal Notes and restart Scan Notes.')
          setState('error')
        }
      }

      peer.ondatachannel = (event) => {
        const channel = event.channel
        channel.binaryType = 'arraybuffer'
        dataChannelRef.current = channel

        channel.onopen = () => {
          if (pendingFileRef.current) {
            void sendFile(pendingFileRef.current)
          } else {
            setState('ready-to-send')
          }
        }

        channel.onmessage = (messageEvent) => {
          if (typeof messageEvent.data !== 'string') {
            return
          }
          try {
            const payload = JSON.parse(messageEvent.data)
            if (payload.type === 'ack') {
              setState('completed')
            }
          } catch (ackError) {
            console.warn('Received unrecognised channel message', ackError)
          }
        }
      }

      offerPollRef.current = setInterval(async () => {
        if (!peerRef.current || peerRef.current.currentRemoteDescription) {
          return
        }
        try {
          const offer = await ScanSessionService.fetchOffer(sessionId, guestKey)
          if (offer && offer.sdp) {
            await peerRef.current.setRemoteDescription({ type: offer.type, sdp: offer.sdp })
            const answer = await peerRef.current.createAnswer()
            await peerRef.current.setLocalDescription(answer)
            await ScanSessionService.submitAnswer(sessionId, guestKey, answer)
            if (offerPollRef.current) {
              clearInterval(offerPollRef.current)
              offerPollRef.current = null
            }
            setState('connecting')
          }
        } catch (offerError) {
          console.warn('Failed to process offer', offerError)
        }
      }, POLL_INTERVAL)

      candidatePollRef.current = setInterval(async () => {
        try {
          const batch = await ScanSessionService.consumeCandidates(sessionId, guestKey, 'guest')
          batch.candidates.forEach((candidate) => {
            if (!candidate) {
              return
            }
            const rtcCandidate = new RTCIceCandidate(candidate as RTCIceCandidateInit)
            void peerRef.current?.addIceCandidate(rtcCandidate).catch((candidateError) => {
              console.warn('Failed to add host ICE candidate', candidateError)
            })
          })
        } catch (candidateError) {
          console.warn('Failed to fetch host candidates', candidateError)
        }
      }, POLL_INTERVAL)
    }

    void initialise()
  }, [sessionId, guestKey])

  const sendFile = useCallback(async (file: File) => {
    if (!sessionId || !guestKey) {
      setError('Missing session context')
      setState('error')
      return
    }
    if (!dataChannelRef.current || dataChannelRef.current.readyState !== 'open') {
      pendingFileRef.current = file
      setState('waiting-offer')
      return
    }

    setError(null)
    setState('sending')
    setUploadProgress(0)
    setFileName(file.name)

    try {
      dataChannelRef.current.send(
        JSON.stringify({
          type: 'file-metadata',
          name: file.name,
          size: file.size,
          mimeType: file.type,
        })
      )

      let offset = 0
      while (offset < file.size) {
        const slice = file.slice(offset, offset + CHUNK_SIZE)
        const buffer = await slice.arrayBuffer()
        dataChannelRef.current.send(buffer)
        offset += buffer.byteLength
        setUploadProgress(Math.min(100, Math.floor((offset / file.size) * 100)))
        await new Promise((resolve) => setTimeout(resolve, 0))
      }

      dataChannelRef.current.send(JSON.stringify({ type: 'file-complete' }))
      await ScanSessionService.notifyFileReceived(sessionId, guestKey, file.name, 'guest').catch((notifyError) => {
        console.warn('Guest notification failed', notifyError)
      })
    } catch (sendError) {
      console.error('Failed to send note photo', sendError)
      setError('Failed to send the photo. Please try again.')
      setState('error')
    }
  }, [sessionId, guestKey])

  const handleFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const [file] = event.target.files ?? []
      if (!file) {
        return
      }
      pendingFileRef.current = null
      void sendFile(file)
    },
    [sendFile]
  )

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
      case 'waiting-offer':
      case 'connecting':
        return (
          <div className="mt-4 flex flex-col items-center gap-3 text-sm text-neutral-600">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-center">
              {state === 'validating' && 'Validating secure link…'}
              {state === 'waiting-offer' && 'Connecting to your computer…'}
              {state === 'connecting' && 'Finalising secure connection…'}
              {state === 'initial' && 'Preparing to connect…'}
            </p>
          </div>
        )
      case 'sending':
        return (
          <div className="mt-4 space-y-3 text-sm text-neutral-600">
            <p className="font-semibold">Sending {fileName}</p>
            <div className="h-2 w-full border border-black bg-white">
              <div className="h-full bg-purple-500" style={{ width: `${uploadProgress}%` }} />
            </div>
            <p className="text-xs">{uploadProgress}% complete</p>
          </div>
        )
      case 'ready-to-send':
        return (
          <div className="mt-4 rounded-md border border-dashed border-neutral-400 bg-neutral-100 p-3 text-center text-sm text-neutral-600">
            Connection secured. Choose a photo of your notes to send it instantly.
          </div>
        )
      case 'completed':
        return (
          <div className="mt-4 flex flex-col items-center gap-3 rounded-md border-2 border-black bg-green-100 p-4 text-green-700">
            <CheckCircle2 className="h-6 w-6" />
            <p className="text-center font-semibold">Photo delivered to Brutal Notes!</p>
            <ButtonLink onClick={() => window.history.back()}>Done</ButtonLink>
          </div>
        )
      case 'error':
        return (
          <div className="mt-4 flex flex-col items-center gap-3 rounded-md border-2 border-black bg-yellow-100 p-4 text-yellow-700">
            <WifiOff className="h-6 w-6" />
            <p className="text-center font-semibold">Connection issue</p>
            <p className="text-center text-sm">Please go back to Brutal Notes and tap “Scan Notes” again to start a new session.</p>
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
          <h1 className="text-xl font-black">BRUTAL NOTES — Scan Notes</h1>
          <p className="mt-2 text-sm text-neutral-600">Send a photo of your handwritten notes to your Brutal Notes workspace.</p>
        </div>

        <label className={cn(
          'flex w-full flex-col items-center gap-3 rounded-lg border-2 border-black bg-white p-4 text-center transition hover:bg-neutral-50',
          state === 'sending' && 'pointer-events-none opacity-75'
        )}>
          <span className="text-sm font-semibold">
            {state === 'sending' ? 'Sending photo…' : 'Tap to capture or choose photo'}
          </span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileChange}
            disabled={state === 'sending' || state === 'completed' || !!error}
          />
        </label>

        <p className="text-xs text-neutral-500">WebRTC connection: {connectionState.replace(/_/g, ' ')}</p>

        {renderStatus()}
      </div>
    </div>
  )
}

interface ButtonLinkProps {
  onClick: () => void
  children: ReactNode
}

function ButtonLink({ onClick, children }: ButtonLinkProps) {
  return (
    <button
      onClick={onClick}
      className="rounded border-2 border-black bg-white px-3 py-1 text-xs font-semibold text-neutral-800 shadow-[2px_2px_0px_0px_#000] transition hover:bg-neutral-200"
    >
      {children}
    </button>
  )
}

export default MobileScanPage
