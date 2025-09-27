/**
 * AI Detection Service
 * Service for detecting AI-generated text using the backend API
 */

import ApiService from './api-service'

export interface AIDetectionRequest {
  text: string
  score_string?: boolean
  sentence_scores?: boolean
}

export interface SentenceScore {
  score: number
  sentence: string
}

export interface AIDetectionResponse {
  score: number
  text: string
  sentence_scores?: SentenceScore[]
  tokens?: string[]
  token_probs?: number[]
  score_string?: string
}

export interface AIDetectionResult {
  success: boolean
  data?: AIDetectionResponse
  error?: string
}

class AIDetectionService {
  /**
   * Detect AI-generated text using the backend endpoint
   */
  static async detectAI(request: AIDetectionRequest): Promise<AIDetectionResult> {
    try {
      const result = await ApiService.makeRequest<AIDetectionResponse>(
        '/ai-detection/detect',
        'POST',
        request,
        30000 // 30 second timeout for AI detection
      )

      return result
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }
    }
  }
}

export default AIDetectionService
