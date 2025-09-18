import { geminiModel } from '@/lib/firebase'

async function fileToGenerativePart(file: File) {
  const base64EncodedData = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result
      if (typeof result === 'string') {
        const [, data] = result.split(',')
        resolve(data ?? '')
      } else {
        reject(new Error('Failed to read file data'))
      }
    }
    reader.onerror = () => reject(new Error('Failed to read file data'))
    reader.readAsDataURL(file)
  })

  return {
    inlineData: {
      data: base64EncodedData,
      mimeType: file.type || 'image/png',
    },
  }
}

export async function transcribeImageToMarkdown(file: File): Promise<string> {
  const fileSizeLimit = 8 * 1024 * 1024 // 8MB safety limit for local processing
  if (file.size > fileSizeLimit) {
    throw new Error('Image file is too large. Please use an image smaller than 8MB.')
  }

  const imagePart = await fileToGenerativePart(file)
  const prompt = `You are a meticulous assistant that digitizes handwritten or printed notes from a photo.

Please transcribe the provided image into clean, well-structured Markdown that is ready to paste into a knowledge base. Follow these rules:
- Preserve headings using Markdown syntax (##, ###, etc.) when the note clearly has sections.
- Use bullet lists (-) or numbered lists when appropriate.
- Bold important terms using **term** and italicize emphasis with *text*.
- Convert tables into Markdown table syntax if the structure is clear.
- Skip artifacts, smudges, or unreadable scribbles. If a portion is unclear, note it as "[illegible]".
- Do not include commentary about the transcription process. Output only the Markdown representation of the notes.
- Keep the output concise and faithful to the source.`

  const result = await geminiModel.generateContent({
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          imagePart,
        ],
      },
    ],
  })

  const text = result.response.text()
  if (!text || !text.trim()) {
    throw new Error('The AI did not return any text for the provided image.')
  }

  return text.trim()
}

