/**
 * Deepgram WebSocket Client
 * Connects to wss://api.deepgram.com/v1/listen
 *
 * Features:
 * - Real-time streaming STT via WebSocket
 * - Auto-reconnect with exponential backoff + jitter
 * - Seamless session reset every SESSION_DURATION_MS
 * - KeepAlive heartbeat to prevent idle timeout
 * - Utterance accumulation (is_final + speech_final) for coherent translation
 * - Speaker diarization with dominant-speaker detection
 * - Translation via shared TranslationQueue
 */

import { TranslationQueue, type TranslationConfig } from './translation-queue';
import { ReconnectManager } from './reconnect-manager';

const DEEPGRAM_ENDPOINT = 'wss://api.deepgram.com/v1/listen';

const MAX_RECONNECT = 5;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 16000;
const KEEPALIVE_INTERVAL_MS = 8000;
const SESSION_DURATION_MS = 5 * 60 * 1000;
const TRANSLATION_DEBOUNCE_MS = 1500;

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface DeepgramConfig extends TranslationConfig {
   apiKey: string;
   sourceLanguage: string;
   targetLanguage: string;
   translationEngine?: string;
   customContext?: { domain?: string | null; translation_terms?: { source: string; target: string }[] } | null;
   llmApiKey?: string;
   llmBaseUrl?: string;
   llmModel?: string;
}

interface DeepgramWord {
   speaker?: number;
   word?: string;
}

interface DeepgramAlternative {
   transcript?: string;
   words?: DeepgramWord[];
}

interface DeepgramResponse {
   type?: string;
   channel?: { alternatives?: DeepgramAlternative[] };
   is_final?: boolean;
   speech_final?: boolean;
   error?: string;
   description?: string;
   message?: string;
}

interface ExtendedWebSocket extends WebSocket {
   _isOld?: boolean;
}

export class DeepgramClient {
   private ws: ExtendedWebSocket | null = null;
   private apiKey = '';
   isConnected = false;
   private _config: DeepgramConfig | null = null;
   private _intentionalDisconnect = false;
   private _sessionTimer: ReturnType<typeof setTimeout> | null = null;
   private _keepAliveTimer: ReturnType<typeof setInterval> | null = null;

   private _utteranceBuffer: string[] = [];
   private _utteranceSpeakers: string[] = [];
   private _utteranceDebounceTimer: ReturnType<typeof setTimeout> | null = null;

   private _translationQueue = new TranslationQueue();
   private _reconnectManager = new ReconnectManager({
      maxAttempts: MAX_RECONNECT,
      baseDelayMs: RECONNECT_BASE_MS,
      maxDelayMs: RECONNECT_MAX_MS,
   });

   onOriginal: ((text: string, speaker: string | null) => void) | null = null;
   onTranslation: ((text: string) => void) | null = null;
   onProvisional: ((text: string, speaker: string | null) => void) | null = null;
   onStatusChange: ((status: ConnectionStatus) => void) | null = null;
   onError: ((error: string) => void) | null = null;

   constructor() {
      this._translationQueue.onTranslation = (text) => this.onTranslation?.(text);
      this._translationQueue.onError = (error) => this.onError?.(error);
      this._reconnectManager.onReconnect = () => {
         if (!this._intentionalDisconnect && this._config) {
            this._doConnect(this._config);
         }
      };
      this._reconnectManager.onMaxRetriesReached = (reason) => {
         this._setStatus('error');
         this.onError?.(reason);
      };
      this._reconnectManager.onAttempt = (attempt, max, reason) => {
         console.log(`[Deepgram] Reconnecting (${attempt}/${max})...`);
         this._setStatus('connecting');
         this.onError?.(`${reason}. Reconnecting (${attempt}/${max})...`);
      };
   }

   connect(config: DeepgramConfig): void {
      const { apiKey } = config;
      this.apiKey = apiKey;
      this._config = config;
      this._intentionalDisconnect = false;
      this._reconnectManager.reset();

      if (!apiKey) {
         this._setStatus('error');
         this.onError?.('API key is required. Please add it in Settings.');
         return;
      }

      this._doConnect(config);
   }

