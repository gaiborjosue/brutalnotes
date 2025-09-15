import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from "path"
import tailwindcss from "@tailwindcss/vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    strictPort: false,
    cors: {
      origin: [
        'http://localhost:5173',
        'http://localhost:5174',
        'http://localhost:3000',
        'https://condo-budapest-projected-dna.trycloudflare.com',
      ],
      credentials: true,
    },
    hmr: {
      clientPort: 443,
      protocol: 'wss',
      host: 'condo-budapest-projected-dna.trycloudflare.com',
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@excalidraw/excalidraw/types": path.resolve(__dirname, "./node_modules/@excalidraw/excalidraw/dist/types/excalidraw/types.d.ts"),
      "@excalidraw/excalidraw/element/types": path.resolve(__dirname, "./node_modules/@excalidraw/excalidraw/dist/types/excalidraw/element/types.d.ts"),
    },
  },
  optimizeDeps: {
    include: ["@excalidraw/excalidraw"],
    force: true
  },
  build: {
    commonjsOptions: {
      include: [/excalidraw/, /node_modules/],
      transformMixedEsModules: true
    },
  },
  define: {
    global: 'globalThis',
  }
})
