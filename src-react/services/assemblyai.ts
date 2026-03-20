/**
 * AssemblyAI Universal Streaming v3 WebSocket Client
 * Connects to wss://streaming.assemblyai.com/v3/ws
 *
 * Features:
 * - Real-time streaming STT via WebSocket (v3 Universal Streaming)
 * - Auto-reconnect with exponential backoff
 * - Session reset every 5 minutes
 * - Turn-based transcript accumulation for coherent translation
 * - Translation via shared TranslationQueue
 *
 * Audio: PCM s16le 16kHz mono → sent as raw binary
 */

import { TranslationQueue, type TranslationConfig } from './translation-queue';
import { ReconnectManager } from './reconnect-manager';

const { invoke } = window.__TAURI__.core;

const ASSEMBLYAI_RT_ENDPOINT = 'wss://streaming.assemblyai.com/v3/ws';

const MAX_RECONNECT = 5;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 16000;
const SESSION_DURATION_MS = 5 * 60 * 1000;
const TRANSLATION_DEBOUNCE_MS = 1500;

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface AssemblyAIConfig extends TranslationConfig {
   apiKey: string;
   sourceLanguage: string;
   targetLanguage: string;
   translationEngine?: string;
   customContext?: { domain?: string | null; translation_terms?: { source: string; target: string }[] } | null;
   llmApiKey?: string;
   llmBaseUrl?: string;
   llmModel?: string;
}

interface AssemblyAIMessage {
   type: string;
   // Begin
   id?: string;
   expires_at?: number;
   // Turn
   transcript?: string;
   turn_is_formatted?: boolean;
   // Termination
   audio_duration_seconds?: number;
   session_duration_seconds?: number;
   // Error
   error?: string;
}

export class AssemblyAIClient {
   private ws: WebSocket | null = null;
   isConnected = false;
   private _config: AssemblyAIConfig | null = null;
   private _intentionalDisconnect = false;
   private _sessionTimer: ReturnType<typeof setTimeout> | null = null;