   // Map generic language codes to Deepgram-specific codes
   private static readonly _deepgramLangMap: Record<string, string> = {
      zh: 'zh-CN',
   };

   private _doConnect(config: DeepgramConfig): void {
      const { apiKey, sourceLanguage } = config;

      this._setStatus('connecting');
      console.log('[Deepgram] Connecting...');

      const params = new URLSearchParams({
         model: 'nova-3',
         encoding: 'linear16',
         sample_rate: '16000',
         channels: '1',
         smart_format: 'true',
         interim_results: 'true',
         endpointing: '300',
         diarize: 'true',
         punctuate: 'true',
      });

      if (sourceLanguage && sourceLanguage !== 'auto') {
         const dgLang = DeepgramClient._deepgramLangMap[sourceLanguage] || sourceLanguage;
         params.set('language', dgLang);
      } else {
         params.set('detect_language', 'true');
      }

      const url = `${DEEPGRAM_ENDPOINT}?${params.toString()}`;

      let newWs: ExtendedWebSocket;
      try {
         newWs = new WebSocket(url, ['token', apiKey]) as ExtendedWebSocket;
         console.log('[Deepgram] WebSocket created');
      } catch (err) {
         console.error('[Deepgram] Failed to create WebSocket:', err);
         this._setStatus('error');
         this.onError?.(`Failed to connect: ${(err as Error).message}`);
         return;
      }

      newWs.onopen = () => {
         console.log('[Deepgram] WebSocket OPEN');

         const oldWs = this.ws;
         if (oldWs && oldWs !== newWs) {
            console.log('[Deepgram] Seamless switch: closing old WebSocket');
            try {
               oldWs._isOld = true;
               this._stopKeepAlive();
               if (oldWs.readyState === WebSocket.OPEN) {
                  oldWs.send(JSON.stringify({ type: 'CloseStream' }));
               }
               oldWs.close(1000, 'Session reset');
            } catch {
               /* ignore */
            }
         }

         this.ws = newWs;
         this.isConnected = true;
         this._reconnectManager.reset();
         this._setStatus('connected');
         console.log('[Deepgram] Connected');

         this._startKeepAlive();
         this._startSessionTimer();
      };

      newWs.onmessage = (event: MessageEvent) => {
         if (newWs._isOld) return;

         try {
            const data = JSON.parse(event.data as string) as DeepgramResponse;
            this._handleResponse(data);
         } catch (err) {
            console.error('[Deepgram] Failed to parse response:', err);
         }
      };

      newWs.onerror = (event: Event) => {
         if (newWs._isOld) return;
         console.error('[Deepgram] WebSocket ERROR:', event);
         this.onError?.('WebSocket error occurred');
      };

      newWs.onclose = (event: CloseEvent) => {
         if (newWs._isOld) {
            console.log('[Deepgram] Old WebSocket closed (expected)');
            return;
         }

         console.log('[Deepgram] WebSocket CLOSED, code:', event.code, 'reason:', event.reason);
         this.isConnected = false;

         if (this.ws === newWs) {
            this.ws = null;
         }

         if (this._intentionalDisconnect) {
            this._setStatus('disconnected');
            return;
         }

         if (event.code === 1000) {
            this._setStatus('disconnected');
         } else if (event.code === 1008 || event.code === 4001) {
            this._setStatus('error');
            this.onError?.('Invalid API key. Please check your key in Settings.');
         } else if (event.code === 4029) {
            this._setStatus('error');
            this.onError?.('Rate limit exceeded. Please wait and try again.');
         } else {
            this._tryReconnect(`Connection closed (code: ${event.code})`);
         }
      };
   }

   sendAudio(pcmData: ArrayBuffer): void {
      if (this.ws?.readyState === WebSocket.OPEN) {
         this.ws.send(pcmData);
      }
   }

   disconnect(): void {
      this._intentionalDisconnect = true;
      this._stopSessionTimer();
      this._stopKeepAlive();
      this._flushUtteranceBuffer();
      this._translationQueue.clear();

      if (this.ws) {
         try {
            if (this.ws.readyState === WebSocket.OPEN) {
               this.ws.send(JSON.stringify({ type: 'CloseStream' }));
            }
            this.ws.close(1000, 'User disconnected');
         } catch (err) {
            console.error('[Deepgram] Error during disconnect:', err);
         }
         this.ws = null;
      }
      this.isConnected = false;
      this._setStatus('disconnected');
   }

