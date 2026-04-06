import { useEffect, useState } from "react";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "./ui/select";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { Eye, EyeOff, Plus, X } from "lucide-react";
import type { FormData, TranslationTerm } from "./SettingsView";
import {
  fetchSpeechToTextModels,
  getDefaultSpeechToTextModel,
  getFallbackSttModels,
  getSttModelField,
  type SpeechToTextModelOption,
  type SpeechToTextProvider,
} from "../services/stt-models";

interface Props {
  form: FormData;
  update: <K extends keyof FormData>(key: K, value: FormData[K]) => void;
  terms: TranslationTerm[];
  setTerms: (terms: TranslationTerm[]) => void;
  sourceLanguages: { value: string; label: string }[];
  targetLanguages: { value: string; label: string }[];
}

type ProviderModelState = Record<
  SpeechToTextProvider,
  SpeechToTextModelOption[]
>;
type ProviderLoadState = Record<
  SpeechToTextProvider,
  { loading: boolean; error: string | null }
>;

export default function TranslationTab({
  form,
  update,
  terms,
  setTerms,
  sourceLanguages,
  targetLanguages,
}: Props) {
  const [showApiKey, setShowApiKey] = useState(false);
  const [showAssemblyAIKey, setShowAssemblyAIKey] = useState(false);
  const [showLlmKey, setShowLlmKey] = useState(false);
  const [modelOptions, setModelOptions] = useState<ProviderModelState>({
    deepgram: [],
    assemblyai: [],
    local: getFallbackSttModels("local"),
  });
  const [modelState, setModelState] = useState<ProviderLoadState>({
    deepgram: { loading: false, error: null },
    assemblyai: { loading: false, error: null },
    local: { loading: false, error: null },
  });

  useEffect(() => {
    let cancelled = false;
    const provider = form.translation_mode as SpeechToTextProvider;
    const modelField = getSttModelField(provider);

    const syncModels = (
      options: SpeechToTextModelOption[],
      error: string | null,
    ) => {
      if (cancelled) return;

      setModelOptions((prev) => ({ ...prev, [provider]: options }));
      setModelState((prev) => ({
        ...prev,
        [provider]: { loading: false, error },
      }));

      const currentModel = form[modelField];
      const nextModel = options.some((option) => option.value === currentModel)
        ? currentModel
        : getDefaultSpeechToTextModel(provider, form.source_language, options);

      if (nextModel && nextModel !== currentModel) {
        update(modelField, nextModel as FormData[typeof modelField]);
      }
    };

    if (provider === "local") {
      syncModels(getFallbackSttModels("local"), null);
      return () => {
        cancelled = true;
      };
    }

    setModelState((prev) => ({
      ...prev,
      [provider]: { loading: true, error: null },
    }));

    fetchSpeechToTextModels(provider)
      .then((options) => {
        syncModels(options, null);
      })
      .catch((error) => {
        console.error(`[Settings] Failed to load ${provider} models:`, error);
        syncModels(
          getFallbackSttModels(provider),
          "Could not refresh the latest provider models. Showing fallback options.",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [form.translation_mode, form.source_language, update]);

  const activeProvider = form.translation_mode as SpeechToTextProvider;
  const activeModelField = getSttModelField(activeProvider);
  const activeModels = modelOptions[activeProvider] || [];
  const activeModel = form[activeModelField];
  const selectedModel = activeModels.some(
    (option) => option.value === activeModel,
  )
    ? activeModel
    : undefined;
  const selectedModelOption = activeModels.find(
    (option) => option.value === activeModel,
  );

  return (
    <div className="space-y-5">
      {/* STT Engine */}
      <SettingsSection>
        <Label className="text-xs text-muted-foreground">Speech-to-Text</Label>
        <Select
          value={form.translation_mode}
          onValueChange={(v) => update("translation_mode", v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="deepgram">☁️ Deepgram Nova-3 (Cloud)</SelectItem>
            <SelectItem value="assemblyai">☁️ AssemblyAI (Cloud)</SelectItem>
            <SelectItem value="local">
              🖥️ Local MLX Whisper (Offline)
            </SelectItem>
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground mt-1">
          {form.translation_mode === "deepgram"
            ? "Real-time, 36+ languages, $200 free credit"
            : form.translation_mode === "assemblyai"
              ? "Real-time, 12+ languages, pay-as-you-go"
              : "Offline, free, ~3-4s delay (Apple Silicon only)"}
        </p>
        {/* API Key — Deepgram */}
        {form.translation_mode === "deepgram" && (
          <SettingsSection>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">
                Deepgram API Key
              </Label>
              <span className="text-[10px] font-medium text-chart-3 bg-chart-3/10 px-1.5 py-0.5 rounded">
                Required
              </span>
            </div>
            <div className="flex gap-1.5">
              <Input
                type={showApiKey ? "text" : "password"}
                value={form.deepgram_api_key}
                onChange={(e) => update("deepgram_api_key", e.target.value)}
                placeholder="Enter your Deepgram API key..."
                className="flex-1"
              />
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setShowApiKey(!showApiKey)}
              >
                {showApiKey ? (
                  <EyeOff className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Get free key at{" "}
              <a
                href="#"
                className="text-primary hover:underline"
                onClick={(e) => {
                  e.preventDefault();
                  window.__TAURI__.opener.openUrl(
                    "https://console.deepgram.com/signup",
                  );
                }}
              >
                console.deepgram.com
              </a>{" "}
              ($200 free credit)
            </p>
          </SettingsSection>
        )}

        {/* API Key — AssemblyAI */}
        {form.translation_mode === "assemblyai" && (
          <SettingsSection>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">
                AssemblyAI API Key
              </Label>
              <span className="text-[10px] font-medium text-chart-3 bg-chart-3/10 px-1.5 py-0.5 rounded">
                Required
              </span>
            </div>
            <div className="flex gap-1.5">
              <Input
                type={showAssemblyAIKey ? "text" : "password"}
                value={form.assemblyai_api_key}
                onChange={(e) => update("assemblyai_api_key", e.target.value)}
                placeholder="Enter your AssemblyAI API key..."
                className="flex-1"
              />
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setShowAssemblyAIKey(!showAssemblyAIKey)}
              >
                {showAssemblyAIKey ? (
                  <EyeOff className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Get key at{" "}
              <a
                href="#"
                className="text-primary hover:underline"
                onClick={(e) => {
                  e.preventDefault();
                  window.__TAURI__.opener.openUrl(
                    "https://www.assemblyai.com/dashboard/signup",
                  );
                }}
              >
                assemblyai.com
              </a>{" "}
              (pay-as-you-go)
            </p>
          </SettingsSection>
        )}

        <SettingsSection>
          <Label className="text-xs text-muted-foreground">Model</Label>
          <Select
            value={selectedModel}
            onValueChange={(value) =>
              update(
                activeModelField,
                value as FormData[typeof activeModelField],
              )
            }
            disabled={
              modelState[activeProvider].loading || activeModels.length === 0
            }
          >
            <SelectTrigger>
              <SelectValue
                placeholder={
                  modelState[activeProvider].loading
                    ? "Loading models..."
                    : "Select a model"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {activeModels.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground mt-1">
            {modelState[activeProvider].loading
              ? "Fetching the latest model list from the provider..."
              : selectedModelOption?.description ||
                "Choose which speech model to use for live transcription."}
          </p>
          {modelState[activeProvider].error && (
            <p className="text-[11px] text-chart-4 mt-1">
              {modelState[activeProvider].error}
            </p>
          )}
        </SettingsSection>
      </SettingsSection>

      {/* Translation Engine */}
      <SettingsSection>
        <Label className="text-xs text-muted-foreground">Translation</Label>
        <Select
          value={form.translation_engine}
          onValueChange={(v) => update("translation_engine", v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="mymemory">🌐 MyMemory (Free)</SelectItem>
            <SelectItem value="llm">🤖 LLM / AI (Context-aware)</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground mt-1">
          {form.translation_engine === "mymemory"
            ? "Free, no API key needed, basic sentence-by-sentence translation"
            : "Uses conversation context + domain + custom terms for accurate translation"}
        </p>
        {/* LLM Settings */}
        {form.translation_engine === "llm" && (
          <SettingsSection>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">
                LLM API Key
              </Label>
              <span className="text-[10px] font-medium text-chart-3 bg-chart-3/10 px-1.5 py-0.5 rounded">
                Required
              </span>
            </div>
            <div className="flex gap-1.5">
              <Input
                type={showLlmKey ? "text" : "password"}
                value={form.llm_api_key}
                onChange={(e) => update("llm_api_key", e.target.value)}
                placeholder="sk-... / gsk_... / AIza..."
                className="flex-1"
              />
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setShowLlmKey(!showLlmKey)}
              >
                {showLlmKey ? (
                  <EyeOff className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>

            <Label className="text-xs text-muted-foreground mt-3">
              Provider
            </Label>
            <LLMProviderSelect form={form} update={update} />

            <LLMModelSelect form={form} update={update} />

            <p className="text-[11px] text-muted-foreground mt-1">
              Select a provider above — API key and model will be pre-filled.
              Use "Custom" for other OpenAI-compatible endpoints.
            </p>

            {/* Context Size */}
            <div className="mt-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">
                  Context Window
                </Label>
                <span className="text-xs text-muted-foreground">
                  {form.llm_context_size} sentences
                </span>
              </div>
              <input
                type="range"
                min={3}
                max={20}
                step={1}
                value={form.llm_context_size}
                onChange={(e) => update("llm_context_size", Number(e.target.value))}
                className="w-full h-1.5 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
              />
              <p className="text-[10px] text-muted-foreground">
                More context = better accuracy, but slower and more tokens
              </p>
            </div>

            {/* Formality Level */}
            <div className="mt-3 space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Formality
              </Label>
              <Select
                value={form.llm_formality}
                onValueChange={(v) => update("llm_formality", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">🔄 Auto (match source)</SelectItem>
                  <SelectItem value="formal">👔 Formal</SelectItem>
                  <SelectItem value="casual">💬 Casual</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                Controls politeness and style of translations
              </p>
            </div>
          </SettingsSection>
        )}
      </SettingsSection>

      {/* Language Pair */}
      <SettingsSection>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Source</Label>
            <Select
              value={form.source_language}
              onValueChange={(v) => update("source_language", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sourceLanguages.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Target</Label>
            <Select
              value={form.target_language}
              onValueChange={(v) => update("target_language", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {targetLanguages.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </SettingsSection>

      {/* Audio Source */}
      <SettingsSection>
        <Label className="text-xs text-muted-foreground">Audio Source</Label>
        <RadioGroup
          value={form.audio_source}
          onValueChange={(v) => update("audio_source", v)}
        >
          <RadioGroupItem value="system">System</RadioGroupItem>
          <RadioGroupItem value="microphone">Mic</RadioGroupItem>
          <RadioGroupItem value="both">Both</RadioGroupItem>
        </RadioGroup>
      </SettingsSection>

      {/* Context */}
      <SettingsSection>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Context</Label>
          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            Optional
          </span>
        </div>
        <Input
          value={form.context_domain}
          onChange={(e) => update("context_domain", e.target.value)}
          placeholder="e.g. Catholic sermon, Tech meeting..."
        />
        <div className="flex items-center justify-between mt-3">
          <span className="text-[11px] text-muted-foreground">
            Translation terms
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setTerms([...terms, { source: "", target: "" }])}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
        <div className="space-y-1.5 mt-1">
          {terms.map((term, i) => (
            <div key={i} className="flex gap-1.5 items-center">
              <Input
                value={term.source}
                onChange={(e) => {
                  const next = [...terms];
                  next[i] = { ...next[i], source: e.target.value };
                  setTerms(next);
                }}
                placeholder="Source"
                className="flex-1"
              />
              <Input
                value={term.target}
                onChange={(e) => {
                  const next = [...terms];
                  next[i] = { ...next[i], target: e.target.value };
                  setTerms(next);
                }}
                placeholder="Target"
                className="flex-1"
              />
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => setTerms(terms.filter((_, j) => j !== i))}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      </SettingsSection>
    </div>
  );
}

function LLMProviderSelect({
  form,
  update,
}: {
  form: FormData;
  update: Props["update"];
}) {
  return (
    <Select
      value={
        form.llm_base_url === "https://api.openai.com/v1"
          ? "openai"
          : form.llm_base_url === "https://api.groq.com/openai/v1"
            ? "groq"
            : form.llm_base_url ===
                "https://generativelanguage.googleapis.com/v1beta/openai"
              ? "gemini"
              : form.llm_base_url === "http://localhost:11434/v1"
                ? "ollama"
                : "custom"
      }
      onValueChange={(v) => {
        const providers: Record<string, { url: string; model: string }> = {
          openai: { url: "https://api.openai.com/v1", model: "gpt-4o-mini" },
          groq: {
            url: "https://api.groq.com/openai/v1",
            model: "llama-3.3-70b-versatile",
          },
          gemini: {
            url: "https://generativelanguage.googleapis.com/v1beta/openai",
            model: "gemini-2.0-flash",
          },
          ollama: { url: "http://localhost:11434/v1", model: "llama3" },
        };
        const p = providers[v];
        if (p) {
          update("llm_base_url", p.url);
          update("llm_model", p.model);
        } else {
          update("llm_base_url", "");
          update("llm_model", "");
        }
      }}
    >
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="openai">OpenAI</SelectItem>
        <SelectItem value="groq">Groq (Free)</SelectItem>
        <SelectItem value="gemini">Google Gemini (Free)</SelectItem>
        <SelectItem value="ollama">Ollama (Local)</SelectItem>
        <SelectItem value="custom">Custom</SelectItem>
      </SelectContent>
    </Select>
  );
}

function LLMModelSelect({
  form,
  update,
}: {
  form: FormData;
  update: Props["update"];
}) {
  const knownUrls = [
    "https://api.openai.com/v1",
    "https://api.groq.com/openai/v1",
    "https://generativelanguage.googleapis.com/v1beta/openai",
    "http://localhost:11434/v1",
  ];
  const isCustom = !knownUrls.includes(form.llm_base_url);
  const providerModels: Record<string, { value: string; label: string }[]> = {
    "https://api.openai.com/v1": [
      { value: "gpt-4o-mini", label: "GPT-4o Mini" },
      { value: "gpt-4o", label: "GPT-4o" },
      { value: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
      { value: "gpt-4.1", label: "GPT-4.1" },
      { value: "o4-mini", label: "o4 Mini" },
    ],
    "https://api.groq.com/openai/v1": [
      { value: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" },
      { value: "llama-3.1-8b-instant", label: "Llama 3.1 8B (Fast)" },
      { value: "gemma2-9b-it", label: "Gemma 2 9B" },
      { value: "mixtral-8x7b-32768", label: "Mixtral 8x7B" },
      { value: "openai/gpt-oss-120b", label: "GPT-OSS 120B" },
      { value: "whisper-large-v3", label: "Whisper Large V3" },
      { value: "whisper-large-v3-turbo", label: "Whisper Large V3 Turbo" },
    ],
    "https://generativelanguage.googleapis.com/v1beta/openai": [
      { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
      { value: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite" },
      { value: "gemini-2.5-flash-preview-05-20", label: "Gemini 2.5 Flash" },
      { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
    ],
    "http://localhost:11434/v1": [
      { value: "llama3", label: "Llama 3" },
      { value: "mistral", label: "Mistral" },
      { value: "gemma2", label: "Gemma 2" },
      { value: "qwen2.5", label: "Qwen 2.5" },
    ],
  };
  const models = providerModels[form.llm_base_url];

  return (
    <>
      {isCustom && (
        <>
          <Label className="text-xs text-muted-foreground mt-3">Base URL</Label>
          <Input
            value={form.llm_base_url}
            onChange={(e) => update("llm_base_url", e.target.value)}
            placeholder="https://api.example.com/v1"
          />
        </>
      )}

      <Label className="text-xs text-muted-foreground mt-3">Model</Label>
      {models ? (
        <Select
          value={
            models.some((m) => m.value === form.llm_model)
              ? form.llm_model
              : "__custom__"
          }
          onValueChange={(v) => {
            if (v !== "__custom__") update("llm_model", v);
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {models.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
            <SelectItem value="__custom__">Custom model...</SelectItem>
          </SelectContent>
        </Select>
      ) : (
        <Input
          value={form.llm_model}
          onChange={(e) => update("llm_model", e.target.value)}
          placeholder="model-name"
        />
      )}
      {models && !models.some((m) => m.value === form.llm_model) && (
        <Input
          className="mt-1.5"
          value={form.llm_model}
          onChange={(e) => update("llm_model", e.target.value)}
          placeholder="Enter custom model name"
        />
      )}
    </>
  );
}

function SettingsSection({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-2 p-3 rounded-lg border border-border/50 bg-card/30 hover:bg-card/50 transition-colors">
      {children}
    </div>
  );
}
