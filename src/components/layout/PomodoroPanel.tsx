import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { 
  Play, 
  Pause, 
  RotateCcw,
  Target
} from "lucide-react"
import Star37 from "@/components/stars/s37"
import Star34 from "@/components/stars/s34"
import Star36 from "@/components/stars/s36"

interface PomodoroSettings {
  workDuration: number
  shortBreakDuration: number
  longBreakDuration: number
  sessionsUntilLongBreak: number
  soundEnabled: boolean
}

const DEFAULT_SETTINGS: PomodoroSettings = {
  workDuration: 25,
  shortBreakDuration: 5,
  longBreakDuration: 15,
  sessionsUntilLongBreak: 4,
  soundEnabled: true
}

export function PomodoroPanel() {
  const [settings] = useState<PomodoroSettings>(DEFAULT_SETTINGS)
  const [timeLeft, setTimeLeft] = useState(settings.workDuration * 60)
  const [isActive, setIsActive] = useState(false)
  const [isBreak, setIsBreak] = useState(false)
  const [isLongBreak, setIsLongBreak] = useState(false)
  const [completedSessions, setCompletedSessions] = useState(0)
  const [dailySessions, setDailySessions] = useState(0)

  // Notification and sound functions
  const playNotificationSound = useCallback(() => {
    if (settings.soundEnabled) {
      // Create a simple beep sound
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()
      
      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)
      
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime)
      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5)
      
      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + 0.5)
    }
  }, [settings.soundEnabled])

  const showNotification = useCallback((title: string, body: string) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/favicon.ico' })
    }
  }, [])

  const requestNotificationPermission = useCallback(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  useEffect(() => {
    requestNotificationPermission()
  }, [requestNotificationPermission])

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null
    
    if (isActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft(timeLeft => timeLeft - 1)
      }, 1000)
    } else if (timeLeft === 0) {
      setIsActive(false)
      playNotificationSound()
      
      // Auto switch between work and break
      if (isBreak || isLongBreak) {
        // Break finished, back to work
        showNotification('🍅 Break Over!', 'Time to get back to work!')
        setTimeLeft(settings.workDuration * 60)
        setIsBreak(false)
        setIsLongBreak(false)
      } else {
        // Work session completed
        const newCompletedSessions = completedSessions + 1
        setCompletedSessions(newCompletedSessions)
        setDailySessions(prev => prev + 1)
        
        // Check if it's time for a long break
        if (newCompletedSessions % settings.sessionsUntilLongBreak === 0) {
          showNotification('🎉 Long Break Time!', 'You\'ve completed 4 sessions! Take a longer break.')
          setTimeLeft(settings.longBreakDuration * 60)
          setIsLongBreak(true)
        } else {
          showNotification('✅ Session Complete!', 'Great work! Time for a short break.')
          setTimeLeft(settings.shortBreakDuration * 60)
          setIsBreak(true)
        }
      }
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [isActive, timeLeft, isBreak, isLongBreak, completedSessions, settings, playNotificationSound, showNotification])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const getCurrentSessionDuration = () => {
    if (isLongBreak) return settings.longBreakDuration * 60
    if (isBreak) return settings.shortBreakDuration * 60
    return settings.workDuration * 60
  }

  const getProgressPercentage = () => {
    const total = getCurrentSessionDuration()
    return ((total - timeLeft) / total) * 100
  }

  const toggleTimer = () => {
    setIsActive(!isActive)
  }

  const resetTimer = () => {
    setIsActive(false)
    setTimeLeft(settings.workDuration * 60)
    setIsBreak(false)
    setIsLongBreak(false)
  }

  const skipSession = () => {
    setIsActive(false)
    if (isBreak || isLongBreak) {
      setTimeLeft(settings.workDuration * 60)
      setIsBreak(false)
      setIsLongBreak(false)
    } else {
      setTimeLeft(settings.shortBreakDuration * 60)
      setIsBreak(true)
    }
  }

  return (
    <Card className="h-[calc(100%-0.5rem)] border-4 border-black shadow-[4px_4px_0px_0px_#000] bg-white">
      <CardHeader className="border-b-4 border-black bg-red-300 p-3">
        <CardTitle className="text-lg font-black text-black flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isLongBreak ? (
              <>
                <Star36 className="h-5 w-5" />
                LONG BREAK
              </>
            ) : isBreak ? (
              <>
                <Star34 className="h-5 w-5" />
                SHORT BREAK
              </>
            ) : (
              <>
                <Star37 size={20} color="#000" />
                FOCUS
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            <span className="text-sm">{dailySessions}</span>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-2 h-[calc(100%-4rem)]">
        <div className="h-full flex flex-col justify-center space-y-2 -mt-1">
          {/* Progress Ring */}
          <div className="text-center">
            <Progress 
              value={getProgressPercentage()} 
              className="h-2 border-2 border-black mb-1"
            />
            <div className="text-2xl font-black font-mono text-black border-4 border-black p-2 bg-white">
              {formatTime(timeLeft)}
            </div>
          </div>

          

          {/* Timer Controls */}
          <div className="flex gap-1 justify-center">
            <Button
              onClick={toggleTimer}
              size="sm"
              className={`border-2 border-black shadow-[2px_2px_0px_0px_#000] font-black px-3 ${
                isActive 
                  ? "bg-red-400 hover:bg-red-500" 
                  : "bg-green-400 hover:bg-green-500"
              } text-black`}
            >
              {isActive ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            </Button>
            <Button
              onClick={resetTimer}
              size="sm"
              className="border-2 border-black shadow-[2px_2px_0px_0px_#000] bg-gray-400 hover:bg-gray-500 text-black font-black px-3"
            >
              <RotateCcw className="h-3 w-3" />
            </Button>
            <Button
              onClick={skipSession}
              size="sm"
              className="border-2 border-black shadow-[2px_2px_0px_0px_#000] bg-blue-400 hover:bg-blue-500 text-black font-black px-3"
              title="Skip to next session"
            >
              ⏭
            </Button>
          </div>

          {/* Current Session Info */}
          <div className="text-center text-xs font-black text-gray-600">
            {isLongBreak ? (
              "LONG BREAK!"
            ) : isBreak ? (
              "SHORT BREAK"
            ) : (
              "FOCUS TIME"
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
