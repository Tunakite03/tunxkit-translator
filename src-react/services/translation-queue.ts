/**
 * Shared translation queue — deduplicates translation logic across STT clients.
 * Handles queuing, sequential processing, context history, and LLM/MyMemory dispatch.
 */

const { invoke } = window.__TAURI__.core;

export interface TranslationConfig {
   sourceLanguage: string;
   targetLanguage: string;
   translationEngine?: string;
   customContext?: { domain?: string | null; translation_terms?: { source: string; target: string }[] } | null;
   llmApiKey?: string;
   llmBaseUrl?: string;
   llmModel?: string;
}

export class TranslationQueue {
   private _queue: string[] = [];
   private _translating = false;
   private _recentTranslations: string[] = [];
   private _maxContext: number;

   onTranslation: ((text: string) => void) | null = null;
   onError: ((error: string) => void) | null = null;

   constructor(maxContext = 6) {
      this._maxContext = maxContext;
   }

   /** Enqueue text for translation. */
   enqueue(text: string, config: TranslationConfig): void {
      this._queue.push(text);
      this._processQueue(config);
   }

   /** Clear the queue (e.g. on disconnect). */
   clear(): void {
      this._queue.length = 0;
      this._translating = false;
   }

   /** Reset context history (e.g. on session reset). */
   resetHistory(): void {
      this._recentTranslations = [];
   }

   private async _processQueue(config: TranslationConfig): Promise<void> {
      if (this._translating || this._queue.length === 0) return;
      this._translating = true;

      while (this._queue.length > 0) {
         const text = this._queue.shift()!;
         try {
            const sourceLang = config.sourceLanguage || 'auto';
            const targetLang = config.targetLanguage || 'vi';
            const engine = config.translationEngine || 'mymemory';

            let translated: string;

            if (engine === 'llm') {
               const ctx = config.customContext || {};
               const terms = (
                  (ctx as { translation_terms?: { source: string; target: string }[] }).translation_terms || []
               ).map((t) => [t.source, t.target]);

               translated = await invoke<string>('translate_text_llm', {
                  text,
                  sourceLang: sourceLang === 'auto' ? '' : sourceLang,
                  targetLang,
                  contextSentences: this._recentTranslations.slice(-this._maxContext),
                  domain: (ctx as { domain?: string }).domain || '',
                  customTerms: terms,
                  apiKey: config.llmApiKey || '',
                  baseUrl: config.llmBaseUrl || 'https://api.openai.com/v1',
                  model: config.llmModel || 'gpt-4o-mini',
               });
            } else {
               translated = await invoke<string>('translate_text', {
                  text,
                  sourceLang: sourceLang === 'auto' ? '' : sourceLang,
                  targetLang,
               });
            }

            if (translated?.trim()) {
               this._recentTranslations.push(translated);
               if (this._recentTranslations.length > this._maxContext * 2) {
                  this._recentTranslations = this._recentTranslations.slice(-this._maxContext);
               }
               this.onTranslation?.(translated);
            }
         } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            this.onError?.(`Translation failed: ${errMsg}`);
         }
      }

      this._translating = false;
   }
}
