/**
 * ElevenLabs TTS — WebSocket streaming client
 * Uses Flash v2.5 model for ultra-low-latency text-to-speech
 */

export type TTSStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface ElevenLabsStats {
   requests: number;
   totalTTFB: number;
   minTTFB: number;
   maxTTFB: number;
   chunks: number;
   totalAudioBytes: number;
}

class ElevenLabsTTS {
   private ws: WebSocket | null = null;
   private apiKey: string | null = null;
   private voiceId: string | null = null;
   private modelId = 'eleven_flash_v2_5';
   private outputFormat = 'mp3_44100_128';
   isConnected = false;

   onAudioChunk: ((base64Audio: string, isFinal: boolean) => void) | null = null;
   onError: ((error: string) => void) | null = null;
   onStatusChange: ((status: TTSStatus) => void) | null = null;

   private _textQueue: string[] = [];
   private _reconnectAttempts = 0;
   private _maxReconnectAttempts = 3;
   private _intentionalClose = false;

   private _sendTimestamps: Record<string, number> = {};
   private _stats: ElevenLabsStats = {
      requests: 0,
      totalTTFB: 0,
      minTTFB: Infinity,
      maxTTFB: 0,
      chunks: 0,
      totalAudioBytes: 0,
   };

   configure({ apiKey, voiceId }: { apiKey: string; voiceId?: string }): void {
      this.apiKey = apiKey;
      this.voiceId = voiceId || 'FTYCiQT21H9XQvhRu0ch';
   }

   connect(): void {
      if (!this.apiKey || !this.voiceId) {
         console.warn('[ElevenLabs] Missing apiKey or voiceId');
         return;
      }

      if (this.ws && this.ws.readyState <= WebSocket.OPEN) {
         return;
      }

      this._intentionalClose = false;
      this._setStatus('connecting');

      const url =
         `wss://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}/stream-input` +
         `?model_id=${this.modelId}` +
         `&output_format=${this.outputFormat}`;

      console.log('[ElevenLabs] Connecting to:', url.replace(/xi-api-key=[^&]+/, 'xi-api-key=***'));

      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
         console.log('[ElevenLabs] WebSocket connected');
         this.isConnected = true;
         this._reconnectAttempts = 0;

         this.ws!.send(
            JSON.stringify({
               text: ' ',
               voice_settings: {
                  stability: 0.5,
                  similarity_boost: 0.75,
               },
               xi_api_key: this.apiKey,
            }),
         );

         this._setStatus('connected');
         this._flushQueue();
      };

      this.ws.onmessage = (event: MessageEvent) => {
         try {
            const data = JSON.parse(event.data as string);

            if (data.audio && this.onAudioChunk) {
               const pendingKey = Object.keys(this._sendTimestamps)[0];
               if (pendingKey && this._sendTimestamps[pendingKey]) {
                  const ttfb = performance.now() - this._sendTimestamps[pendingKey];
                  this._stats.requests++;
                  this._stats.totalTTFB += ttfb;
                  this._stats.minTTFB = Math.min(this._stats.minTTFB, ttfb);
                  this._stats.maxTTFB = Math.max(this._stats.maxTTFB, ttfb);
                  console.log(`[ElevenLabs] TTFB: ${ttfb.toFixed(0)}ms for "${pendingKey.substring(0, 40)}..."`);
                  delete this._sendTimestamps[pendingKey];
               }

               this._stats.chunks++;
               this._stats.totalAudioBytes += (data.audio as string).length * 0.75;

               this.onAudioChunk(data.audio, data.isFinal || false);
            }

            if (data.error) {
               console.error('[ElevenLabs] Server error:', data.error);
               this.onError?.(`TTS error: ${data.error}`);
            }
         } catch (e) {
            console.warn('[ElevenLabs] Failed to parse message:', e);
         }
      };

      this.ws.onerror = (err: Event) => {
         console.error('[ElevenLabs] WebSocket error:', err);
         this.onError?.('TTS connection error');
         this._setStatus('error');
      };

      this.ws.onclose = (event: CloseEvent) => {
         console.log(`[ElevenLabs] WebSocket closed: code=${event.code} reason="${event.reason}"`);
         this.isConnected = false;

         if (this._intentionalClose) {
            this._setStatus('disconnected');
            return;
         }

         if (this._reconnectAttempts < this._maxReconnectAttempts) {
            this._reconnectAttempts++;
            const base = Math.min(1000 * 2 ** (this._reconnectAttempts - 1), 16000);
            const delay = base + Math.random() * base * 0.3;
            console.log(
               `[ElevenLabs] Reconnecting in ${Math.round(delay)}ms (attempt ${this._reconnectAttempts}/${this._maxReconnectAttempts})`,
            );
            setTimeout(() => this.connect(), delay);
         } else {
            this._setStatus('disconnected');
            this.onError?.('TTS disconnected after max retries');
         }
      };
   }

   speak(text: string): void {
      if (!text?.trim()) return;

      if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
         this._sendText(text);
      } else {
         this._textQueue.push(text);
         if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
            this.connect();
         }
      }
   }

   private _sendText(text: string): void {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

      // Bound timestamps map to prevent memory leak
      const keys = Object.keys(this._sendTimestamps);
      if (keys.length >= 20) {
         delete this._sendTimestamps[keys[0]];
      }
      this._sendTimestamps[text] = performance.now();

      this.ws.send(
         JSON.stringify({
            text: text + ' ',
            flush: true,
         }),
      );
   }

   private _flushQueue(): void {
      while (this._textQueue.length > 0) {
         const text = this._textQueue.shift()!;
         this._sendText(text);
      }
   }

   disconnect(): void {
      this._intentionalClose = true;
      this._textQueue = [];
      this._sendTimestamps = {};

      if (this._stats.requests > 0) {
         const avgTTFB = this._stats.totalTTFB / this._stats.requests;
         console.log(`[ElevenLabs] Session stats:`);
         console.log(`  Requests: ${this._stats.requests}`);
         console.log(
            `  TTFB avg: ${avgTTFB.toFixed(0)}ms, min: ${this._stats.minTTFB.toFixed(0)}ms, max: ${this._stats.maxTTFB.toFixed(0)}ms`,
         );
         console.log(`  Audio chunks: ${this._stats.chunks}`);
         console.log(`  Audio data: ${(this._stats.totalAudioBytes / 1024).toFixed(1)}KB`);
      }

      if (this.ws) {
         if (this.ws.readyState === WebSocket.OPEN) {
            try {
               this.ws.send(JSON.stringify({ text: '' }));
            } catch {
               // Ignore send errors during close
            }
         }
         this.ws.close();
         this.ws = null;
      }

      this.isConnected = false;
      this._reconnectAttempts = 0;
      this._setStatus('disconnected');
   }

   private _setStatus(status: TTSStatus): void {
      this.onStatusChange?.(status);
   }
}

export const elevenLabsTTS = new ElevenLabsTTS();
