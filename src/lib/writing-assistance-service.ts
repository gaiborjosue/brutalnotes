import { geminiWritingCloudModel } from '@/lib/firebase'
import { getPreferredInputLanguage, supportsBuiltInAI, type BuiltInAIAvailabilityStatus } from '@/lib/chromium-ai'

export type WritingAssistanceProvider = 'built-in' | 'cloud' | 'unavailable'
export type WritingAssistanceErrorKind = 'quota' | 'offline' | 'unknown'

function stripMarkdownCodeFence(text: string): string {
  const trimmed = text.trim()
  const fencedMatch = trimmed.match(/^```(?:markdown|md|text)?\s*([\s\S]*?)\s*```$/i)
  if (fencedMatch) {
    return fencedMatch[1].trim()
  }

  return trimmed
}

function ensureCloudAvailability(): void {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Cloud fallback is unavailable while offline.')
  }
}

async function generateCloudText(prompt: string, input: string): Promise<string> {
  ensureCloudAvailability()

  const result = await geminiWritingCloudModel.generateContent({
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          { text: input },
        ],
      },
    ],
  })

  const text = stripMarkdownCodeFence(result.response.text())
  if (!text) {
    throw new Error('Cloud AI did not return any text.')
  }

  return text
}

function extractRetryDelaySeconds(message: string): number | null {
  const retryMatch = message.match(/retry in\s+(\d+(?:\.\d+)?)s/i)
  if (!retryMatch) {
    return null
  }

  const parsed = Number.parseFloat(retryMatch[1])
  return Number.isFinite(parsed) ? Math.max(1, Math.ceil(parsed)) : null
}

export function getWritingAssistanceErrorDetails(error: unknown): {
  kind: WritingAssistanceErrorKind
  message: string
  retryAfterSeconds: number | null
} {
  const message = error instanceof Error ? error.message : String(error)
  const normalizedMessage = message.toLowerCase()

  if (normalizedMessage.includes('offline')) {
    return {
      kind: 'offline',
      message: 'Cloud fallback is unavailable while offline.',
      retryAfterSeconds: null,
    }
  }

  if (
    normalizedMessage.includes('quota exceeded') ||
    normalizedMessage.includes('[429') ||
    normalizedMessage.includes('rate limit')
  ) {
    return {
      kind: 'quota',
      message: 'Cloud AI quota is temporarily exhausted for writing assistance.',
      retryAfterSeconds: extractRetryDelaySeconds(message),
    }
  }

  return {
    kind: 'unknown',
    message,
    retryAfterSeconds: null,
  }
}

export function resolveWritingAssistanceProvider(
  availabilityStatus: BuiltInAIAvailabilityStatus | null,
  isOnline: boolean,
): WritingAssistanceProvider {
  if (supportsBuiltInAI(availabilityStatus)) {
    return 'built-in'
  }

  if (isOnline) {
    return 'cloud'
  }

  return 'unavailable'
}

export async function summarizeWithCloud(text: string): Promise<string> {
  const language = getPreferredInputLanguage()
  const prompt = `Summarize the note below for quick reference.

Rules:
- Keep the output in the same language as the source text. Prefer ${language} only if the source language is ambiguous.
- Return plain text only. Do not use Markdown, headings, bullet lists, or code fences.
- Keep the summary concise, faithful, and useful for reviewing the note later.
- Do not add commentary before or after the summary.`

  return await generateCloudText(prompt, text)
}
