# 📝 Brutal Notes - Frontend

An **offline-first note-taking app** with built-in AI assistance that works even without internet connection. Built for productivity, privacy, and speed.

<img width="1584" height="396" alt="20" src="https://github.com/user-attachments/assets/38888498-adfe-499f-8d9e-f580978a109a" />


🚀 **Live Demo**: [https://brutalnote.com](https://brutalnote.com)

## ✨ Key Features

### 🔌 Offline-First Architecture

- **Full offline functionality** - Create, edit, and organize notes & todos without internet
- **IndexedDB storage** - Fast local data persistence
- **Smart sync** - Automatic background synchronization when online
- **Conflict resolution** - Handles offline changes seamlessly

### 🤖 Chrome AI built-in powered assistance & utilities

- **AI content detection** - Analyze content and get a percentage of AI-detected text.
- **Markdown proofreading** - Grammar and style suggestions
- **Smart citations** - Automatic citation detection and formatting from a URL.
- **Content summarization**- AI-powered summarization assistance for a note.

### 📝 Rich Text Editing

- **Lexical editor** - Modern, extensible rich text editing
- **Markdown support** - Write in markdown with live preview
- **Code blocks** - Syntax highlighting for multiple languages
- **LaTeX math** - Render mathematical equations with KaTeX
- **Tables & lists** - Full support for complex formatting
- **Excalidraw integration** - Embedded diagrams and sketches

### 🎯 Productivity Tools

- **Todo management** - Built-in task tracking
- **Voice recording** - Audio notes with transcription
- **File organization** - Hierarchical note management
- **Mobile scan mode** - OCR for handwritten notes via mobile

### 📱 Additional Features

- **URL encoded note sharing** - Quick note sharing
- **Lexical export** - Export your notes
- **Guided tour** - Interactive onboarding

## 🛠️ Tech Stack

<img width="1584" height="396" alt="19" src="https://github.com/user-attachments/assets/decaaad6-731a-44c2-815e-6491268af088" />


- **Frontend**: React 19 + TypeScript + Vite
- **Editor**: Lexical
- **Styling**: Tailwind CSS + Radix UI
- **Storage**: IndexedDB (Dexie) + Supabase
- **Auth**: Supabase Authentication
- **AI/ML**: Google in-built AI api & Firebase AI logic

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/gaiborjosue/brutalnotes.git
cd brutalnotes

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Start development server
npm run dev
```

### Environment Variables

Create a `.env` file with:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_key
VITE_FIREBASE_API_KEY=your_firebase_key
# ... other Firebase configs
```

## 📦 Build

```bash
# Production build
npm run build

# Preview production build
npm run preview
```

## 🌐 Deployment

Deployed using **Dokploy** on a custom VPS. The app is containerized with Docker for easy deployment and scaling.

**Production URL**: [https://brutalnote.com](https://brutalnote.com)

## 🤝 Contributing

This project was built for Chrome AI built-in API hackathon. Contributions are welcome!
