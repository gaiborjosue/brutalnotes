export type BuiltInAIAvailabilityStatus = Availability | 'unsupported'

const BUILT_IN_AI_UNAVAILABLE: BuiltInAIAvailabilityStatus = 'unsupported'
const SUMMARIZER_SUPPORTED_LANGUAGES = ['en', 'es', 'ja'] as const

const getBuiltInAIGlobals = () =>
  globalThis as typeof globalThis & {
    Summarizer?: typeof Summarizer
  }

export function supportsBuiltInAI(status: BuiltInAIAvailabilityStatus | null): boolean {
  return status !== null && status !== 'unsupported' && status !== 'unavailable'
}

export function builtInAINeedsDownload(status: BuiltInAIAvailabilityStatus | null): boolean {
  return status === 'downloadable' || status === 'downloading'
}

export function getPreferredInputLanguage(): string {
  const browserLanguage =
    (typeof navigator !== 'undefined' && (navigator.languages?.[0] || navigator.language)) || 'en'

  return browserLanguage.split('-')[0].toLowerCase()
}

function resolveBuiltInSupportedLanguage(
  supportedLanguages: readonly string[],
  fallbackLanguage = 'en',
): string {
  const preferredLanguage = getPreferredInputLanguage()
  return supportedLanguages.includes(preferredLanguage) ? preferredLanguage : fallbackLanguage
}

function getSummarizerLanguageOptions(): SummarizerCreateOptions {
  const outputLanguage = resolveBuiltInSupportedLanguage(SUMMARIZER_SUPPORTED_LANGUAGES)

  return {
    type: 'key-points',
    format: 'plain-text',
    length: 'medium',
    expectedInputLanguages: [...SUMMARIZER_SUPPORTED_LANGUAGES],
    outputLanguage,
    expectedContextLanguages: [outputLanguage],
  }
}

export function assertBuiltInAIUserActivation(actionName: string): void {
  if (typeof navigator !== 'undefined' && navigator.userActivation && !navigator.userActivation.isActive) {
    throw new Error(`${actionName} must be started from a direct click or key press.`)
  }
}

export function createBuiltInAIDownloadMonitor(
  setDownloading: (value: boolean) => void,
  setProgress: (value: number) => void,
): CreateMonitorCallback {
  return monitor => {
    setDownloading(true)
    setProgress(0)

    monitor.addEventListener('downloadprogress', event => {
      const nextProgress = Math.max(0, Math.min(100, Math.round(event.loaded * 100)))
      setProgress(nextProgress)

      if (nextProgress >= 100) {
        setDownloading(false)
      }
    })
  }
}

export function finalizeBuiltInAIDownload(
  setDownloading: (value: boolean) => void,
  setProgress: (value: number) => void,
): void {
  setDownloading(false)
  setProgress(100)
}

export async function getSummarizerAvailability(): Promise<BuiltInAIAvailabilityStatus> {
  const api = getBuiltInAIGlobals().Summarizer
  if (!api) {
    return BUILT_IN_AI_UNAVAILABLE
  }

  return await api.availability(getSummarizerLanguageOptions())
}

export async function createSummarizerSession(monitor?: CreateMonitorCallback): Promise<Summarizer> {
  const api = getBuiltInAIGlobals().Summarizer
  if (!api) {
    throw new Error('Summarizer API is unavailable in this browser.')
  }

  assertBuiltInAIUserActivation('Summarizing')

  return await api.create({
    ...getSummarizerLanguageOptions(),
    monitor,
  })
}
