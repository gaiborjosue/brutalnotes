// Firebase initialization for Brutal Notes
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode } from "firebase/ai";

function getRequiredEnv(name: string): string {
  const value = import.meta.env[name]?.trim()

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

const firebaseConfig = {
  apiKey: getRequiredEnv('VITE_FIREBASE_API_KEY'),
  authDomain: getRequiredEnv('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: getRequiredEnv('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: getRequiredEnv('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: getRequiredEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: getRequiredEnv('VITE_FIREBASE_APP_ID'),
  measurementId: getRequiredEnv('VITE_FIREBASE_MEASUREMENT_ID'),
};

// Initialize Firebase
export const firebaseApp = initializeApp(firebaseConfig);
export const firebaseAnalytics = getAnalytics(firebaseApp);

const firebaseRecaptchaSiteKey = getRequiredEnv('VITE_FIREBASE_RECAPTCHA_SITE_KEY')

const firebaseAppCheckDebugToken =
  import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN?.trim() || ''

// Enable App Check debug token when running locally so reCAPTCHA isn't required
if (typeof window !== 'undefined') {
  const debugHosts = new Set(['localhost', '127.0.0.1']);
  if (debugHosts.has(window.location.hostname) && firebaseAppCheckDebugToken) {
    (globalThis as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN =
      firebaseAppCheckDebugToken;
  }
}

// Initialize App Check with reCAPTCHA v3 for security
export const appCheck = initializeAppCheck(firebaseApp, {
  provider: new ReCaptchaV3Provider(firebaseRecaptchaSiteKey),
  
  // Optional argument. If true, the SDK automatically refreshes App Check
  // tokens as needed.
  isTokenAutoRefreshEnabled: true
});

// --- Gemini AI Logic Integration ---
// Import Gemini AI Logic SDK
// Initialize the Gemini Developer API backend service
export const ai = getAI(firebaseApp, { backend: new GoogleAIBackend() });

// Create a hybrid GenerativeModel instance that prefers on-device inference when available
export const geminiModel = getGenerativeModel(ai, {
  model: "gemini-2.5-flash",
  mode: InferenceMode.PREFER_ON_DEVICE,
  inCloudParams: {
    model: "gemini-2.5-flash",
  }
});

export const geminiCloudModel = getGenerativeModel(ai, {
  model: "gemini-2.5-flash",
  mode: InferenceMode.ONLY_IN_CLOUD,
  inCloudParams: {
    model: "gemini-2.5-flash",
  }
});

// Writing assistance does not need the heavier cloud model and should not compete
// with scan/transcription traffic for the same per-model quota bucket.
export const geminiWritingCloudModel = getGenerativeModel(ai, {
  model: "gemini-2.0-flash-lite",
  mode: InferenceMode.ONLY_IN_CLOUD,
  inCloudParams: {
    model: "gemini-2.0-flash-lite",
  }
});

const DEFAULT_AUDIO_MIME = 'audio/webm;codecs=opus'

function guessMimeFromExtension(fileName?: string): string {
  if (!fileName) return ''
  const ext = fileName.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'mp3':
      return 'audio/mpeg'
    case 'wav':
      return 'audio/wav'
    case 'ogg':
    case 'oga':
      return 'audio/ogg'
    case 'm4a':
    case 'mp4':
      return 'audio/mp4'
    case 'aac':
      return 'audio/aac'
    case 'flac':
      return 'audio/flac'
    case 'opus':
      return 'audio/ogg;codecs=opus'
    case 'webm':
      return DEFAULT_AUDIO_MIME
    default:
      return ''
  }
}

export function normalizeAudioMimeType(rawMime?: string, fileName?: string): string {
  let normalized = (rawMime || '').trim().toLowerCase()

  if (!normalized && fileName) {
    normalized = guessMimeFromExtension(fileName)
  }

  if (!normalized || normalized === 'application/octet-stream') {
    normalized = DEFAULT_AUDIO_MIME
  }

  if (normalized.startsWith('video/')) {
    normalized = normalized.replace('video/', 'audio/')
  }

  if (normalized.startsWith('audio/webm') && !normalized.includes('codecs=')) {
    normalized = `${normalized};codecs=opus`
  }

  return normalized
}

// Converts a Blob object to a Part object for Gemini
export async function blobToGenerativePart(blob: Blob) {
  const base64EncodedDataPromise = new Promise<{ data: string; mime?: string }>((resolve) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      const [metadata, data] = result.split(',')
      const mimeMatch = metadata?.match(/^data:(.*);base64$/)
      resolve({
        data: data ?? '',
        mime: mimeMatch?.[1]
      })
    }
    reader.readAsDataURL(blob)
  })

  const { data, mime } = await base64EncodedDataPromise
  const fileName = (blob as File).name ?? undefined
  const mimeType = normalizeAudioMimeType(mime || blob.type, fileName)

  return {
    inlineData: {
      data,
      mimeType
    },
  }
}
