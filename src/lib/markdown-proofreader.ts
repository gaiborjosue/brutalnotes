import { marked } from 'marked'

export interface ProofreaderAPI {
  proofread(text: string): Promise<{
    correctedInput: string
    corrections: Array<{
      startIndex: number
      endIndex: number
      suggestion: string // Chrome API uses 'suggestion', not 'correction'
      type: string
      explanation?: string
    }>
  }>
}

export interface TextBlock {
  type: 'heading' | 'paragraph' | 'list_item' | 'blockquote' | 'code'
  text: string
  originalIndex: number
  startPos: number
  endPos: number
  level?: number // for headings
  listType?: 'ordered' | 'unordered' // for list items
  metadata?: Record<string, unknown> // for preserving additional context
}

export interface CorrectedBlock extends TextBlock {
  correctedText: string
  corrections: Array<{
    startIndex: number
    endIndex: number
    suggestion: string
    type: string
    explanation?: string
  }>
  hasCorrections: boolean
}

export interface ProofreadingResult {
  originalMarkdown: string
  correctedMarkdown: string
  blocks: CorrectedBlock[]
  hasAnyCorrections: boolean
}

/**
 * Extracts text blocks from markdown content for proofreading
 */
export function extractTextBlocks(markdownText: string): TextBlock[] {
  const tokens = marked.lexer(markdownText)
  const textBlocks: TextBlock[] = []
  
  let currentPos = 0
  
  tokens.forEach((token, index) => {
    // Find the position of this token in the original text
    const tokenStart = markdownText.indexOf(token.raw, currentPos)
    const tokenEnd = tokenStart + token.raw.length
    
    switch (token.type) {
      case 'heading':
        textBlocks.push({
          type: 'heading',
          text: token.text,
          originalIndex: index,
          startPos: tokenStart,
          endPos: tokenEnd,
          level: token.depth,
          metadata: { raw: token.raw }
        })
        break
        
      case 'paragraph':
        textBlocks.push({
          type: 'paragraph',
          text: token.text,
          originalIndex: index,
          startPos: tokenStart,
          endPos: tokenEnd,
          metadata: { raw: token.raw }
        })
        break
        
      case 'list_item':
        textBlocks.push({
          type: 'list_item',
          text: token.text,
          originalIndex: index,
          startPos: tokenStart,
          endPos: tokenEnd,
          metadata: { raw: token.raw, task: token.task }
        })
        break
        
      case 'blockquote':
        // Extract text from blockquote tokens
        if (token.tokens) {
          const blockquoteText = extractTextFromTokens(token.tokens)
          if (blockquoteText.trim()) {
            textBlocks.push({
              type: 'blockquote',
              text: blockquoteText,
              originalIndex: index,
              startPos: tokenStart,
              endPos: tokenEnd,
              metadata: { raw: token.raw }
            })
          }
        }
        break
    }
    
    currentPos = tokenEnd
  })
  
  return textBlocks
}

/**
 * Helper function to extract text from nested tokens
 */
function extractTextFromTokens(tokens: unknown[]): string {
  return tokens
    .map(token => {
      if (typeof token === 'object' && token !== null) {
        const t = token as Record<string, unknown>
        if (t.type === 'text') return t.text as string
        if (t.type === 'paragraph') return t.text as string
        if (t.tokens) return extractTextFromTokens(t.tokens as unknown[])
      }
      return ''
    })
    .join(' ')
    .trim()
}

/**
 * Cleans up unwanted artifacts from the Chrome Proofreader API
 */
