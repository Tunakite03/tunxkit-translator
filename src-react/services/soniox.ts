/**
 * Soniox WebSocket Client
 * Connects directly to wss://stt-rt.soniox.com/transcribe-websocket
 */

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface SonioxConfig {
   apiKey: string;
   sourceLanguage: string;
   targetLanguage: string;
   customContext?: { domain?: string; translation_terms?: { source: string; target: string }[] } | null;
}

interface SonioxToken {
   text: string;
   is_final?: boolean;
   translation_status?: 'original' | 'translation';
   speaker?: string;
}

interface SonioxResponse {
   tokens?: SonioxToken[];
   error_code?: number;
   error_message?: string;
}

interface ExtendedWebSocket extends WebSocket {
   _isOld?: boolean;
}

const SONIOX_ENDPOINT = 'wss://stt-rt.soniox.com/transcribe-websocket';
const MAX_RECONNECT = 3;
const RECONNECT_DELAY_MS = 2000;
const SESSION_DURATION_MS = 3 * 60 * 1000;
const CONTEXT_HISTORY_CHARS = 500;

export class SonioxClient {
   private ws: ExtendedWebSocket | null = null;
   private apiKey = '';
   isConnected = false;
   private _reconnectAttempts = 0;
   private _config: SonioxConfig | null = null;
   private _intentionalDisconnect = false;
   private _sessionTimer: ReturnType<typeof setTimeout> | null = null;
   private _recentTranslations: string[] = [];

   onOriginal: ((text: string, speaker: string | null) => void) | null = null;
   onTranslation: ((text: string) => void) | null = null;
   onProvisional: ((text: string, speaker: string | null) => void) | null = null;
   onStatusChange: ((status: ConnectionStatus) => void) | null = null;
   onError: ((error: string) => void) | null = null;

   connect(config: SonioxConfig): void {
      const { apiKey } = config;
      this.apiKey = apiKey;
      this._config = config;
      this._intentionalDisconnect = false;
      this._reconnectAttempts = 0;
      this._recentTranslations = [];

      if (!apiKey) {
         this._setStatus('error');
         this.onError?.('API key is required. Please add it in Settings.');
         return;
      }

      this._doConnect(config);
   }

