// Firebase initialization for Brutal Notes
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode } from "firebase/ai";

const firebaseConfig = {
  apiKey: "AIzaSyD1cdvmYnNBPWIwa6LLC5dYrXzhaRYIJrE",
  authDomain: "brutalnotes-7b216.firebaseapp.com",
  projectId: "brutalnotes-7b216",
  storageBucket: "brutalnotes-7b216.firebasestorage.app",
  messagingSenderId: "694647027161",
  appId: "1:694647027161:web:3c9c0dd3d2aea95a9c55c8",
  measurementId: "G-TY3YEP7HW8"
};

// Initialize Firebase
export const firebaseApp = initializeApp(firebaseConfig);
export const firebaseAnalytics = getAnalytics(firebaseApp);

// Enable App Check debug token when running locally so reCAPTCHA isn't required
if (typeof window !== 'undefined') {
  const debugHosts = new Set(['localhost', '127.0.0.1']);
  if (debugHosts.has(window.location.hostname)) {
    (globalThis as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN =
      '1AC95824-DCDB-4503-B783-E4768E8CA086';
    console.info('🔐 Firebase App Check debug token enabled for local development');
  }
}

// Initialize App Check with reCAPTCHA v3 for security
export const appCheck = initializeAppCheck(firebaseApp, {
  provider: new ReCaptchaV3Provider('6LerqMwrAAAAAP0Vi3vZ9AOJWsy3hcJZF6MDge4c'),
  
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

// Converts a Blob object to a Part object for Gemini
export async function blobToGenerativePart(blob: Blob) {
  const base64EncodedDataPromise = new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Split to remove the data URL prefix (data:audio/webm;base64,)
      resolve(result.split(',')[1]);
    };
    reader.readAsDataURL(blob);
  });
  
  return {
    inlineData: { 
      data: await base64EncodedDataPromise, 
      mimeType: blob.type 
    },
  };
}