function cleanProofreadResult(text: string): string {
  if (!text) return text
  
  let cleaned = text
  
  // Split into lines to process line by line
  const lines = cleaned.split('\n')
  const filteredLines = lines.filter(line => {
    const trimmedLine = line.trim()
    
    // Skip lines that are clearly artifacts
    if (trimmedLine.match(/^PROOFREAD_TEXT\s*\d*:/i)) return false
    if (trimmedLine.match(/^\*{4,}/)) return false // Lines starting with 4+ asterisks
    if (trimmedLine.match(/^\*\*PROOFREAD_TEXT/i)) return false
    if (trimmedLine.match(/^\[CORRECTED\]/i)) return false
    if (trimmedLine.match(/^\[ORIGINAL\]/i)) return false
    if (trimmedLine.match(/^\[SUGGESTION\]/i)) return false
    
    return true
  })
  
  cleaned = filteredLines.join('\n')
  
  // Additional cleanup for any remaining artifacts
  cleaned = cleaned
    .replace(/PROOFREAD_TEXT\s*\d*:\s*/gi, '')
    .replace(/\*\*PROOFREAD_TEXT\s*\d*:\*\*\s*/gi, '')
    .replace(/\*\*PROOFREAD_TEXT:\*\*\s*/gi, '')
    .replace(/PROOFREAD_TEXT\s*/gi, '')
    
  // Remove extra whitespace and normalize line breaks
  cleaned = cleaned
    .replace(/\n\s*\n\s*\n+/g, '\n\n') // Multiple line breaks to double
    .replace(/^\s+|\s+$/g, '') // Trim start and end
  
  return cleaned
}

/**
 * Proofreads individual text blocks
 */
export async function proofreadTextBlocks(
  textBlocks: TextBlock[],
  proofreader: ProofreaderAPI
): Promise<CorrectedBlock[]> {
  const results: CorrectedBlock[] = []
  
  for (const block of textBlocks) {
    try {
      // Skip empty or very short text blocks
      if (!block.text.trim() || block.text.trim().length < 5) {
        results.push({
          ...block,
          correctedText: block.text,
          corrections: [],
          hasCorrections: false
        })
        continue
      }
      
      const { correctedInput, corrections } = await proofreader.proofread(block.text)
      
      // Clean up any unwanted artifacts from the API response
      const cleanedCorrectedText = cleanProofreadResult(correctedInput || block.text)
      
      // Log cleanup if artifacts were detected
      if (correctedInput && correctedInput !== cleanedCorrectedText) {
        console.log(`🧹 Cleaned up API artifacts in block ${block.originalIndex}`)
        console.log(`   Raw API response: "${correctedInput}"`)
        console.log(`   After cleanup: "${cleanedCorrectedText}"`)
        console.log(`   Original text: "${block.text}"`)
      }
      
      // Check if text was actually changed, even if corrections array is empty
      const textWasChanged = cleanedCorrectedText && cleanedCorrectedText !== block.text
      const hasCorrections = Boolean((corrections && corrections.length > 0) || textWasChanged)
      
      results.push({
        ...block,
        correctedText: cleanedCorrectedText,
        corrections: corrections || [],
        hasCorrections
      })
    } catch (error) {
      console.warn(`❌ Failed to proofread block ${block.originalIndex}:`, error)
      // Fallback to original text if proofreading fails
      results.push({
        ...block,
        correctedText: block.text,
        corrections: [],
        hasCorrections: false
      })
    }
  }
  
  return results
}

/**
 * Reconstructs markdown from corrected blocks
 */
export function reconstructMarkdown(
  originalMarkdown: string,
  correctedBlocks: CorrectedBlock[]
): string {
  if (correctedBlocks.length === 0) {
    return originalMarkdown
  }
  
  let result = originalMarkdown
  
  // Sort blocks by position (highest first to avoid position shifts)
  const sortedBlocks = [...correctedBlocks].sort((a, b) => b.startPos - a.startPos)
  
  for (const block of sortedBlocks) {
    if (block.hasCorrections) {
      // Reconstruct the block with corrected text
      const newBlockContent = reconstructBlock(block)
      
      // Replace the original block with the corrected one
      result = result.slice(0, block.startPos) + 
               newBlockContent + 
               result.slice(block.endPos)
    }
  }
  
  return result
}

/**
 * Reconstructs a single block with corrected text
 */