   private _doConnect(config: SonioxConfig, carryoverContext: string | null = null): void {
      const { apiKey, sourceLanguage, targetLanguage, customContext } = config;

      this._setStatus('connecting');
      console.log('[Soniox] Connecting to', SONIOX_ENDPOINT);

      let newWs: ExtendedWebSocket;
      try {
         newWs = new WebSocket(SONIOX_ENDPOINT) as ExtendedWebSocket;
         console.log('[Soniox] WebSocket created, readyState:', newWs.readyState);
      } catch (err) {
         console.error('[Soniox] Failed to create WebSocket:', err);
         this._setStatus('error');
         this.onError?.(`Failed to create WebSocket: ${(err as Error).message}`);
         return;
      }

      newWs.onopen = () => {
         console.log('[Soniox] WebSocket OPEN');

         const configMsg: Record<string, unknown> = {
            api_key: apiKey,
            model: 'stt-rt-v4',
            audio_format: 'pcm_s16le',
            sample_rate: 16000,
            num_channels: 1,
            enable_endpoint_detection: true,
            max_endpoint_delay_ms: 3000,
            enable_speaker_diarization: true,
         };

         if (sourceLanguage && sourceLanguage !== 'auto') {
            configMsg.language_hints = [sourceLanguage];
         }

         if (targetLanguage) {
            configMsg.translation = {
               type: 'one_way',
               target_language: targetLanguage,
            };
         }

         const domain = this._buildDomain(customContext || null, carryoverContext);
         const translationTerms = customContext?.translation_terms || [];
         if (domain || translationTerms.length > 0) {
            const context: Record<string, unknown> = {};
            if (domain) context.domain = domain;
            if (translationTerms.length > 0) context.translation_terms = translationTerms;
            configMsg.context = context;
         }

         console.log('[Soniox] Sending config (model:', configMsg.model, ')');
         newWs.send(JSON.stringify(configMsg));

         const oldWs = this.ws;
         if (oldWs && oldWs !== newWs) {
            console.log('[Soniox] Seamless switch: closing old WebSocket');
            try {
               if (oldWs.readyState === WebSocket.OPEN) {
                  oldWs.send(new ArrayBuffer(0));
               }
               oldWs._isOld = true;
               oldWs.close(1000, 'Session reset');
            } catch {
               // ignore
            }
         }

         this.ws = newWs;
         this.isConnected = true;
         this._reconnectAttempts = 0;
         this._setStatus('connected');
         console.log('[Soniox] Connected and config sent');

         this._startSessionTimer();
      };

      newWs.onmessage = (event: MessageEvent) => {
         if (newWs._isOld) return;

         try {
            const data = JSON.parse(event.data as string) as SonioxResponse;

            if (data.error_code) {
               this._handleApiError(data);
               return;
            }

            this._handleResponse(data);
         } catch (err) {
            console.error('Failed to parse Soniox response:', err);
         }
      };

      newWs.onerror = (event: Event) => {
         if (newWs._isOld) return;
         console.error('[Soniox] WebSocket ERROR:', event);
         this.onError?.('WebSocket error occurred');
      };

      newWs.onclose = (event: CloseEvent) => {
         if (newWs._isOld) {
            console.log('[Soniox] Old WebSocket closed (expected)');
            return;
         }

         console.log(
            '[Soniox] WebSocket CLOSED, code:',
            event.code,
            'reason:',
            event.reason,
            'wasClean:',
            event.wasClean,
         );
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
         } else if (event.code === 1006) {
            this._tryReconnect('Connection lost unexpectedly');
         } else if (event.code === 4001 || event.code === 4003) {
            this._setStatus('error');
            this.onError?.('Invalid API key. Please check your key in Settings.');
         } else if (event.code === 4029) {
            this._setStatus('error');
            this.onError?.('Rate limit exceeded. Please wait and try again.');
         } else if (event.code === 4002) {
            this._setStatus('error');
            this.onError?.('Subscription issue. Please check your Soniox account.');
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

      if (this.ws) {
         try {
            if (this.ws.readyState === WebSocket.OPEN) {
               this.ws.send(new ArrayBuffer(0));
            }
            this.ws.close(1000, 'User disconnected');
         } catch (err) {
            console.error('Error during disconnect:', err);
         }
         this.ws = null;
      }
      this.isConnected = false;
      this._setStatus('disconnected');
   }

   private _handleResponse(data: SonioxResponse): void {
      if (!data.tokens || data.tokens.length === 0) return;

      let originalText = '';
      let translationText = '';
      let provisionalText = '';
      let hasEnd = false;
      let speaker: string | null = null;

      for (const token of data.tokens) {
         if (token.text === '<end>') {
            hasEnd = true;
            continue;
         }

         if (token.speaker && token.translation_status === 'original') {
            speaker = token.speaker;
         }

         if (token.translation_status === 'original') {
            if (token.is_final) {
               originalText += token.text;
            } else {
               provisionalText += token.text;
            }
         } else if (token.translation_status === 'translation') {
            if (token.is_final) {
               translationText += token.text;
            }
         }
      }

      if (originalText.trim()) {
         this.onOriginal?.(originalText, speaker);
      }

      if (translationText.trim()) {
         this.onTranslation?.(translationText);
         this._addToHistory(translationText);
      }

      if (provisionalText.trim()) {
         this.onProvisional?.(provisionalText, speaker);
      } else if (originalText.trim() || translationText.trim() || hasEnd) {
         this.onProvisional?.('', null);
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
      console.log('[Soniox] Seamless session reset (every 3 min)');
      const carryover = this._getCarryoverContext();
      this._doConnect(this._config, carryover);
   }

   private _addToHistory(text: string): void {
      this._recentTranslations.push(text);
      let total = this._recentTranslations.reduce((sum, t) => sum + t.length, 0);
      while (total > CONTEXT_HISTORY_CHARS && this._recentTranslations.length > 1) {
         const removed = this._recentTranslations.shift()!;
         total -= removed.length;
      }
   }

   private _getCarryoverContext(): string | null {
      if (this._recentTranslations.length === 0) return null;
      return this._recentTranslations.join(' ').trim();
   }

   private _buildDomain(
      customContext: { domain?: string; translation_terms?: { source: string; target: string }[] } | null,
      carryoverContext: string | null,
   ): string | null {
      const parts: string[] = [];
      if (customContext?.domain) {
         parts.push(customContext.domain);
      }
      if (carryoverContext) {
         parts.push(`Recent conversation context: ${carryoverContext}`);
      }
      return parts.length > 0 ? parts.join('. ') : null;
   }

   private _handleApiError(data: SonioxResponse): void {
      const code = data.error_code || 0;
      const message = data.error_message || 'Unknown API error';

      console.error('Soniox API error:', code, message);

      if (code === 408) {
         this._tryReconnect('Request timeout');
         return;
      }

      let userMessage = message;
      if (code === 401) {
         userMessage = 'Invalid API key. Please check your key in Settings.';
      } else if (code === 429) {
         userMessage = 'Rate limit exceeded. Please wait a moment.';
      } else if (code === 402) {
         userMessage = 'Insufficient credits. Check your Soniox account.';
      } else if (code === 400) {
         userMessage = `Config error: ${message}`;
      }

      this._setStatus('error');
      this.onError?.(userMessage);
   }

   private _tryReconnect(reason: string): void {
      if (this._reconnectAttempts >= MAX_RECONNECT) {
         this._setStatus('error');
         this.onError?.(`${reason}. Reconnect failed after ${MAX_RECONNECT} attempts.`);
         return;
      }

      this._reconnectAttempts++;
      const delay = RECONNECT_DELAY_MS * this._reconnectAttempts;

      console.log(`Reconnecting (${this._reconnectAttempts}/${MAX_RECONNECT}) in ${delay}ms...`);
      this._setStatus('connecting');
      this.onError?.(`${reason}. Reconnecting (${this._reconnectAttempts}/${MAX_RECONNECT})...`);

      setTimeout(() => {
         if (!this._intentionalDisconnect && this._config) {
            const carryover = this._getCarryoverContext();
            this._doConnect(this._config, carryover);
         }
      }, delay);
   }

   private _setStatus(status: ConnectionStatus): void {
      this.onStatusChange?.(status);
   }
}

export const sonioxClient = new SonioxClient();
