const { invoke } = window.__TAURI__.core;

export type SpeechToTextProvider = 'deepgram' | 'assemblyai' | 'local';
export type SpeechToTextModelField = 'deepgram_model' | 'assemblyai_model' | 'local_asr_model';

export interface SpeechToTextModelOption {
   value: string;
   label: string;
   description?: string | null;
}

const ASSEMBLYAI_MULTILINGUAL_LANGS = new Set(['en', 'es', 'pt', 'de', 'fr', 'it']);

const FALLBACK_STT_MODELS: Record<SpeechToTextProvider, SpeechToTextModelOption[]> = {
   deepgram: [
      { value: 'nova-3-general', label: 'Nova-3 General', description: 'Latest general-purpose streaming model' },
      { value: 'nova-3-medical', label: 'Nova-3 Medical', description: 'Medical terminology and dictation' },
      { value: 'nova-2-general', label: 'Nova-2 General', description: 'Previous generation general model' },
      { value: 'whisper-large', label: 'Whisper Large', description: 'Open-source Whisper via Deepgram' },
   ],
   assemblyai: [
      { value: 'u3-rt-pro', label: 'Universal-3 Pro', description: 'Newest high-accuracy streaming model' },
      {
         value: 'universal-streaming-multilingual',
         label: 'Universal Streaming Multilingual',
         description: 'Best for supported multilingual streaming',
      },
      {
         value: 'universal-streaming-english',
         label: 'Universal Streaming English',
         description: 'English-optimized streaming',
      },
      { value: 'whisper-rt', label: 'Whisper RT', description: 'Broadest language coverage' },
   ],
   local: [
      { value: 'whisper', label: 'Whisper Large v3 Turbo', description: 'MLX Whisper for Apple Silicon' },
      { value: 'qwen', label: 'Qwen3-ASR-0.6B', description: 'MLX Audio ASR model' },
   ],
};

function pickFirstAvailable(preferred: string[], options: SpeechToTextModelOption[]): string {
   for (const value of preferred) {
      if (options.some((option) => option.value === value)) {
         return value;
      }
   }
   return options[0]?.value || '';
}

export function getSttModelField(provider: SpeechToTextProvider): SpeechToTextModelField {
   switch (provider) {
      case 'deepgram':
         return 'deepgram_model';
      case 'assemblyai':
         return 'assemblyai_model';
      default:
         return 'local_asr_model';
   }
}

export function getFallbackSttModels(provider: SpeechToTextProvider): SpeechToTextModelOption[] {
   return FALLBACK_STT_MODELS[provider].map((option) => ({ ...option }));
}

export async function fetchSpeechToTextModels(
   provider: Exclude<SpeechToTextProvider, 'local'>,
): Promise<SpeechToTextModelOption[]> {
   return invoke<SpeechToTextModelOption[]>('get_stt_models', { provider });
}

export function getDefaultSpeechToTextModel(
   provider: SpeechToTextProvider,
   sourceLanguage: string,
   options: SpeechToTextModelOption[],
): string {
   if (options.length === 0) return '';

   if (provider === 'deepgram') {
      return pickFirstAvailable(
         ['nova-3-general', 'nova-3-medical', 'nova-2-general', 'nova-2-medical', 'whisper-large'],
         options,
      );
   }

   if (provider === 'assemblyai') {
      const normalizedLang = (sourceLanguage || 'auto').split('-')[0];
      if (normalizedLang === 'auto' || ASSEMBLYAI_MULTILINGUAL_LANGS.has(normalizedLang)) {
         return pickFirstAvailable(
            ['u3-rt-pro', 'universal-streaming-multilingual', 'universal-streaming-english', 'whisper-rt'],
            options,
         );
      }

      return pickFirstAvailable(
         ['whisper-rt', 'u3-rt-pro', 'universal-streaming-multilingual', 'universal-streaming-english'],
         options,
      );
   }

   return pickFirstAvailable(['whisper', 'qwen'], options);
}

export function getSpeechToTextModelLabel(provider: SpeechToTextProvider, value: string): string {
   const fallback = FALLBACK_STT_MODELS[provider].find((option) => option.value === value);
   return fallback?.label || value;
}
