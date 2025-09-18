// Scan session API service for WebRTC-based Scan Notes workflow

import ApiService from './api-service'

export interface ScanSessionCreateResult {
  sessionId: string
  hostKey: string
  guestKey: string
  guestJoinUrl: string
  createdAt: string
}

export interface ScanSessionStatusResult {
  sessionId: string
  status: string
  hasOffer: boolean
  hasAnswer: boolean
  updatedAt: string
  lastFileName?: string | null
}

export interface SessionValidationResult {
  sessionId: string
  role: 'host' | 'guest'
  status: string
  hasOffer: boolean
  hasAnswer: boolean
  updatedAt: string
}

export interface OfferResponseResult {
  type: 'offer'
  sdp: string
  updatedAt: string
}

export interface AnswerResponseResult {
  type: 'answer'
  sdp: string
  updatedAt: string
}

export interface CandidatePayload {
  candidate: unknown
}

export interface CandidateBatchResult {
  candidates: unknown[]
  consumedCount: number
}

export interface FileReceivedResult {
  sessionId: string
  fileName: string
  receivedAt: string
}

const BASE_PATH = '/scan-sessions'

export class ScanSessionService {
  static async createSession(): Promise<ScanSessionCreateResult> {
    const response = await ApiService.makeRequest<ScanSessionCreateResult>(
      `${BASE_PATH}`,
      'POST'
    )
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
      has_offer: boolean
      has_answer: boolean
      updated_at: string
    }
    return {
      sessionId: payload.session_id,
      role: payload.role,
      status: payload.status,
      hasOffer: payload.has_offer,
      hasAnswer: payload.has_answer,
      updatedAt: payload.updated_at,
    }
  }

  static async submitOffer(sessionId: string, hostKey: string, description: RTCSessionDescriptionInit): Promise<void> {
    const response = await ApiService.makeRequest<ScanSessionStatusResult>(
      `${BASE_PATH}/${sessionId}/offer`,
      'POST',
      { host_key: hostKey, type: description.type, sdp: description.sdp },
      10000
    )
    if (!response.success) {
      throw new Error(response.error || 'Failed to submit SDP offer')
    }
  }

  static async fetchOffer(sessionId: string, guestKey: string): Promise<OfferResponseResult | null> {
    const response = await ApiService.makeRequest<OfferResponseResult>(
      `${BASE_PATH}/${sessionId}/offer?guest_key=${encodeURIComponent(guestKey)}`,
      'GET',
      undefined,
      10000,
      { authenticated: false }
    )
    if (!response.success) {
      if (response.error?.includes('404')) {
        return null
      }
      throw new Error(response.error || 'Failed to fetch SDP offer')
    }
    if (!response.data) {
      return null
    }
    const payload = response.data as unknown as {
      type: 'offer'
      sdp: string
      updated_at: string
    }
    return {
      type: payload.type,
      sdp: payload.sdp,
      updatedAt: payload.updated_at,
    }
  }

  static async submitAnswer(sessionId: string, guestKey: string, description: RTCSessionDescriptionInit): Promise<void> {
    const response = await ApiService.makeRequest<ScanSessionStatusResult>(
      `${BASE_PATH}/${sessionId}/answer`,
      'POST',
      { guest_key: guestKey, type: description.type, sdp: description.sdp },
      10000,
      { authenticated: false }
    )
    if (!response.success) {
      throw new Error(response.error || 'Failed to submit SDP answer')
    }
  }

  static async fetchAnswer(sessionId: string, hostKey: string): Promise<AnswerResponseResult | null> {
    const response = await ApiService.makeRequest<AnswerResponseResult>(
      `${BASE_PATH}/${sessionId}/answer?host_key=${encodeURIComponent(hostKey)}`,
      'GET',
      undefined,
      10000
    )
    if (!response.success) {
      if (response.error?.includes('404')) {
        return null
      }
    }
    if (!response.data) {
      return null
    }
    const payload = response.data as unknown as {
      type: 'answer'
      sdp: string
      updated_at: string
    }
    return {
      type: payload.type,
      sdp: payload.sdp,
      updatedAt: payload.updated_at,
    }
  }

  static async submitCandidate(sessionId: string, key: string, role: 'host' | 'guest', candidate: RTCIceCandidate): Promise<void> {
    const payload = {
      key,
      role,
      candidate: typeof candidate.toJSON === 'function' ? candidate.toJSON() : candidate,
    }
    const response = await ApiService.makeRequest<{ success: boolean }>(
      `${BASE_PATH}/${sessionId}/candidates`,
      'POST',
      payload,
      10000,
      role === 'host' ? undefined : { authenticated: false }
    )
    if (!response.success) {
      throw new Error(response.error || 'Failed to submit ICE candidate')
    }
  }

  static async consumeCandidates(sessionId: string, key: string, role: 'host' | 'guest'): Promise<CandidateBatchResult> {
    const response = await ApiService.makeRequest<CandidateBatchResult>(
      `${BASE_PATH}/${sessionId}/candidates/consume`,
      'POST',
      { key, role },
      10000,
      role === 'host' ? undefined : { authenticated: false }
    )
    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to consume ICE candidates')
    }
    const payload = response.data as unknown as {
      candidates: unknown[]
      consumed_count: number
    }
    return {
      candidates: payload.candidates,
      consumedCount: payload.consumed_count,
    }
  }

  static async notifyFileReceived(sessionId: string, key: string, fileName: string, role: 'host' | 'guest'): Promise<FileReceivedResult> {
    const response = await ApiService.makeRequest<FileReceivedResult>(
      `${BASE_PATH}/${sessionId}/file-received`,
      'POST',
      { key, file_name: fileName },
      10000,
      role === 'host' ? undefined : { authenticated: false }
    )
    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to notify file reception')
    }
    const payload = response.data as unknown as {
      session_id: string
      file_name: string
      received_at: string
    }
    return {
      sessionId: payload.session_id,
      fileName: payload.file_name,
      receivedAt: payload.received_at,
    }
  }

  static async completeSession(sessionId: string, key: string, role: 'host' | 'guest'): Promise<void> {
    const response = await ApiService.makeRequest(
      `${BASE_PATH}/${sessionId}/complete`,
      'POST',
      { key },
      10000,
      role === 'host' ? undefined : { authenticated: false }
    )
    if (!response.success) {
      throw new Error(response.error || 'Failed to close scan session')
    }
  }

  static async getSessionStatus(sessionId: string, hostKey: string): Promise<ScanSessionStatusResult> {
    const response = await ApiService.makeRequest<ScanSessionStatusResult>(
      `${BASE_PATH}/${sessionId}/status?host_key=${encodeURIComponent(hostKey)}`,
      'GET',
      undefined,
      10000
    )
    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to fetch session status')
    }
    const payload = response.data as unknown as {
      session_id: string
      status: string
      has_offer: boolean
      has_answer: boolean
      updated_at: string
      last_file_name?: string | null
    }
    return {
      sessionId: payload.session_id,
      status: payload.status,
      hasOffer: payload.has_offer,
      hasAnswer: payload.has_answer,
      updatedAt: payload.updated_at,
      lastFileName: payload.last_file_name ?? null,
    }
  }
}

export default ScanSessionService
