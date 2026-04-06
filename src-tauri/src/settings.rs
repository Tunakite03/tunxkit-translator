use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

/// Translation term: source → target mapping
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TranslationTerm {
    pub source: String,
    pub target: String,
}

/// Custom context — provides domain-specific hints
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(default)]
pub struct CustomContext {
    pub domain: Option<String>,
    pub translation_terms: Vec<TranslationTerm>,
}

/// App settings — persisted to JSON
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(default)]
pub struct Settings {
    /// Deepgram API key
    pub deepgram_api_key: String,
    /// AssemblyAI API key
    #[serde(default)]
    pub assemblyai_api_key: String,
    /// Deepgram speech-to-text model
    #[serde(default)]
    pub deepgram_model: String,
    /// AssemblyAI speech-to-text model
    #[serde(default)]
    pub assemblyai_model: String,
    /// Local ASR model for MLX pipeline
    #[serde(default = "default_local_asr_model")]
    pub local_asr_model: String,
    /// Legacy Soniox API key (for migration)
    #[serde(default)]
    pub soniox_api_key: String,
    /// Source language: "auto" or ISO 639-1 code
    pub source_language: String,
    /// Target language: ISO 639-1 code
    pub target_language: String,
    /// Audio source: "system" | "microphone" | "both"
    pub audio_source: String,
    /// Overlay opacity: 0.0 - 1.0
    pub overlay_opacity: f64,
    /// Font size in px
    pub font_size: u32,
    /// Max transcript lines to display
    pub max_lines: u32,
    /// Whether to show original text alongside translation
    pub show_original: bool,
    /// STT mode: "deepgram" (cloud API) or "local" (MLX models)
    pub translation_mode: String,
    /// Translation engine: "mymemory" (free) or "llm" (AI)
    pub translation_engine: String,
    /// Optional custom context for better transcription
    pub custom_context: Option<CustomContext>,
    /// ElevenLabs API key for TTS narration
    pub elevenlabs_api_key: String,
    /// Whether TTS narration is enabled
    pub tts_enabled: bool,
    /// TTS provider: "edge" | "elevenlabs" | "google"
    pub tts_provider: String,
    /// ElevenLabs voice ID
    pub tts_voice_id: String,
    /// TTS speed multiplier (Web Speech)
    pub tts_speed: f64,
    /// Edge TTS voice name
    pub edge_tts_voice: String,
    /// Edge TTS speed percentage
    pub edge_tts_speed: i32,
    /// Auto-read new translations aloud
    pub tts_auto_read: bool,
    /// Google Cloud TTS API key
    pub google_tts_api_key: String,
    /// Google TTS voice name
    pub google_tts_voice: String,
    /// Google TTS speaking rate
    pub google_tts_speed: f64,
    /// LLM API key (OpenAI-compatible)
    pub llm_api_key: String,
    /// LLM API base URL
    pub llm_base_url: String,
    /// LLM model name
    pub llm_model: String,
    /// Auto-save transcript on stop/clear/close
    #[serde(default = "default_true")]
    pub auto_save_transcript: bool,
    /// Custom path for saving transcripts (empty = default app data dir)
    #[serde(default)]
    pub transcript_save_path: String,
    /// Context window size for LLM translation (number of recent sentences)
    #[serde(default = "default_context_size")]
    pub llm_context_size: u32,
    /// Formality level for LLM translation: "auto" | "formal" | "casual"
    #[serde(default = "default_formality")]
    pub llm_formality: String,
}

fn default_true() -> bool {
    true
}

fn default_local_asr_model() -> String {
    "whisper".to_string()
}

fn default_context_size() -> u32 {
    10
}

fn default_formality() -> String {
    "auto".to_string()
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            deepgram_api_key: String::new(),
            assemblyai_api_key: String::new(),
            deepgram_model: String::new(),
            assemblyai_model: String::new(),
            local_asr_model: default_local_asr_model(),
            soniox_api_key: String::new(),
            source_language: "auto".to_string(),
            target_language: "vi".to_string(),
            audio_source: "system".to_string(),
            overlay_opacity: 0.85,
            font_size: 16,
            max_lines: 5,
            show_original: true,
            translation_mode: "deepgram".to_string(),
            translation_engine: "mymemory".to_string(),
            custom_context: None,
            elevenlabs_api_key: String::new(),
            tts_enabled: false,
            tts_provider: "edge".to_string(),
            tts_voice_id: "21m00Tcm4TlvDq8ikWAM".to_string(),
            tts_speed: 0.5,
            edge_tts_voice: "vi-VN-HoaiMyNeural".to_string(),
            edge_tts_speed: 0,
            tts_auto_read: false,
            google_tts_api_key: String::new(),
            google_tts_voice: "vi-VN-Chirp3-HD-Aoede".to_string(),
            google_tts_speed: 1.0,
            llm_api_key: String::new(),
            llm_base_url: "https://api.openai.com/v1".to_string(),
            llm_model: "gpt-4o-mini".to_string(),
            auto_save_transcript: true,
            transcript_save_path: String::new(),
            llm_context_size: default_context_size(),
            llm_formality: default_formality(),
        }
    }
}

/// Get the settings file path
/// ~/Library/Application Support/com.personal.translator/settings.json
fn settings_path() -> PathBuf {
    let mut path = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    path.push("com.tunxkit.translator");
    path.push("settings.json");
    path
}

impl Settings {
    fn normalize(&mut self) -> bool {
        let mut changed = false;

        if !self.tts_enabled && self.tts_auto_read {
            self.tts_auto_read = false;
            changed = true;
        }

        changed
    }

    /// Load settings from disk, or return defaults
    pub fn load() -> Self {
        let path = settings_path();
        let mut settings = if path.exists() {
            match fs::read_to_string(&path) {
                Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
                Err(_) => Self::default(),
            }
        } else {
            Self::default()
        };

        if settings.normalize() {
            let _ = settings.save();
        }

        settings
    }

    /// Save settings to disk
    pub fn save(&self) -> Result<(), String> {
        let path = settings_path();

        // Ensure parent directory exists
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create config dir: {}", e))?;
        }

        let json = serde_json::to_string_pretty(self)
            .map_err(|e| format!("Failed to serialize: {}", e))?;

        fs::write(&path, json).map_err(|e| format!("Failed to write settings: {}", e))?;

        Ok(())
    }
}

/// Thread-safe settings state managed by Tauri
pub struct SettingsState(pub Mutex<Settings>);
