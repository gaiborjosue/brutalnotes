"use client"

import { useEffect } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"


export interface AIHighlightData {
  sentences: Array<{
    sentence: string
    score: number
  }>
}

interface AIHighlightPluginProps {
  highlightData: AIHighlightData | null
  onHighlightComplete?: () => void
}

export function AIHighlightPlugin({ highlightData, onHighlightComplete }: AIHighlightPluginProps) {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    if (!highlightData) {
      console.log('AIHighlightPlugin: Clearing existing highlights')
      // Clear existing highlights
      const existingHighlights = document.querySelectorAll('.ai-sentence-highlight')
      existingHighlights.forEach(el => {
        // Remove highlight by replacing with text content
        const textNode = document.createTextNode(el.textContent || '')
        el.parentNode?.replaceChild(textNode, el)
      })
      onHighlightComplete?.()
      return
    }

    // Check if highlights are already applied to prevent infinite loop
    const editorRoot = editor.getRootElement()
    if (!editorRoot) {
      console.log('No editor root element found')
      onHighlightComplete?.()
      return
    }

    const existingHighlights = editorRoot.querySelectorAll('.ai-sentence-highlight')
    if (existingHighlights.length > 0) {
      console.log('Highlights already applied, skipping')
      onHighlightComplete?.()
      return
    }

    console.log('AIHighlightPlugin: Applying highlights with data:', highlightData)
    
    // Create CSS for highlights if not exists
    let style = document.getElementById('ai-highlight-styles')
    if (!style) {
      style = document.createElement('style')
      style.id = 'ai-highlight-styles'
      style.textContent = `
        .ai-sentence-highlight {
          background: linear-gradient(120deg, rgba(239, 68, 68, 0.3) 0%, rgba(239, 68, 68, 0.3) 100%) !important;
          border-radius: 3px !important;
          padding: 1px 2px !important;
          border-left: 3px solid rgba(239, 68, 68, 0.6) !important;
          position: relative !important;
          margin: 1px 0 !important;
        }
        .ai-sentence-highlight::before {
          content: '🤖' !important;
          position: absolute !important;
          left: -18px !important;
          top: 50% !important;
          transform: translateY(-50%) !important;
          font-size: 11px !important;
          opacity: 0.8 !important;
        }
      `
      document.head.appendChild(style)
    }

    // Editor root is already available from above check

    // Simple approach: use CSS text-shadow and background on paragraphs that contain AI sentences
    console.log('Highlight data received:', highlightData)
    
    const { sentences } = highlightData
    
    // Safety check
    if (!sentences || !Array.isArray(sentences)) {
      console.log('No valid sentences data found:', sentences)
      onHighlightComplete?.()
      return
    }
    
    // Filter for high-confidence AI sentences (>60%)
    const highAISentences = sentences.filter(s => s.score > 0.6)
    
    console.log('AI sentences to highlight:', highAISentences.length)
    
    if (highAISentences.length === 0) {
      console.log('No high-confidence AI sentences to highlight')
      onHighlightComplete?.()
      return
    }
    
    // Use DOM Range API for precise text highlighting - similar to how Sapling does it
    const highlightSentenceWithRange = (sentence: string, score: number) => {
      const cleanSentence = sentence.trim()
      console.log('Highlighting sentence:', cleanSentence.substring(0, 50) + '...')
      
      // Get all text content and find the sentence
      const fullText = editorRoot.textContent || ''
      console.log('Editor full text (first 200 chars):', fullText.substring(0, 200))
      
      // Try exact match first
      let sentenceIndex = fullText.indexOf(cleanSentence)
      
      if (sentenceIndex === -1) {
        // Try with normalized whitespace
        const normalizedSentence = cleanSentence.replace(/\s+/g, ' ')
        const normalizedFullText = fullText.replace(/\s+/g, ' ')
        sentenceIndex = normalizedFullText.indexOf(normalizedSentence)
        
        if (sentenceIndex === -1) {
          // Try finding a substantial part of the sentence (first 20 characters)
          const sentencePart = cleanSentence.substring(0, 20)
          sentenceIndex = fullText.indexOf(sentencePart)
          
          if (sentenceIndex === -1) {
            // Try fuzzy matching - look for sentences with similar length and content
            console.log('Detailed sentence matching debug:')
            console.log('Expected sentence:', cleanSentence)
            console.log('Expected length:', cleanSentence.length)
            console.log('Editor text length:', fullText.length)
            
            // Split editor text into sentences and compare
            const editorSentences = fullText.split(/[.!?]+/).filter(s => s.trim().length > 10)
            console.log('Editor sentences found:', editorSentences.length)
            
            for (let i = 0; i < Math.min(3, editorSentences.length); i++) {
              const editorSentence = editorSentences[i].trim()
              console.log(`Editor sentence ${i + 1}:`, editorSentence.substring(0, 80) + '...')
              
              // Check if this could be our target sentence
              if (Math.abs(editorSentence.length - cleanSentence.length) < 50) {
                // Similar length - check for partial match
                const words = cleanSentence.split(' ')
                const firstFewWords = words.slice(0, Math.min(4, words.length)).join(' ')
                if (editorSentence.includes(firstFewWords)) {
                  console.log('Found potential match with editor sentence', i + 1)
                  // Use this sentence instead
                  const matchIndex = fullText.indexOf(editorSentence)
                  if (matchIndex !== -1) {
                    return highlightActualText(matchIndex, editorSentence, score)
                  }
                }
              }
            }
            
            console.log('Sentence not found in editor text. Expected:', cleanSentence.substring(0, 100))
            console.log('Available text starts with:', fullText.substring(0, 100))
            return false
          } else {
            console.log('Found partial sentence match at index:', sentenceIndex)
            // For partial match, try to extend to full sentence
            const remainingText = fullText.substring(sentenceIndex)
            const sentenceEnd = remainingText.search(/[.!?]+/)
            if (sentenceEnd !== -1) {
              // Use the actual sentence from the editor
              const actualSentence = remainingText.substring(0, sentenceEnd + 1).trim()
              console.log('Using actual sentence from editor:', actualSentence.substring(0, 50) + '...')
              return highlightActualText(sentenceIndex, actualSentence, score)
            }
          }
        } else {
          console.log('Found sentence with normalized whitespace at index:', sentenceIndex)
        }
      } else {
        console.log('Found exact sentence match at index:', sentenceIndex)
      }
      
      return highlightActualText(sentenceIndex, cleanSentence, score)
    }
    
    const highlightActualText = (startIndex: number, textToHighlight: string, score: number) => {
      
      // Walk through text nodes to find the one containing our sentence
      const walker = document.createTreeWalker(
        editorRoot,
        NodeFilter.SHOW_TEXT,
        null
      )
      
      let currentOffset = 0
      let targetNode: Text | null = null
      let nodeStartOffset = 0
      
      let node: Text
      while ((node = walker.nextNode() as Text)) {
        const nodeLength = node.textContent?.length || 0
        
        if (currentOffset <= startIndex && startIndex < currentOffset + nodeLength) {
          targetNode = node
          nodeStartOffset = startIndex - currentOffset
          break
        }
        
        currentOffset += nodeLength
      }
      
      if (!targetNode) {
        console.log('Could not find target text node')
        return false
      }
      
      // Check if already highlighted
      const parent = targetNode.parentElement
      if (parent?.classList.contains('ai-sentence-highlight')) {
        console.log('Already highlighted, skipping')
        return false
      }
      
      try {
        // Create range for the sentence
        const range = document.createRange()
        range.setStart(targetNode, nodeStartOffset)
        range.setEnd(targetNode, nodeStartOffset + textToHighlight.length)
        
        // Create highlight span
        const highlightSpan = document.createElement('span')
        highlightSpan.className = 'ai-sentence-highlight'
        highlightSpan.title = `AI Confidence: ${Math.round(score * 100)}% - This sentence appears to be AI-generated`
        
        // Surround the range contents with the highlight span
        try {
          range.surroundContents(highlightSpan)
          console.log('Successfully highlighted sentence with Range API')
          return true
        } catch {
          // Fallback: extract contents and wrap them
          const contents = range.extractContents()
          highlightSpan.appendChild(contents)
          range.insertNode(highlightSpan)
          console.log('Successfully highlighted sentence with fallback method')
          return true
        }
      } catch (error) {
        console.error('Error highlighting sentence:', error)
        return false
      }
    }
    
    // Apply highlights to each high-confidence AI sentence
    let highlightedCount = 0
    for (const sentenceData of highAISentences) {
      if (highlightSentenceWithRange(sentenceData.sentence, sentenceData.score)) {
        highlightedCount++
      }
    }
    
    console.log(`Successfully highlighted ${highlightedCount}/${highAISentences.length} AI sentences`)
    
    onHighlightComplete?.()
  }, [editor, highlightData, onHighlightComplete])

  return null
}