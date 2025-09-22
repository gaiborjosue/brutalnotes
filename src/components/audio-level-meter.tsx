import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"

export default function AudioLevelMeter() {
  const [isActive, setIsActive] = useState(false)
  const [audioLevel, setAudioLevel] = useState(0)
  const [peakLevel, setPeakLevel] = useState(0)
  const [peakHoldTime, setPeakHoldTime] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const microphoneRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  const startAudioCapture = async () => {
    try {
      setError(null)

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      })

      streamRef.current = stream

      // Create audio context and analyser
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      const analyser = audioContext.createAnalyser()
      const microphone = audioContext.createMediaStreamSource(stream)

      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.8

      microphone.connect(analyser)

      audioContextRef.current = audioContext
      analyserRef.current = analyser
      microphoneRef.current = microphone

      setIsActive(true)

      // Start analyzing audio
      analyzeAudio()
    } catch (err) {
      console.error("Error accessing microphone:", err)
      setError("Failed to access microphone. Please check permissions.")
    }
  }

  const stopAudioCapture = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
    }

    if (audioContextRef.current) {
      audioContextRef.current.close()
    }

    audioContextRef.current = null
    analyserRef.current = null
    microphoneRef.current = null
    streamRef.current = null

    setIsActive(false)
    setAudioLevel(0)
    setPeakLevel(0)
  }

  const analyzeAudio = () => {
    if (!analyserRef.current) return

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
    analyserRef.current.getByteFrequencyData(dataArray)

    // Calculate average volume
    const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length
    const normalizedLevel = Math.min(average / 128, 1) // Normalize to 0-1

    setAudioLevel(normalizedLevel)

    const currentTime = Date.now()
    if (normalizedLevel > peakLevel) {
      setPeakLevel(normalizedLevel)
      setPeakHoldTime(currentTime)
    } else if (currentTime - peakHoldTime > 1500) {
      // Hold for 1.5 seconds
      // Gradually decay the peak
      setPeakLevel((prev) => Math.max(prev - 0.02, normalizedLevel))
    }

    animationFrameRef.current = requestAnimationFrame(analyzeAudio)
  }

  useEffect(() => {
    return () => {
      stopAudioCapture()
    }
  }, [])

  // Create level bars (24 segments like in the reference image)
  const totalBars = 24
  const activeBars = Math.floor(audioLevel * totalBars)
  const peakBar = Math.floor(peakLevel * totalBars)

  return (
    <div className="bg-card border-4 border-foreground p-8 shadow-[8px_8px_0px_0px] shadow-foreground">
      <div className="space-y-6">
        {/* Control Button */}
        <div className="flex justify-center">
          <Button
            onClick={isActive ? stopAudioCapture : startAudioCapture}
            className="bg-primary text-primary-foreground border-2 border-foreground shadow-[4px_4px_0px_0px] shadow-foreground hover:shadow-[2px_2px_0px_0px] hover:shadow-foreground transition-all font-mono font-bold text-lg px-8 py-4"
          >
            {isActive ? "STOP" : "START"} MIC
          </Button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-destructive text-destructive-foreground p-4 border-2 border-foreground font-mono text-center">
            {error}
          </div>
        )}

        {/* Audio Level Display */}
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <span className="font-mono font-bold text-lg text-foreground min-w-[120px]">Input level:</span>

            {/* Level Meter */}
            <div className="flex gap-1 flex-1">
              {Array.from({ length: totalBars }, (_, index) => {
                const isActive = index < activeBars
                const isPeak = index === peakBar && peakBar > activeBars

                return (
                  <div
                    key={index}
                    className={`h-6 flex-1 border-2 border-foreground transition-colors duration-75 ${
                      isActive
                        ? index < totalBars * 0.7
                          ? "bg-orange-500" // Orange zone
                          : index < totalBars * 0.9
                            ? "bg-yellow-500" // Yellow zone
                            : "bg-red-500" // Red zone
                        : isPeak
                          ? "bg-white shadow-[0_0_8px_2px] shadow-white/50" // Bright peak hold with glow
                          : "bg-muted"
                    }`}
                    style={{
                      minWidth: "8px",
                    }}
                  />
                )
              })}
            </div>
          </div>
        </div>

        {/* Status Indicator */}
        <div className="flex items-center justify-center gap-4">
          <div className={`w-4 h-4 border-2 border-foreground ${isActive ? "bg-green-500" : "bg-muted"}`} />
          <span className="font-mono font-bold text-foreground">{isActive ? "RECORDING" : "STOPPED"}</span>
        </div>
      </div>
    </div>
  )
}
