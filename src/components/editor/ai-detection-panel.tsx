"use client"

import { Bot, X, AlertTriangle, Check, Eye } from "lucide-react"
import { Pie, PieChart, Cell } from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { AIDetectionResponse } from "@/lib/ai-detection-service"

interface AIDetectionPanelProps {
  result: AIDetectionResponse | null
  isVisible: boolean
  onClose: () => void
}

export function AIDetectionPanel({ result, isVisible, onClose }: AIDetectionPanelProps) {
  
  if (!isVisible || !result) return null

  // Convert score to percentage
  const aiPercentage = Math.round(result.score * 100)
  const humanPercentage = 100 - aiPercentage

  // Create chart data
  const chartData = [
    { 
      name: "AI Generated ", 
      value: aiPercentage, 
      fill: aiPercentage > 50 ? "#ef4444" : "#f59e0b" // Red if high AI, orange if moderate
    },
    { 
      name: "Human Written ", 
      value: humanPercentage, 
      fill: humanPercentage > 50 ? "#22c55e" : "#94a3b8" // Green if mostly human, gray if less
    }
  ]

  const chartConfig = {
    value: {
      label: "Percentage",
    },
  } satisfies ChartConfig

  // Determine confidence level and status
  const getStatus = (score: number) => {
    if (score >= 0.8) return { label: "High AI Confidence", color: "text-red-600", icon: AlertTriangle }
    if (score >= 0.5) return { label: "Moderate AI Confidence", color: "text-yellow-600", icon: Eye }
    if (score >= 0.2) return { label: "Low AI Confidence", color: "text-blue-600", icon: Eye }
    return { label: "Likely Human", color: "text-green-600", icon: Check }
  }

  const status = getStatus(result.score)
  const StatusIcon = status.icon



  return (
    <Card className="fixed right-4 top-20 z-50 flex max-h-[80vh] w-[min(20rem,calc(100vw-2rem))] flex-col overflow-hidden">
      <CardHeader className="border-b-2 border-border bg-main/20 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Bot className="size-5 text-blue-600" />
            <div>
              <CardTitle className="text-base">AI Detection Results</CardTitle>
              <CardDescription>Review the model confidence for this note.</CardDescription>
            </div>
          </div>
          <Button variant="neutral" size="sm" onClick={onClose} className="size-8 p-0">
            <X data-icon="inline-start" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto px-4 py-4">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <StatusIcon className={`size-5 ${status.color}`} />
                AI Detection Score
              </CardTitle>
              <CardDescription>
                Overall confidence: {aiPercentage}% AI-generated
              </CardDescription>
            </CardHeader>
            <CardContent className="pb-2">
              <ChartContainer
                config={chartConfig}
                className="mx-auto aspect-square max-h-[200px]"
              >
                <PieChart>
                  <ChartTooltip
                    cursor={false}
                    content={<ChartTooltipContent hideLabel />}
                  />
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="name"
                    startAngle={90}
                    endAngle={-270}
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
              <div className="mt-2 flex justify-center">
                <Badge variant={result.score > 0.5 ? "destructive" : "secondary"} className={status.color}>
                  {status.label}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {result.sentence_scores && result.sentence_scores.filter(s => s.score > 0.5).length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="size-4 text-red-500" />
                  AI-Detected Sentences
                </CardTitle>
                <CardDescription>
                  Sentences with &gt;50% AI confidence
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-h-[300px] space-y-3 overflow-y-auto">
                  {result.sentence_scores
                    .filter(s => s.score > 0.5)
                    .sort((a, b) => b.score - a.score)
                    .map((sentence, index) => (
                      <div key={index} className="rounded-base border-2 border-red-300 bg-red-50 px-3 py-2">
                        <div className="mb-1 flex items-center justify-between">
                          <Badge variant="destructive" className="text-xs">
                            {(sentence.score * 100).toFixed(1)}% AI
                          </Badge>
                        </div>
                        <p className="text-sm leading-relaxed text-foreground">
                          {sentence.sentence}
                        </p>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}

          {result.sentence_scores && result.sentence_scores.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Detection Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-foreground/70">Total Sentences:</span>
                    <span>{result.sentence_scores.length}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-foreground/70">AI-Detected (High Confidence):</span>
                    <span className="font-medium text-red-600">
                      {result.sentence_scores.filter(s => s.score > 0.6).length}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-foreground/70">Likely Human:</span>
                    <span className="font-medium text-green-600">
                      {result.sentence_scores.filter(s => s.score <= 0.6).length}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Analysis Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-foreground/70">Text Length:</span>
                <span>{result.text.length} characters</span>
              </div>
              {result.tokens && (
                <div className="flex justify-between gap-4">
                  <span className="text-foreground/70">Tokens Analyzed:</span>
                  <span>{result.tokens.length}</span>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <span className="text-foreground/70">Confidence Score:</span>
                <span>{result.score.toFixed(3)}</span>
              </div>
              {result.sentence_scores && (
                <div className="flex justify-between gap-4">
                  <span className="text-foreground/70">Sentences:</span>
                  <span>{result.sentence_scores.length}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  )
}
