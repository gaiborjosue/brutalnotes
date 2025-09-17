import { useState, useRef, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Mic, Square, Download, FileText, Circle, RotateCcw, Loader2, Upload } from "lucide-react"
import Star8 from "@/components/stars/s8"
import { geminiModel, blobToGenerativePart } from "@/lib/firebase"

interface RecordingPanelProps {
  onInsertContent?: (content: string) => void
}

export function RecordingPanel({ onInsertContent }: RecordingPanelProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [hasRecording, setHasRecording] = useState(false)
  const [audioLevels, setAudioLevels] = useState<number[]>(new Array(20).fill(0))
  const [isConverting, setIsConverting] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [generatedNotes, setGeneratedNotes] = useState<string | null>(null)
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const animationRef = useRef<number | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  
  const MAX_RECORDING_TIME = 15 * 60 // 15 minutes in seconds

  // Clean up audio URL when component unmounts
  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl)
      }
    }
  }, [audioUrl])

  // Audio level visualization
  const updateAudioLevels = useCallback(() => {
    if (!analyserRef.current) return

    const bufferLength = analyserRef.current.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)
    analyserRef.current.getByteFrequencyData(dataArray)

    // Create a simplified visualization with 20 bars
    const newLevels = []
    const groupSize = Math.floor(bufferLength / 20)
    
    for (let i = 0; i < 20; i++) {
      let sum = 0
      for (let j = 0; j < groupSize; j++) {
        sum += dataArray[i * groupSize + j]
      }
      newLevels.push((sum / groupSize) / 255 * 100)
    }
    
    setAudioLevels(newLevels)
    // Continue the animation loop only if we're still recording
    if (mediaRecorderRef.current?.state === 'recording') {
      animationRef.current = requestAnimationFrame(updateAudioLevels)
    }
  }, [])

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        } 
      })
      
      streamRef.current = stream
      
      // Set up audio context for visualization
      audioContextRef.current = new AudioContext()
      analyserRef.current = audioContextRef.current.createAnalyser()
      const source = audioContextRef.current.createMediaStreamSource(stream)
      source.connect(analyserRef.current)
      analyserRef.current.fftSize = 256
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      })
      
      mediaRecorderRef.current = mediaRecorder
      const chunks: BlobPart[] = []
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data)
        }
      }
      
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm;codecs=opus' })
        setAudioBlob(blob)
        
        // Clean up previous URL
        if (audioUrl) {
          URL.revokeObjectURL(audioUrl)
        }
        
        const url = URL.createObjectURL(blob)
        setAudioUrl(url)
        setHasRecording(true)
        
        // Clean up stream
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop())
          streamRef.current = null
        }
        
        // Clean up audio context
        if (audioContextRef.current) {
          audioContextRef.current.close()
          audioContextRef.current = null
        }
      }
      
      mediaRecorder.start()
      setIsRecording(true)
      setRecordingTime(0)
      setAudioLevels(new Array(20).fill(0))
      
      // Start timer
      intervalRef.current = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= MAX_RECORDING_TIME) {
            stopRecording()
            return prev
          }
          return prev + 1
        })
      }, 1000)
      
      // Start audio visualization
      updateAudioLevels()
      
    } catch (error) {
      console.error('Error starting recording:', error)
      alert('Could not access microphone. Please check permissions.')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
    
    setIsRecording(false)
    
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }
    
    setAudioLevels(new Array(20).fill(0))
  }

  const downloadRecording = () => {
    if (audioBlob && audioUrl) {
      const a = document.createElement('a')
      a.href = audioUrl
      a.download = `lecture-recording-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.webm`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    }
  }

  const convertToNotes = async () => {
    if (!audioBlob) {
      console.error('No audio recording available to convert')
      return
    }

    setIsConverting(true)
    setGeneratedNotes(null)

    try {
      // Convert the audio blob to the format Gemini expects
      const audioPart = await blobToGenerativePart(audioBlob)
      
      // Create a detailed prompt for generating compact, relevant notes
      const prompt = `Please transcribe and convert this audio recording into structured, compact lecture notes in markdown format. 

Requirements:
- Only include the most important and relevant information
- Use clear headings (##), bullet points, and emphasis (**bold**, *italic*) 
- Organize content logically with proper structure
- Remove filler words, "um"s, repetitions, and irrelevant content
- Focus on key concepts, definitions, examples, and actionable insights
- Keep it concise but comprehensive
- Use markdown formatting for better readability

Format the output as clean markdown that captures the essence of the lecture.`

      // Generate content using the Gemini model
      const result = await geminiModel.generateContent([prompt, audioPart])
      const generatedText = result.response.text()
      
      if (generatedText) {
        setGeneratedNotes(generatedText)
        
        // Insert the generated notes directly into the editor
        if (onInsertContent) {
          // Add some formatting to make it clear these are generated notes
          const formattedNotes = `## 📝 Generated Lecture Notes\n\n${generatedText}\n\n---\n\n`
          onInsertContent(formattedNotes)
          console.log('Generated notes inserted into editor:', generatedText.substring(0, 100) + '...')
        } else {
          console.log('Generated notes:', generatedText)
        }
      } else {
        throw new Error('No text generated from audio')
      }
      
    } catch (error) {
      console.error('Error converting audio to notes:', error)
      alert('Failed to convert audio to notes. Please try again.')
    } finally {
      setIsConverting(false)
    }
  }

  const startNewRecording = () => {
    setHasRecording(false)
    setAudioBlob(null)
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl)
    }
    setAudioUrl(null)
    setRecordingTime(0)
    setGeneratedNotes(null)
    setIsConverting(false)
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Check if it's an audio file - be more permissive with MIME types
    const isAudioFile = file.type.startsWith('audio/') || 
                       file.type === 'video/webm' || // WebM can contain audio
                       file.type === 'application/ogg' || // Some OGG files
                       file.type === '' && /\.(mp3|wav|ogg|m4a|aac|flac|opus|webm)$/i.test(file.name)
    
    if (!isAudioFile) {
      alert('Please select an audio file (mp3, wav, ogg, m4a, aac, flac, opus, webm).')
      return
    }

    console.log('Uploaded file:', file.name, 'MIME type:', file.type, 'Size:', file.size)

    // Check file size (limit to ~100MB)
    const maxSize = 100 * 1024 * 1024 // 100MB in bytes
    if (file.size > maxSize) {
      alert('File size too large. Please select a file smaller than 100MB.')
      return
    }

    // Create blob from file
    setAudioBlob(file)
    
    // Clean up previous URL
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl)
    }
    
    // Create new URL for the uploaded file
    const url = URL.createObjectURL(file)
    setAudioUrl(url)
    setHasRecording(true)
    
    // Calculate approximate duration from file size (rough estimate)
    // This is just for display purposes, actual duration would need audio analysis
    const estimatedDuration = Math.min(file.size / 32000, MAX_RECORDING_TIME) // Rough estimate
    setRecordingTime(Math.floor(estimatedDuration))
    
    console.log('Audio file uploaded:', file.name, 'Size:', (file.size / 1024 / 1024).toFixed(2) + 'MB')
  }

  const triggerFileUpload = () => {
    fileInputRef.current?.click()
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const progressPercentage = (recordingTime / MAX_RECORDING_TIME) * 100

  return (
    <Card className="h-full min-h-0 border-4 border-black shadow-[4px_4px_0px_0px_#000] bg-white">
      <CardHeader className="border-b-4 border-black bg-purple-300 p-3">
        <CardTitle className="text-lg font-black text-black flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Star8 size={20} color="#000" />
            RECORD LECTURE
          </span>
          {hasRecording && (
            <button
              onClick={startNewRecording}
              className="flex items-center gap-1 text-sm font-black text-black hover:text-gray-700 transition-colors"
              title="New Audio"
            >
              <RotateCcw size={16} />
              <span>NEW AUDIO</span>
            </button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-2 h-[calc(100%-3.25rem)] flex flex-col gap-2 overflow-auto min-h-0">
        {/* Recording Status */}
        <div className="mx-2">
          <div className="flex items-center justify-between text-black font-bold">
            <div className="flex items-center gap-2">
              {isRecording && (
                <Circle className="w-3 h-3 fill-red-500 text-red-500 animate-pulse" />
              )}
              <span className="text-sm font-black font-mono">
                {formatTime(recordingTime)}
              </span>
            </div>
            <span className="text-sm font-bold text-gray-600">
              Max: {formatTime(MAX_RECORDING_TIME)} (beta)
            </span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mx-2">
          <Progress value={progressPercentage} className="h-3 border-2 border-black" />
        </div>

        {/* Audio Visualization */}
        {isRecording && (
          <div className="mx-2">
            <div className="flex items-end justify-center gap-1 h-8 px-2 border-2 border-black bg-gray-100">
              {audioLevels.map((level, index) => (
                <div
                  key={index}
                  className="bg-purple-500 w-1 border border-black transition-all duration-75 ease-out"
                  style={{
                    height: `${Math.max(3, level * 0.4)}px`,
                    opacity: level > 0 ? 1 : 0.3
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Recording Controls */}
        {!hasRecording && (
          <div className="mx-2">
            {!isRecording ? (
              <div className="flex gap-2">
                <Button 
                  onClick={startRecording} 
                  className="flex-1 text-sm border-2 border-black shadow-[2px_2px_0px_0px_#000] bg-blue-400 hover:bg-blue-500 text-black font-black py-2 h-10"
                  variant="default"
                >
                  <Mic className="w-4 h-4 mr-2" />
                  START RECORDING
                </Button>
                <Button 
                  onClick={triggerFileUpload} 
                  className="border-2 border-black shadow-[2px_2px_0px_0px_#000] bg-green-400 hover:bg-green-500 text-black font-black py-2 px-4 h-10"
                  variant="default"
                  title="Upload Audio File"
                >
                  <Upload className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <Button 
                onClick={stopRecording} 
                className="w-full text-sm border-2 border-black shadow-[2px_2px_0px_0px_#000] bg-red-500 hover:bg-red-600 text-white font-black py-2 h-10"
                variant="default"
              >
                <Square className="w-4 h-4 mr-2" />
                STOP RECORDING
              </Button>
            )}
            
            {/* Hidden file input for upload */}
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />
          </div>
        )}

        {/* Post-Recording Actions */}
        {hasRecording && !isRecording && (
          <div className="flex flex-col gap-1">
            {/* Audio Preview */}
            {audioUrl && (
              <div className="mx-1">
                <div className="p-1">
                  <audio 
                    controls
                    className="w-full h-3"
                    style={{ outline: 'none' }}
                    controlsList="nodownload noremoteplayback nofullscreen noplaybackrate"
                    src={audioUrl}
                  />
                </div>
              </div>

            )}
            
            {/* Action Buttons */}
            <div className="mx-2">
              <div className="flex gap-2">
                <Button 
                  onClick={convertToNotes} 
                  disabled={isConverting}
                  className="flex-1 text-sm border-2 border-black shadow-[2px_2px_0px_0px_#000] bg-purple-400 hover:bg-purple-500 disabled:bg-gray-300 disabled:cursor-not-allowed text-black font-black py-2 h-10"
                  variant="default"
                >
                  {isConverting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      CONVERTING...
                    </>
                  ) : (
                    <>
                      <FileText className="w-4 h-4 mr-2" />
                      CONVERT TO NOTES
                    </>
                  )}
                </Button>
                <Button 
                  onClick={downloadRecording} 
                  className="border-2 border-black shadow-[2px_2px_0px_0px_#000] bg-yellow-400 hover:bg-yellow-500 text-black font-black py-2 px-4 h-10"
                  variant="neutral"
                >
                  <Download className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
