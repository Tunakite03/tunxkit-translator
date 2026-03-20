/**
 * Settings Manager — handles loading/saving settings via Tauri IPC
 */

const { invoke } = window.__TAURI__.core;

export interface AppSettings {
   deepgram_api_key: string;
   assemblyai_api_key: string;
   source_language: string;
   target_language: string;
   audio_source: string;
   overlay_opacity: number;
   font_size: number;
   max_lines: number;
   show_original: boolean;
   translation_mode: string;
   translation_engine: string;
   custom_context: CustomContext | null;
   elevenlabs_api_key: string;
   tts_enabled: boolean;
   tts_provider: string;
   tts_voice_id: string;
   tts_speed: number;
   edge_tts_voice: string;
   edge_tts_speed: number;
   tts_auto_read: boolean;
   llm_api_key: string;
   llm_base_url: string;
   llm_model: string;
   auto_save_transcript: boolean;
   transcript_save_path: string;
}

export interface CustomContext {
   domain?: string | null;
   translation_terms?: TranslationTerm[];
}

export interface TranslationTerm {
   source: string;
   target: string;
}

const DEFAULT_SETTINGS: AppSettings = {
   deepgram_api_key: '',
   assemblyai_api_key: '',
   source_language: 'auto',
   target_language: 'vi',
   audio_source: 'system',
   overlay_opacity: 0.85,
   font_size: 16,
   max_lines: 5,
   show_original: true,
   translation_mode: 'deepgram',
   translation_engine: 'mymemory',
   custom_context: null,
   elevenlabs_api_key: '',
   tts_enabled: false,
   tts_provider: 'edge',
   tts_voice_id: '21m00Tcm4TlvDq8ikWAM',
   tts_speed: 1.2,
   edge_tts_voice: 'vi-VN-HoaiMyNeural',
   edge_tts_speed: 50,
   tts_auto_read: true,
   llm_api_key: '',
   llm_base_url: 'https://api.openai.com/v1',
   llm_model: 'gpt-4o-mini',
   auto_save_transcript: true,
   transcript_save_path: '',
};

type SettingsListener = (settings: AppSettings) => void;

class SettingsManager {
   private settings: AppSettings;
   private _listeners: SettingsListener[];

   constructor() {
      this.settings = { ...DEFAULT_SETTINGS };
      this._listeners = [];
   }

   async load(): Promise<AppSettings> {
      try {
         const settings = await invoke<Partial<AppSettings>>('get_settings');
         this.settings = { ...DEFAULT_SETTINGS, ...settings };
      } catch (err) {
         console.error('Failed to load settings:', err);
         this.settings = { ...DEFAULT_SETTINGS };
      }
      this._notify();
      return this.settings;
   }

   async save(newSettings: Partial<AppSettings>): Promise<boolean> {
      try {
         const merged = { ...this.settings, ...newSettings };
         await invoke('save_settings', { newSettings: merged });
         this.settings = merged;
         this._notify();
         return true;
      } catch (err) {
         console.error('Failed to save settings:', err);
         throw err;
      }
   }

   get(): AppSettings {
      return { ...this.settings };
   }

   onChange(callback: SettingsListener): () => void {
      this._listeners.push(callback);
      return () => {
         this._listeners = this._listeners.filter((l) => l !== callback);
      };
   }

   private _notify(): void {
      const settings = this.get();
      this._listeners.forEach((cb) => cb(settings));
   }
}

export const settingsManager = new SettingsManager();