function reconstructBlock(block: CorrectedBlock): string {
  switch (block.type) {
    case 'heading': {
      const headingPrefix = '#'.repeat(block.level || 1)
      return `${headingPrefix} ${block.correctedText}\n\n`
    }
      
    case 'paragraph':
      return `${block.correctedText}\n\n`
      
    case 'list_item': {
      // Preserve list markers
      const originalRaw = String(block.metadata?.raw || '')
      if (originalRaw.includes('- [ ]') || originalRaw.includes('- [x]')) {
        // Task list item
        const isChecked = originalRaw.includes('- [x]')
        const marker = isChecked ? '- [x]' : '- [ ]'
        return `${marker} ${block.correctedText}\n`
      } else if (originalRaw.match(/^\s*\d+\./)) {
        // Ordered list
        const match = originalRaw.match(/^(\s*\d+\.\s)/)
        const prefix = match ? match[1] : '1. '
        return `${prefix}${block.correctedText}\n`
      } else {
        // Unordered list
        return `- ${block.correctedText}\n`
      }
    }
      
    case 'blockquote':
      return `> ${block.correctedText}\n\n`
      
    default:
      return block.correctedText
  }
}

/**
 * Main function to proofread markdown content while preserving formatting
 */
export async function proofreadMarkdown(
  markdownText: string,
  proofreader: ProofreaderAPI
): Promise<ProofreadingResult> {
  try {
    // Extract text blocks
    const textBlocks = extractTextBlocks(markdownText)
    
    // Proofread each block
    const correctedBlocks = await proofreadTextBlocks(textBlocks, proofreader)
    
    // Check if any corrections were made
    const hasAnyCorrections = correctedBlocks.some(block => block.hasCorrections)
    
    // If no corrections found in individual blocks, try proofreading the entire text
    if (!hasAnyCorrections && markdownText.trim().length > 10) {
      try {
        // Extract just the text content (no markdown syntax) for proofreading
        const plainText = textBlocks.map(block => block.text).join(' ').trim()
        
        if (plainText.length > 10) {
          const fullResult = await proofreader.proofread(plainText)
          
          // Clean up any unwanted artifacts from the API response
          const cleanedFullResult = cleanProofreadResult(fullResult.correctedInput || plainText)
          
          // Log cleanup if artifacts were detected
          if (fullResult.correctedInput && fullResult.correctedInput !== cleanedFullResult) {
            console.log(`🧹 Cleaned up API artifacts in full text`)
            console.log(`   Before: "${fullResult.correctedInput.substring(0, 100)}..."`)
            console.log(`   After: "${cleanedFullResult.substring(0, 100)}..."`)
          }
          
          // Check if the full text was actually changed
          const fullTextChanged = cleanedFullResult && cleanedFullResult !== plainText
          const hasFullCorrections = (fullResult.corrections && fullResult.corrections.length > 0) || fullTextChanged
          
          if (hasFullCorrections) {
            // If we found corrections in the full text, return a simplified result
            return {
              originalMarkdown: markdownText,
              correctedMarkdown: cleanedFullResult,
              blocks: [],
              hasAnyCorrections: true
            }
          }
        }
      } catch (error) {
        console.warn(`❌ Full text proofreading failed:`, error)
      }
    }
    
    // Reconstruct markdown if we have block-level corrections
    let correctedMarkdown = markdownText
    if (hasAnyCorrections) {
      correctedMarkdown = reconstructMarkdown(markdownText, correctedBlocks)
    }
    
    return {
      originalMarkdown: markdownText,
      correctedMarkdown,
      blocks: correctedBlocks,
      hasAnyCorrections
    }
  } catch (error) {
    console.error('❌ Error during markdown proofreading:', error)
    
    // Fallback: return original content
    return {
      originalMarkdown: markdownText,
      correctedMarkdown: markdownText,
      blocks: [],
      hasAnyCorrections: false
    }
  }
}

/**
 * Helper function to get markdown from Lexical editor
 */
export function extractMarkdownFromLexical(editor: unknown): Promise<string> {
  return new Promise((resolve) => {
    const editorInstance = editor as { getEditorState: () => { exportJSON: () => unknown, read: (fn: () => void) => void } }
    editorInstance.getEditorState().read(() => {
      const markdown = editorInstance.getEditorState().exportJSON()
      // This is a simplified approach - in a real implementation,
      // you'd want to use a proper Lexical-to-Markdown converter
      resolve(JSON.stringify(markdown))
    })
  })
}

/**
 * Converts plain text to simple markdown structure
 */
export function textToSimpleMarkdown(text: string): string {
  // Split into paragraphs and create basic markdown
  return text
    .split('\n\n')
    .filter(paragraph => paragraph.trim())
    .map(paragraph => paragraph.trim())
    .join('\n\n')
}
