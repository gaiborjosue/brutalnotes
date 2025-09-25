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
    <div className="fixed right-4 top-20 w-80 max-h-[80vh] bg-white dark:bg-gray-900 border rounded-lg shadow-lg z-50 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <Bot className="size-5 text-blue-500" />
          <h3 className="font-semibold">AI Detection Results</h3>
        </div>
        <Button variant="neutral" size="sm" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      {/* Content - Scrollable */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Overall Score Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
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
            <div className="flex justify-center mt-2">
              <Badge variant={result.score > 0.5 ? "destructive" : "secondary"} className={status.color}>
                {status.label}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* AI Detected Sentences */}
        {result.sentence_scores && result.sentence_scores.filter(s => s.score > 0.5).length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="size-4 text-red-500" />
                AI-Detected Sentences
              </CardTitle>
              <CardDescription>
                Sentences with &gt;50% AI confidence
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {result.sentence_scores
                  .filter(s => s.score > 0.5)
                  .sort((a, b) => b.score - a.score)
                  .map((sentence, index) => (
                    <div key={index} className="border-l-4 border-l-red-400 pl-3 py-2 bg-red-50 dark:bg-red-950/20 rounded-r">
                      <div className="flex items-center justify-between mb-1">
                        <Badge 
                          variant="destructive" 
                          className="text-xs"
                        >
                          {(sentence.score * 100).toFixed(1)}% AI
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                        {sentence.sentence}
                      </p>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Summary of detected sentences */}
        {result.sentence_scores && result.sentence_scores.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Detection Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-300">Total Sentences:</span>
                  <span>{result.sentence_scores.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-300">AI-Detected (High Confidence):</span>
                  <span className="text-red-600 font-medium">
                    {result.sentence_scores.filter(s => s.score > 0.6).length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-300">Likely Human:</span>
                  <span className="text-green-600 font-medium">
                    {result.sentence_scores.filter(s => s.score <= 0.6).length}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Analysis Details */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Analysis Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-300">Text Length:</span>
              <span>{result.text.length} characters</span>
            </div>
            {result.tokens && (
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-300">Tokens Analyzed:</span>
                <span>{result.tokens.length}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-300">Confidence Score:</span>
              <span>{result.score.toFixed(3)}</span>
            </div>
            {result.sentence_scores && (
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-300">Sentences:</span>
                <span>{result.sentence_scores.length}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
