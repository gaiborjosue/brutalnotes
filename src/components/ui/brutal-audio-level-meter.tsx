// Brutal Audio Level Meter - for recording visualization

import { useState, useEffect, useRef, useCallback } from "react"

interface BrutalAudioLevelMeterProps {
  isActive: boolean
  analyser: AnalyserNode | null
  className?: string
}

export function BrutalAudioLevelMeter({ isActive, analyser, className = "" }: BrutalAudioLevelMeterProps) {
  const [audioLevel, setAudioLevel] = useState(0)
  const [peakLevel, setPeakLevel] = useState(0)
  const [peakHoldTime, setPeakHoldTime] = useState(0)
  const animationFrameRef = useRef<number | null>(null)

  const analyzeAudio = useCallback(() => {
    if (!analyser || !isActive) return

    const dataArray = new Uint8Array(analyser.frequencyBinCount)
    analyser.getByteFrequencyData(dataArray)

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
      setPeakLevel((prev) => Math.max(prev - 0.02, normalizedLevel))
    }

    if (isActive) {
      animationFrameRef.current = requestAnimationFrame(analyzeAudio)
    }
  }, [analyser, isActive, peakLevel, peakHoldTime])

  useEffect(() => {
    if (isActive && analyser) {
      analyzeAudio()
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      setAudioLevel(0)
      setPeakLevel(0)
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [isActive, analyser])

  // Create level bars (16 segments for compact display)
  const totalBars = 16
  const activeBars = Math.floor(audioLevel * totalBars)
  const peakBar = Math.floor(peakLevel * totalBars)

  return (
    <div className={`flex gap-1 ${className}`}>
      {Array.from({ length: totalBars }, (_, index) => {
        const isActiveBar = index < activeBars
        const isPeak = index === peakBar && peakBar > activeBars

        return (
          <div
            key={index}
            className={`h-4 flex-1 transition-colors duration-75 ${
              isActiveBar
                ? index < totalBars * 0.6
                  ? "bg-green-500" // Green zone (safe)
                  : index < totalBars * 0.8
                    ? "bg-yellow-500" // Yellow zone (caution)
                    : "bg-red-500" // Red zone (peak)
                : isPeak
                  ? "bg-white shadow-[0_0_4px_1px] shadow-white/70" // Peak hold with glow
                  : "bg-neutral-300"
            }`}
            style={{
              minWidth: "4px",
            }}
          />
        )
      })}
    </div>
  )
}
