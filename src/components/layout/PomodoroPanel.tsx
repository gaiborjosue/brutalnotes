import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Coffee
} from "lucide-react"
import Star37 from "@/components/stars/s37"

export function PomodoroPanel() {
  const [timeLeft, setTimeLeft] = useState(25 * 60) // 25 minutes in seconds
  const [isActive, setIsActive] = useState(false)
  const [isBreak, setIsBreak] = useState(false)

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null
    
    if (isActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft(timeLeft => timeLeft - 1)
      }, 1000)
    } else if (timeLeft === 0) {
      setIsActive(false)
      // Auto switch between work and break
      if (isBreak) {
        setTimeLeft(25 * 60) // Back to work
        setIsBreak(false)
      } else {
        setTimeLeft(5 * 60) // Break time
        setIsBreak(true)
      }
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [isActive, timeLeft, isBreak])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const toggleTimer = () => {
    setIsActive(!isActive)
  }

  const resetTimer = () => {
    setIsActive(false)
    setTimeLeft(25 * 60)
    setIsBreak(false)
  }

  return (
    <Card className="h-[calc(100%-0.5rem)] border-4 border-black shadow-[4px_4px_0px_0px_#000] bg-white">
      <CardHeader className="border-b-4 border-black bg-red-300 p-3">
        <CardTitle className="text-lg font-black text-black flex items-center gap-2">
          {isBreak ? (
            <>
              <Coffee className="h-5 w-5" />
              BREAK
            </>
          ) : (
            <>
              <Star37 size={20} color="#000" />
              FOCUS
            </>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 h-[calc(100%-4rem)]">
        <div className="space-y-4 h-full flex flex-col">
          {/* Timer Display */}
          <div className="text-center">
            <div className="text-3xl font-black font-mono text-black border-4 border-black p-4 bg-white">
              {formatTime(timeLeft)}
            </div>
          </div>

          {/* Timer Controls */}
          <div className="flex gap-2 justify-center">
            <Button
              onClick={toggleTimer}
              size="sm"
              className={`border-2 border-black shadow-[2px_2px_0px_0px_#000] font-black ${
                isActive 
                  ? "bg-red-400 hover:bg-red-500" 
                  : "bg-green-400 hover:bg-green-500"
              } text-black`}
            >
              {isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            <Button
              onClick={resetTimer}
              size="sm"
              className="border-2 border-black shadow-[2px_2px_0px_0px_#000] bg-gray-400 hover:bg-gray-500 text-black font-black"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>

        </div>
      </CardContent>
    </Card>
  )
}