   private _handleResponse(data: DeepgramResponse): void {
      if (data.type === 'Metadata') {
         console.log('[Deepgram] Metadata:', data);
         return;
      }

      if (data.type === 'Error' || data.error) {
         console.error('[Deepgram] API Error:', data);
         this.onError?.(data.description || data.message || 'API error');
         return;
      }

      if (data.type === 'UtteranceEnd') {
         this.onProvisional?.('', null);
         if (this._utteranceBuffer.length > 0) {
            this._flushUtteranceBuffer();
         }
         return;
      }

      if (data.type === 'SpeechStarted') return;
      if (data.type !== 'Results') return;

      const alt = data.channel?.alternatives?.[0];
      if (!alt) return;

      const transcript = alt.transcript?.trim();
      if (!transcript) return;

      const speaker = this._detectDominantSpeaker(alt.words || []);

      if (data.is_final) {
         this._utteranceBuffer.push(transcript);
         if (speaker !== null) this._utteranceSpeakers.push(speaker);

         this.onOriginal?.(transcript, speaker);
         this.onProvisional?.('', null);

         if (data.speech_final) {
            this._flushUtteranceBuffer();
         } else {
            this._startUtteranceDebounce();
         }
      } else {
         this.onProvisional?.(transcript, speaker);
      }
   }

   private _detectDominantSpeaker(words: DeepgramWord[]): string | null {
      if (words.length === 0) return null;
      const counts: Record<string, number> = {};
      for (const w of words) {
         if (w.speaker !== undefined) {
            const s = String(w.speaker);
            counts[s] = (counts[s] || 0) + 1;
         }
      }
      const entries = Object.entries(counts);
      if (entries.length === 0) return null;
      entries.sort((a, b) => b[1] - a[1]);
      return entries[0][0];
   }

   private _startUtteranceDebounce(): void {
      if (this._utteranceDebounceTimer) clearTimeout(this._utteranceDebounceTimer);
      this._utteranceDebounceTimer = setTimeout(() => {
         if (this._utteranceBuffer.length > 0) {
            this._flushUtteranceBuffer();
         }
      }, TRANSLATION_DEBOUNCE_MS);
   }

   private _flushUtteranceBuffer(): void {
      if (this._utteranceDebounceTimer) clearTimeout(this._utteranceDebounceTimer);

      if (this._utteranceBuffer.length === 0) return;

      const fullText = this._utteranceBuffer.join(' ');
      this._utteranceBuffer.length = 0;
      this._utteranceSpeakers.length = 0;

      if (this._config?.targetLanguage) {
         this._queueTranslation(fullText);
      }
   }

   private _queueTranslation(text: string): void {
      if (this._config) {
         this._translationQueue.enqueue(text, this._config);
      }
   }

   private _startKeepAlive(): void {
      this._stopKeepAlive();
      this._keepAliveTimer = setInterval(() => {
         if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'KeepAlive' }));
         }
      }, KEEPALIVE_INTERVAL_MS);
   }

   private _stopKeepAlive(): void {
      if (this._keepAliveTimer) {
         clearInterval(this._keepAliveTimer);
         this._keepAliveTimer = null;
      }
   }

   private _startSessionTimer(): void {
      this._stopSessionTimer();
      this._sessionTimer = setTimeout(() => {
         this._seamlessReset();
      }, SESSION_DURATION_MS);
   }

   private _stopSessionTimer(): void {
      if (this._sessionTimer) {
         clearTimeout(this._sessionTimer);
         this._sessionTimer = null;
      }
   }

   private _seamlessReset(): void {
      if (!this._config || this._intentionalDisconnect) return;
      console.log('[Deepgram] Seamless session reset');
      this._flushUtteranceBuffer();
      this._translationQueue.resetHistory();
      this._doConnect(this._config);
   }

   private _tryReconnect(reason: string): void {
      this._reconnectManager.tryReconnect(reason);
   }

   private _setStatus(status: ConnectionStatus): void {
      this.onStatusChange?.(status);
   }
}

export const deepgramClient = new DeepgramClient();
