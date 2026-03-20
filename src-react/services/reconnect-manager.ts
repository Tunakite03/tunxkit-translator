/**
 * Shared reconnection manager with exponential backoff + jitter.
 * Deduplicates reconnect logic across STT WebSocket clients.
 */

export interface ReconnectOptions {
   maxAttempts?: number;
   baseDelayMs?: number;
   maxDelayMs?: number;
   jitterFactor?: number;
}

const DEFAULTS: Required<ReconnectOptions> = {
   maxAttempts: 5,
   baseDelayMs: 1000,
   maxDelayMs: 16000,
   jitterFactor: 0.3,
};

export class ReconnectManager {
   private _attempts = 0;
   private _opts: Required<ReconnectOptions>;

   onReconnect: (() => void) | null = null;
   onMaxRetriesReached: ((reason: string) => void) | null = null;
   onAttempt: ((attempt: number, maxAttempts: number, reason: string) => void) | null = null;

   constructor(opts?: ReconnectOptions) {
      this._opts = { ...DEFAULTS, ...opts };
   }

   get attempts(): number {
      return this._attempts;
   }

   /** Reset the attempt counter (e.g. after a successful connection). */
   reset(): void {
      this._attempts = 0;
   }

   /** Attempt to reconnect with exponential backoff + jitter. */
   tryReconnect(reason: string): void {
      if (this._attempts >= this._opts.maxAttempts) {
         this.onMaxRetriesReached?.(`${reason}. Reconnect failed after ${this._opts.maxAttempts} attempts.`);
         return;
      }

      this._attempts++;
      const base = Math.min(this._opts.baseDelayMs * 2 ** (this._attempts - 1), this._opts.maxDelayMs);
      const jitter = Math.random() * base * this._opts.jitterFactor;
      const delay = Math.round(base + jitter);

      this.onAttempt?.(this._attempts, this._opts.maxAttempts, reason);

      setTimeout(() => {
         this.onReconnect?.();
      }, delay);
   }
}
