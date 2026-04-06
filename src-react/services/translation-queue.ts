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
   /** Number of recent sentences to include as context (default: 10) */
   contextSize?: number;
   /** Formality level: 'auto' | 'formal' | 'casual' */
   formality?: string;
}

/** Stores both original text and its translation for better context */
interface ContextEntry {
   original: string;
   translated: string;
}

export class TranslationQueue {
   private _queue: string[] = [];
   private _translating = false;
   /** Enhanced context: stores both original and translated text */
   private _contextHistory: ContextEntry[] = [];
   private _maxContextSize: number;

   onTranslation: ((text: string) => void) | null = null;
   onError: ((error: string) => void) | null = null;

   constructor(maxContextSize = 10) {
      this._maxContextSize = maxContextSize;
   }

   /** Update max context size dynamically */
   setMaxContextSize(size: number): void {
      this._maxContextSize = Math.max(1, Math.min(size, 30));
      // Trim history if needed
      if (this._contextHistory.length > this._maxContextSize * 2) {
         this._contextHistory = this._contextHistory.slice(-this._maxContextSize);
      }
   }

   /** Enqueue text for translation. */
   enqueue(text: string, config: TranslationConfig): void {
      this._queue.push(text);
      // Update context size from config if provided
      if (config.contextSize && config.contextSize !== this._maxContextSize) {
         this.setMaxContextSize(config.contextSize);
      }
      this._processQueue(config);
   }

   /** Clear the queue (e.g. on disconnect). */
   clear(): void {
      this._queue.length = 0;
      this._translating = false;
   }

   /** Reset context history (e.g. on session reset). */
   resetHistory(): void {
      this._contextHistory = [];
   }

   /** Get recent context for external use */
   getRecentContext(count?: number): ContextEntry[] {
      const n = count ?? this._maxContextSize;
      return this._contextHistory.slice(-n);
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
            const contextSize = config.contextSize ?? this._maxContextSize;

            let translated: string;

            if (engine === 'llm') {
               const ctx = config.customContext || {};
               const terms = (
                  (ctx as { translation_terms?: { source: string; target: string }[] }).translation_terms || []
               ).map((t) => [t.source, t.target]);

               // Build enhanced context with both original and translated text
               const recentContext = this._contextHistory.slice(-contextSize);
               const contextSentences = recentContext.map(entry => 
                  `[${entry.original}] → [${entry.translated}]`
               );

               translated = await invoke<string>('translate_text_llm', {
                  text,
                  sourceLang: sourceLang === 'auto' ? '' : sourceLang,
                  targetLang,
                  contextSentences,
                  domain: (ctx as { domain?: string }).domain || '',
                  customTerms: terms,
                  apiKey: config.llmApiKey || '',
                  baseUrl: config.llmBaseUrl || 'https://api.openai.com/v1',
                  model: config.llmModel || 'gpt-4o-mini',
                  formality: config.formality || 'auto',
               });
            } else {
               translated = await invoke<string>('translate_text', {
                  text,
                  sourceLang: sourceLang === 'auto' ? '' : sourceLang,
                  targetLang,
               });
            }

            if (translated?.trim()) {
               // Store both original and translated text for richer context
               this._contextHistory.push({
                  original: text.trim(),
                  translated: translated.trim(),
               });
               
               // Keep history bounded
               if (this._contextHistory.length > this._maxContextSize * 2) {
                  this._contextHistory = this._contextHistory.slice(-this._maxContextSize);
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
