/**
 * Edge TTS via Rust — Frontend module
 * Calls Rust backend to proxy Edge TTS WebSocket (avoids browser header limitations).
 * Returns base64 MP3 audio, played via audioPlayer.
 */

const { invoke } = window.__TAURI__.core;

export type TTSStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

class EdgeTTSRust {
   voice = 'vi-VN-HoaiMyNeural';
   speed = 20;
   isConnected = false;
   private _queue: string[] = [];
   private _isSpeaking = false;

   onAudioChunk: ((base64Audio: string, isFinal: boolean) => void) | null = null;
   onError: ((error: string) => void) | null = null;
   onStatusChange: ((status: TTSStatus) => void) | null = null;

   configure({ voice, speed }: { voice?: string; speed?: number }): void {
      if (voice) this.voice = voice;
      if (speed !== undefined) this.speed = speed;
   }

   connect(): void {
      this.isConnected = true;
      this._setStatus('connected');
      console.log('[Edge TTS] Ready via Rust proxy');
   }

   speak(text: string): void {
      if (!text?.trim()) return;
      this._queue.push(text.trim());
      if (!this._isSpeaking) {
         this._processQueue();
      }
   }

   private async _processQueue(): Promise<void> {
      if (this._queue.length === 0) {
         this._isSpeaking = false;
         return;
      }

      this._isSpeaking = true;
      const text = this._queue.shift()!;
      const startTime = performance.now();

      try {
         const base64Audio = await invoke<string>('edge_tts_speak', {
            text,
            voice: this.voice,
            rate: this.speed,
         });

         const elapsed = performance.now() - startTime;
         console.log(`[Edge TTS] Audio received in ${elapsed.toFixed(0)}ms`);

         if (this.onAudioChunk) {
            this.onAudioChunk(base64Audio, true);
         }
      } catch (err) {
         console.error('[Edge TTS] Error:', err);
         this.onError?.(`Edge TTS: ${err}`);
      }

      this._processQueue();
   }

   disconnect(): void {
      this._queue = [];
      this._isSpeaking = false;
      this.isConnected = false;
      this._setStatus('disconnected');
   }

   private _setStatus(status: TTSStatus): void {
      this.onStatusChange?.(status);
   }
}

export const edgeTTSRust = new EdgeTTSRust();
