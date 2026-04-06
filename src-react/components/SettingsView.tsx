import { useState, useEffect, useCallback } from "react";
import { useApp } from "../store/app-store";
import { settingsManager } from "../services/settings";
import { Button } from "./ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { ArrowLeft, Check } from "lucide-react";
import TranslationTab from "./TranslationTab";
import DisplayTab from "./DisplayTab";
import TTSTab from "./TTSTab";

export interface FormData {
  deepgram_api_key: string;
  assemblyai_api_key: string;
  deepgram_model: string;
  assemblyai_model: string;
  local_asr_model: string;
  source_language: string;
  target_language: string;
  translation_mode: string;
  translation_engine: string;
  audio_source: string;
  overlay_opacity: number;
  font_size: number;
  max_lines: number;
  show_original: boolean;
  context_domain: string;
  tts_enabled: boolean;
  tts_provider: string;
  elevenlabs_api_key: string;
  tts_voice_id: string;
  edge_tts_voice: string;
  edge_tts_speed: number;
  llm_api_key: string;
  llm_base_url: string;
  llm_model: string;
  auto_save_transcript: boolean;
  transcript_save_path: string;
  /** Context window size for LLM translation */
  llm_context_size: number;
  /** Formality level: 'auto' | 'formal' | 'casual' */
  llm_formality: string;
}

export interface TranslationTerm {
  source: string;
  target: string;
}