   private _utteranceBuffer: string[] = [];
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
         console.log(`[AssemblyAI] Reconnecting (${attempt}/${max})...`);
         this._setStatus('connecting');
         this.onError?.(`${reason}. Reconnecting (${attempt}/${max})...`);
      };
   }

   connect(config: AssemblyAIConfig): void {
      this._config = config;
      this._intentionalDisconnect = false;
      this._reconnectManager.reset();

      if (!config.apiKey) {
         this._setStatus('error');
         this.onError?.('AssemblyAI API key is required. Please add it in Settings.');
         return;
      }

      this._doConnect(config);
   }

   private async _doConnect(config: AssemblyAIConfig): Promise<void> {
      this._setStatus('connecting');
      console.log('[AssemblyAI] Connecting...');

      // Step 1: Obtain a temporary auth token via Tauri backend (avoids CORS)
      let tempToken: string;
      try {
         tempToken = await invoke<string>('get_assemblyai_token', { apiKey: config.apiKey });
         console.log('[AssemblyAI] Temporary token obtained');
      } catch (err) {
         const errMsg = err instanceof Error ? err.message : String(err);
         console.error('[AssemblyAI] Failed to get temp token:', errMsg);
         this._setStatus('error');
         if (errMsg.includes('Invalid AssemblyAI API key')) {
            this.onError?.('Invalid AssemblyAI API key. Please check your key in Settings.');
         } else {
            this.onError?.(`Failed to authenticate: ${errMsg}`);
         }
         return;
      }

      // Step 2: Connect WebSocket with the temporary token (v3 Universal Streaming)
      // universal-streaming-multilingual supports: en, es, de, fr, pt, it
      // For all other languages (zh, ja, ko, etc.), use whisper-rt (99+ languages)
      const MULTILINGUAL_LANGS = new Set(['en', 'es', 'de', 'fr', 'pt', 'it']);
      const lang = config.sourceLanguage?.split('-')[0] || ''; // e.g. "zh-CN" → "zh"
      const useWhisper = lang && lang !== 'auto' && !MULTILINGUAL_LANGS.has(lang);

      const params = new URLSearchParams({
         sample_rate: '16000',
         token: tempToken,
         speech_model: useWhisper ? 'whisper-rt' : 'universal-streaming-multilingual',
         format_turns: 'true',
      });

      // Enable language detection for the multilingual model when no specific lang
      if (!useWhisper && (!config.sourceLanguage || config.sourceLanguage === 'auto')) {
         params.set('language_detection', 'true');
      }

      const url = `${ASSEMBLYAI_RT_ENDPOINT}?${params.toString()}`;

      let newWs: WebSocket;
      try {
         newWs = new WebSocket(url);
         newWs.binaryType = 'arraybuffer';
         console.log('[AssemblyAI] WebSocket created');
      } catch (err) {
         console.error('[AssemblyAI] Failed to create WebSocket:', err);
         this._setStatus('error');
         this.onError?.(`Failed to connect: ${(err as Error).message}`);
         return;
      }

      newWs.onopen = () => {
         console.log('[AssemblyAI] WebSocket OPEN');
      };

      newWs.onmessage = (event: MessageEvent) => {
         try {
            const data = JSON.parse(event.data as string) as AssemblyAIMessage;
            console.log('[AssemblyAI] Message:', data.type, data);
            this._handleMessage(data, newWs);
         } catch (err) {
            console.error('[AssemblyAI] Failed to parse response:', err);
         }
      };

      newWs.onerror = (event: Event) => {
         console.error('[AssemblyAI] WebSocket ERROR:', event);
         this.onError?.('WebSocket error occurred');
      };

      newWs.onclose = (event: CloseEvent) => {
         console.log('[AssemblyAI] WebSocket CLOSED, code:', event.code, 'reason:', event.reason);
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
         } else if (event.code === 4001) {
            this._setStatus('error');
            this.onError?.('Invalid AssemblyAI API key. Please check your key in Settings.');
         } else if (event.code === 4002) {
            this._setStatus('error');
            this.onError?.('Insufficient AssemblyAI credits.');
         } else if (event.code === 4004) {
            this._setStatus('error');
            this.onError?.('Free tier session limit reached. Upgrade your AssemblyAI plan.');
         } else {
            this._tryReconnect(`Connection closed (code: ${event.code})`);
         }
      };
   }

   private _handleMessage(data: AssemblyAIMessage, ws: WebSocket): void {
      switch (data.type) {
         case 'Begin': {
            console.log('[AssemblyAI] Session started, id:', data.id);
            const oldWs = this.ws;
            if (oldWs && oldWs !== ws) {
               try {
                  oldWs.send(JSON.stringify({ type: 'Terminate' }));
                  oldWs.close(1000, 'Session reset');
               } catch {
                  /* ignore */
               }
            }
            this.ws = ws;
            this.isConnected = true;
            this._reconnectManager.reset();
            this._setStatus('connected');
            this._startSessionTimer();
            break;
         }

         case 'Turn': {
            const text = data.transcript?.trim();
            if (!text) break;

            if (data.turn_is_formatted) {
               // Final formatted turn — use for translation
               this._utteranceBuffer.push(text);
               this.onOriginal?.(text, null);
               this.onProvisional?.('', null);
               this._startUtteranceDebounce();
            } else {
               // Partial/streaming turn — use for provisional display
               this.onProvisional?.(text, null);
            }
            break;
         }

         case 'Termination':
            console.log(
               '[AssemblyAI] Session terminated,',
               'audio:',
               data.audio_duration_seconds,
               's,',
               'session:',
               data.session_duration_seconds,
               's',
            );
            break;

         default:
            if (data.error) {
               console.error('[AssemblyAI] Error:', data.error);
               this.onError?.(data.error);
            }
            break;
      }
   }

   private _audioSendCount = 0;

   sendAudio(pcmData: ArrayBuffer): void {
      if (this.ws?.readyState === WebSocket.OPEN) {
         this._audioSendCount++;
         if (this._audioSendCount <= 5 || this._audioSendCount % 50 === 0) {
            console.log(`[AssemblyAI] sendAudio #${this._audioSendCount}, bytes:`, pcmData.byteLength);
         }
         // v3: send raw binary PCM directly
         this.ws.send(pcmData);
      }
   }

   disconnect(): void {
      this._intentionalDisconnect = true;
      this._stopSessionTimer();
      this._flushUtteranceBuffer();
      this._translationQueue.clear();

      if (this.ws) {
         try {
            if (this.ws.readyState === WebSocket.OPEN) {
               this.ws.send(JSON.stringify({ type: 'Terminate' }));
            }
            this.ws.close(1000, 'User disconnected');
         } catch (err) {
            console.error('[AssemblyAI] Error during disconnect:', err);
         }
         this.ws = null;
      }
      this.isConnected = false;
      this._setStatus('disconnected');
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

      if (this._config?.targetLanguage) {
         this._queueTranslation(fullText);
      }
   }

   private _queueTranslation(text: string): void {
      if (this._config) {
         this._translationQueue.enqueue(text, this._config);
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
      console.log('[AssemblyAI] Seamless session reset');
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

export const assemblyAIClient = new AssemblyAIClient();
