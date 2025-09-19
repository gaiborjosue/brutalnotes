// Scan session API service for upload-based Scan Notes workflow

import ApiService from './api-service'

export interface ScanSessionCreateResult {
  sessionId: string
  hostKey: string
  guestKey: string
  guestJoinUrl: string
  createdAt: string
}

export interface SessionValidationResult {
  sessionId: string
  role: 'host' | 'guest'
  status: string
  updatedAt: string
}

export interface UploadAckResult {
  sessionId: string
  fileName: string
  mimeType: string
  size: number
  uploadedAt: string
}

export interface UploadFetchResult {
  sessionId: string
  fileName: string
  mimeType: string
  size: number
  base64Data: string
  uploadedAt: string
}

const BASE_PATH = '/scan-sessions'

export class ScanSessionService {
  static async createSession(): Promise<ScanSessionCreateResult> {
    const response = await ApiService.makeRequest<ScanSessionCreateResult>(`${BASE_PATH}`, 'POST')
    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to create scan session')
    }
    const payload = response.data as unknown as {
      session_id: string
      host_key: string
      guest_key: string
      guest_join_url: string
      created_at: string
    }
    return {
      sessionId: payload.session_id,
      hostKey: payload.host_key,
      guestKey: payload.guest_key,
      guestJoinUrl: payload.guest_join_url,
      createdAt: payload.created_at,
    }
  }

  static async validateSession(sessionId: string, key: string): Promise<SessionValidationResult> {
    const response = await ApiService.makeRequest<SessionValidationResult>(
      `${BASE_PATH}/${sessionId}/validate`,
      'POST',
      { key },
      10000,
      { authenticated: false }
    )
    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to validate session key')
    }
    const payload = response.data as unknown as {
      session_id: string
      role: 'host' | 'guest'
      status: string
      updated_at: string
    }
    return {
      sessionId: payload.session_id,
      role: payload.role,
      status: payload.status,
      updatedAt: payload.updated_at,
    }
  }

  static async uploadImage(sessionId: string, guestKey: string, file: File): Promise<UploadAckResult> {
    const formData = new FormData()
    formData.append('key', guestKey)
    formData.append('file', file)

    const response = await ApiService.makeRequest<UploadAckResult>(
      `${BASE_PATH}/${sessionId}/upload`,
      'POST',
      formData,
      120000,
      { authenticated: false, headers: {} }
    )

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to upload image')
    }

    const payload = response.data as unknown as {
      session_id: string
      file_name: string
      mime_type: string
      size: number
      uploaded_at: string
    }

    return {
      sessionId: payload.session_id,
      fileName: payload.file_name,
      mimeType: payload.mime_type,
      size: payload.size,
      uploadedAt: payload.uploaded_at,
    }
  }

  static async fetchUploadedImage(sessionId: string, hostKey: string): Promise<UploadFetchResult | null> {
    const response = await ApiService.makeRequest<UploadFetchResult>(
      `${BASE_PATH}/${sessionId}/upload?host_key=${encodeURIComponent(hostKey)}`,
      'GET',
      undefined,
      10000
    )

    if (!response.success || !response.data) {
      if (response.error?.includes('404')) {
        return null
      }
      throw new Error(response.error || 'Failed to fetch uploaded image')
    }

    const payload = response.data as unknown as {
      session_id: string
      file_name: string
      mime_type: string
      size: number
      base64_data: string
      uploaded_at: string
    }

    return {
      sessionId: payload.session_id,
      fileName: payload.file_name,
      mimeType: payload.mime_type,
      size: payload.size,
      base64Data: payload.base64_data,
      uploadedAt: payload.uploaded_at,
    }
  }

  static async completeSession(sessionId: string, key: string, isGuest: boolean): Promise<void> {
    const response = await ApiService.makeRequest(
      `${BASE_PATH}/${sessionId}/complete`,
      'POST',
      { key },
      10000,
      isGuest ? { authenticated: false } : undefined
    )
    if (!response.success) {
      throw new Error(response.error || 'Failed to close scan session')
    }
  }
}

export default ScanSessionService