export default function SettingsView() {
  const { setView, saveSettings, appWindow } = useApp();
  const [form, setForm] = useState<FormData | null>(null);
  const [terms, setTerms] = useState<TranslationTerm[]>([]);

  useEffect(() => {
    const s = settingsManager.get();
    setForm({
      deepgram_api_key: s.deepgram_api_key || "",
      assemblyai_api_key: s.assemblyai_api_key || "",
      deepgram_model: s.deepgram_model || "",
      assemblyai_model: s.assemblyai_model || "",
      local_asr_model: s.local_asr_model || "whisper",
      source_language: s.source_language || "auto",
      target_language: s.target_language || "vi",
      translation_mode: s.translation_mode || "deepgram",
      translation_engine: s.translation_engine || "mymemory",
      audio_source: s.audio_source || "system",
      overlay_opacity: Math.round((s.overlay_opacity || 0.85) * 100),
      font_size: s.font_size || 16,
      max_lines: s.max_lines || 5,
      show_original: s.show_original !== false,
      context_domain: s.custom_context?.domain || "",
      tts_enabled: !!s.tts_enabled,
      tts_provider: s.tts_provider || "edge",
      elevenlabs_api_key: s.elevenlabs_api_key || "",
      tts_voice_id: s.tts_voice_id || "21m00Tcm4TlvDq8ikWAM",
      edge_tts_voice: s.edge_tts_voice || "vi-VN-HoaiMyNeural",
      edge_tts_speed: s.edge_tts_speed !== undefined ? s.edge_tts_speed : 20,
      llm_api_key: s.llm_api_key || "",
      llm_base_url: s.llm_base_url || "https://api.openai.com/v1",
      llm_model: s.llm_model || "gpt-4o-mini",
      auto_save_transcript: s.auto_save_transcript !== false,
      transcript_save_path: s.transcript_save_path || "",
      llm_context_size: s.llm_context_size || 10,
      llm_formality: s.llm_formality || "auto",
    });
    setTerms(s.custom_context?.translation_terms || []);
  }, []);

  const update = useCallback(
    <K extends keyof FormData>(key: K, value: FormData[K]) => {
      setForm((prev) => {
        if (!prev) return prev;
        const next = { ...prev, [key]: value };
        // Auto-detect base URL from API key prefix
        if (key === "llm_api_key" && typeof value === "string") {
          const defaultUrl = "https://api.openai.com/v1";
          const isDefaultOrEmpty =
            !prev.llm_base_url ||
            prev.llm_base_url === defaultUrl ||
            prev.llm_base_url === "https://api.groq.com/openai/v1" ||
            prev.llm_base_url ===
              "https://generativelanguage.googleapis.com/v1beta/openai";
          if (isDefaultOrEmpty) {
            if (value.startsWith("gsk_")) {
              next.llm_base_url = "https://api.groq.com/openai/v1";
            } else if (value.startsWith("AIza")) {
              next.llm_base_url =
                "https://generativelanguage.googleapis.com/v1beta/openai";
            } else if (value.startsWith("sk-")) {
              next.llm_base_url = defaultUrl;
            }
          }
        }
        return next;
      });
    },
    [],
  );

  const handleSave = async () => {
    if (!form) return;
    const customContext =
      form.context_domain || terms.length > 0
        ? {
            domain: form.context_domain || null,
            translation_terms: terms.filter((t) => t.source && t.target),
          }
        : null;

    await saveSettings({
      deepgram_api_key: form.deepgram_api_key,
      assemblyai_api_key: form.assemblyai_api_key,
      deepgram_model: form.deepgram_model,
      assemblyai_model: form.assemblyai_model,
      local_asr_model: form.local_asr_model,
      source_language: form.source_language,
      target_language: form.target_language,
      translation_mode: form.translation_mode,
      translation_engine: form.translation_engine,
      audio_source: form.audio_source,
      overlay_opacity: form.overlay_opacity / 100,
      font_size: form.font_size,
      max_lines: form.max_lines,
      show_original: form.show_original,
      custom_context: customContext,
      tts_enabled: form.tts_enabled,
      tts_provider: form.tts_provider,
      elevenlabs_api_key: form.elevenlabs_api_key,
      tts_voice_id: form.tts_voice_id,
      edge_tts_voice: form.edge_tts_voice,
      edge_tts_speed: form.edge_tts_speed,
      llm_api_key: form.llm_api_key,
      llm_base_url: form.llm_base_url,
      llm_model: form.llm_model,
      auto_save_transcript: form.auto_save_transcript,
      transcript_save_path: form.transcript_save_path,
      llm_context_size: form.llm_context_size,
      llm_formality: form.llm_formality,
    });
  };

  const handleDrag = (e: React.MouseEvent) => {
    if (
      (e.target as HTMLElement).closest(
        "button, input, select, label, textarea, [role='radio'], [role='tab'], [role='slider'], [role='combobox'], [role='listbox'], [role='checkbox']",
      )
    )
      return;
    if (e.buttons === 1) {
      e.preventDefault();
      appWindow.startDragging();
    }
  };

  if (!form) return null;

  const sourceLanguages = [
    { value: "auto", label: "Auto-detect" },
    { value: "en", label: "English" },
    { value: "ja", label: "Japanese" },
    { value: "ko", label: "Korean" },
    { value: "zh", label: "Chinese" },
    { value: "fr", label: "French" },
    { value: "de", label: "German" },
    { value: "es", label: "Spanish" },
    { value: "vi", label: "Vietnamese" },
    { value: "th", label: "Thai" },
    { value: "id", label: "Indonesian" },
  ];

  const targetLanguages = sourceLanguages.filter((l) => l.value !== "auto");

  return (
    <div
      className="flex flex-col w-full h-full overflow-hidden"
      onMouseDown={handleDrag}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 h-10 border-b border-border bg-card/80 shrink-0"
        data-tauri-drag-region
      >
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setView("overlay")}
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-sm font-semibold text-foreground tracking-tight">
          Settings
        </h2>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-chart-1"
          onClick={handleSave}
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <Check className="h-4 w-4" />
        </Button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <Tabs defaultValue="translation" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="translation">Translation</TabsTrigger>
            <TabsTrigger value="display">Display</TabsTrigger>
            <TabsTrigger value="tts">TTS</TabsTrigger>
          </TabsList>

          {/* â”€â”€â”€ Translation Tab â”€â”€â”€ */}
          <TabsContent value="translation" className="space-y-5">
            <TranslationTab
              form={form}
              update={update}
              terms={terms}
              setTerms={setTerms}
              sourceLanguages={sourceLanguages}
              targetLanguages={targetLanguages}
            />
          </TabsContent>

          {/* â”€â”€â”€ Display Tab â”€â”€â”€ */}
          <TabsContent value="display" className="space-y-5">
            <DisplayTab form={form} update={update} />
          </TabsContent>

          {/* â”€â”€â”€ TTS Tab â”€â”€â”€ */}
          <TabsContent value="tts" className="space-y-5">
            <TTSTab form={form} update={update} />
          </TabsContent>
        </Tabs>

        {/* Save Button */}
        <Button className="w-full mt-4 gap-2" onClick={handleSave}>
          <Check className="h-4 w-4" />
          Save & Close
        </Button>
      </div>
    </div>
  );
}
