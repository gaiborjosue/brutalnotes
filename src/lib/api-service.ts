import { supabase } from './supabase'

interface ApiResult<T> {
  success: boolean
  data?: T
  error?: string
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1'

class ApiService {
  private static async getAuthHeaders(): Promise<Record<string, string>> {
    try {
      const { data, error } = await supabase.auth.getSession()
      if (error) {
        console.error('Auth error in ApiService:', error)
        return {}
      }

      const token = data.session?.access_token
      if (!token) {
        console.warn('No auth token available in ApiService')
        return {}
      }

      return {
        'Authorization': `Bearer ${token}`
      }
    } catch (error) {
      console.error('Failed to get auth headers:', error)
      return {}
    }
  }

  static async makeRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: unknown,
    timeout: number = 10000,
    options?: {
      authenticated?: boolean
      headers?: Record<string, string>
    }
  ): Promise<ApiResult<T>> {
    try {
      const isFormData = typeof FormData !== 'undefined' && body instanceof FormData
      const headers: Record<string, string> = {
        'Content-Type': isFormData ? '' : 'application/json',
        ...(options?.headers ?? {}),
      }

      // Add authentication headers if requested (defaults to true)
      const shouldAuthenticate = options?.authenticated !== false
      if (shouldAuthenticate) {
        const authHeaders = await this.getAuthHeaders()
        Object.assign(headers, authHeaders)
      }

      if (!headers['Content-Type']) {
        delete headers['Content-Type']
      }

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method,
        headers,
        body: body ? (isFormData ? body : JSON.stringify(body)) : undefined,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        return {
          success: false,
          error: `HTTP ${response.status}: ${errorText}`,
        }
      }

      const data = await response.json()
      return { success: true, data }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          error: 'Request timeout - please try again',
        }
      }

      return {
        success: false,
        error: `Network error: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  // --- Citations ---
  static async createCitationFromUrl(params: { url: string; style: 'apa' | 'mla'; include_raw?: boolean }): Promise<ApiResult<{ success: boolean; style: 'apa' | 'mla'; citation: string }>> {
    return this.makeRequest<{ success: boolean; style: 'apa' | 'mla'; citation: string }>(
      `/citations/from-url`,
      'POST',
      {
        url: params.url,
        style: params.style,
        include_raw: params.include_raw ?? false,
      },
      20000
    )
  }
}

export default ApiService
