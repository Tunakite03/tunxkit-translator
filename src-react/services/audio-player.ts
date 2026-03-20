/**
 * AudioPlayer — queue-based audio playback using Web Audio API
 * Handles base64 MP3 chunks from TTS providers and plays them seamlessly.
 */

class AudioPlayer {
   private audioContext: AudioContext | null = null;
   private _queue: AudioBuffer[] = [];
   private _isPlaying = false;
   private _nextStartTime = 0;
   private _enabled = true;
   private _currentSource: AudioBufferSourceNode | null = null;
   private _maxQueueSize = 10;

   init(): void {
      if (this.audioContext) return;
      this.audioContext = new (
         window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      )();
      console.log('[AudioPlayer] Initialized, state:', this.audioContext.state);
   }

   async resume(): Promise<void> {
      if (this.audioContext && this.audioContext.state === 'suspended') {
         await this.audioContext.resume();
         console.log('[AudioPlayer] Resumed from suspended state');
      }
   }

   async enqueue(base64Audio: string): Promise<void> {
      if (!this._enabled || !this.audioContext || !base64Audio) return;

      await this.resume();

      const binaryStr = atob(base64Audio);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
         bytes[i] = binaryStr.charCodeAt(i);
      }

      try {
         const audioBuffer = await this.audioContext.decodeAudioData(bytes.buffer.slice(0) as ArrayBuffer);

         if (this._queue.length >= this._maxQueueSize) {
            const dropped = this._queue.length - this._maxQueueSize + 1;
            this._queue.splice(0, dropped);
            console.warn(`[AudioPlayer] Dropped ${dropped} stale audio buffer(s)`);
         }

         this._queue.push(audioBuffer);
         this._scheduleNext();
      } catch (e) {
         if (bytes.length > 100) {
            console.warn('[AudioPlayer] Decode failed for chunk of size:', bytes.length, (e as Error).message);
         }
      }
   }

   private _scheduleNext(): void {
      if (this._queue.length === 0 || !this.audioContext) {
         this._isPlaying = false;
         return;
      }

      if (this._isPlaying && this._nextStartTime > this.audioContext.currentTime + 0.1) {
         return;
      }

      const buffer = this._queue.shift()!;
      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(this.audioContext.destination);

      const currentTime = this.audioContext.currentTime;
      const startTime = Math.max(currentTime, this._nextStartTime);

      source.start(startTime);
      this._nextStartTime = startTime + buffer.duration;
      this._currentSource = source;
      this._isPlaying = true;

      source.onended = () => {
         if (this._queue.length > 0) {
            this._scheduleNext();
         } else {
            this._isPlaying = false;
            this._currentSource = null;
         }
      };
   }

   stop(): void {
      this._queue = [];
      this._isPlaying = false;
      this._nextStartTime = 0;

      if (this._currentSource) {
         try {
            this._currentSource.stop();
         } catch {
            // Already stopped
         }
         this._currentSource = null;
      }

      if (this.audioContext && this.audioContext.state !== 'closed') {
         this.audioContext.close().catch(() => {});
         this.audioContext = new (
            window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
         )();
      }
   }

   setEnabled(enabled: boolean): void {
      this._enabled = enabled;
      if (!enabled) {
         this.stop();
      }
   }

   get isActive(): boolean {
      return this._isPlaying || this._queue.length > 0;
   }

   get enabled(): boolean {
      return this._enabled;
   }
}

export const audioPlayer = new AudioPlayer();
