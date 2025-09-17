// Firebase initialization for Brutal Notes
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyD1cdvmYnNBPWIwa6LLC5dYrXzhaRYIJrE",
  authDomain: "brutalnotes-7b216.firebaseapp.com",
  projectId: "brutalnotes-7b216",
  storageBucket: "brutalnotes-7b216.appspot.com",
  messagingSenderId: "694647027161",
  appId: "1:694647027161:web:3c9c0dd3d2aea95a9c55c8",
  measurementId: "G-TY3YEP7HW8"
};

// Initialize Firebase

export const firebaseApp = initializeApp(firebaseConfig);
export const firebaseAnalytics = getAnalytics(firebaseApp);

// --- Gemini AI Logic Integration ---
// Import Gemini AI Logic SDK
import { getAI, getGenerativeModel, GoogleAIBackend } from "firebase/ai";

// Initialize the Gemini Developer API backend service
export const ai = getAI(firebaseApp, { backend: new GoogleAIBackend() });

// Create a GenerativeModel instance with a model that supports audio processing
export const geminiModel = getGenerativeModel(ai, { model: "gemini-2.5-flash" });

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
