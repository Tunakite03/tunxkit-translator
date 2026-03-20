/**
 * App store — centralized state management using React context.
 * Bridges service modules (settings, deepgram, TTS, audio) with React.
 */
import { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo, type ReactNode } from 'react';
import { settingsManager, type AppSettings } from '../services/settings';
import { deepgramClient, type ConnectionStatus } from '../services/deepgram';
import { assemblyAIClient } from '../services/assemblyai';
import { elevenLabsTTS } from '../services/elevenlabs-tts';
import { edgeTTSRust } from '../services/edge-tts';
import { audioPlayer } from '../services/audio-player';

const { invoke } = window.__TAURI__.core;
const { getCurrentWindow } = window.__TAURI__.window;

export type ViewType = 'overlay' | 'settings';
export type ToastType = 'success' | 'error' | 'info';

export interface ToastData {
   message: string;
   type: ToastType;
   id: number;
}

let _segmentIdCounter = 0;

export interface Segment {
   id: number;
   original: string;
   translation: string | null;
   status: 'original' | 'translated';
   speaker: string | null;
   createdAt?: number;
}

interface LocalPipelineData {
   type: 'ready' | 'result' | 'status' | 'done';
   original?: string;
   translated?: string;
   message?: string;
}

interface AppContextValue {
   // State
   view: ViewType;
   setView: (v: ViewType) => void;
   isRunning: boolean;
   status: ConnectionStatus;
   statusText: string;
   setStatusText: (text: string) => void;
   currentSource: string;
   ttsEnabled: boolean;
   isPinned: boolean;
   isCompact: boolean;
   settings: AppSettings | null;
   toast: ToastData | null;
   segments: Segment[];
   provisionalText: string;
   provisionalSpeaker: string | null;
   showListening: boolean;
   fontSize: number;
   maxChars: number;
   recordingTime: string;
   isAppleSilicon: boolean;

   // Actions
   start: () => Promise<void>;
   stop: () => Promise<void>;
   switchSource: (source: string) => Promise<void>;
   toggleTTS: () => void;
   togglePin: () => Promise<void>;
   toggleCompact: () => void;
   showToast: (message: string, type?: ToastType) => void;
   clearTranscript: () => void;
   getPlainText: () => string;
   saveTranscript: () => Promise<void>;
   saveSettings: (newSettings: Partial<AppSettings>) => Promise<void>;
   speakText: (text: string, isOriginal?: boolean) => void;
   appWindow: TauriAppWindow;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
   const ctx = useContext(AppContext);
   if (!ctx) throw new Error('useApp must be used within AppProvider');
   return ctx;
}

export function AppProvider({ children }: { children: ReactNode }) {
   const [view, setView] = useState<ViewType>('overlay');
   const [isRunning, setIsRunning] = useState(false);
   const [status, setStatus] = useState<ConnectionStatus>('disconnected');
   const [statusText, setStatusText] = useState('Ready');
   const [currentSource, setCurrentSource] = useState('system');
   const [ttsEnabled, setTtsEnabled] = useState(false);
   const [isPinned, setIsPinned] = useState(false);
   const [isCompact, setIsCompact] = useState(false);
   const [settings, setSettings] = useState<AppSettings | null>(null);
   const [toast, setToast] = useState<ToastData | null>(null);

   // Transcript state
   const [segments, setSegments] = useState<Segment[]>([]);
   const [provisionalText, setProvisionalText] = useState('');
   const [provisionalSpeaker, setProvisionalSpeaker] = useState<string | null>(null);
   const [showListening, setShowListening] = useState(false);
   const [fontSize, setFontSize] = useState(16);
   const [maxChars, setMaxChars] = useState(1200);

   const isStartingRef = useRef(false);
   const recordingStartRef = useRef<number | null>(null);
   const [recordingTime, setRecordingTime] = useState('');
   const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
   const appWindow = useRef(getCurrentWindow());
   const segmentsRef = useRef<Segment[]>([]);
   const [isAppleSilicon, setIsAppleSilicon] = useState(false);
   const localPipelineChannelRef = useRef<TauriChannel | null>(null);
   const localPipelineReadyRef = useRef(false);
   const translationModeRef = useRef('deepgram');
   const ttsEnabledRef = useRef(false);

   // Keep refs in sync
   useEffect(() => {
      segmentsRef.current = segments;
   }, [segments]);
   useEffect(() => {
      ttsEnabledRef.current = ttsEnabled;
   }, [ttsEnabled]);

   // ─── Toast helper ──────────────────────────────────────
   const showToast = useCallback((message: string, type: ToastType = 'success') => {
      setToast({ message, type, id: Date.now() });
   }, []);

   // ─── Status helpers ────────────────────────────────────
   const updateStatus = useCallback((s: ConnectionStatus) => {
      setStatus(s);
      const labels: Record<string, string> = {
         connecting: 'Connecting...',
         connected: 'Listening',
         disconnected: 'Ready',
         error: 'Error',
      };
      setStatusText(labels[s] || s);
   }, []);

   // ─── Recording timer ──────────────────────────────────
   const startTimer = useCallback(() => {
      if (!recordingStartRef.current) recordingStartRef.current = Date.now();
      timerRef.current = setInterval(() => {
         const elapsed = Date.now() - recordingStartRef.current!;
         const totalSec = Math.floor(elapsed / 1000);
         const min = Math.floor(totalSec / 60);
         const sec = totalSec % 60;
         setRecordingTime(`${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`);
      }, 1000);
   }, []);

   const stopTimer = useCallback(() => {
      if (timerRef.current) {
         clearInterval(timerRef.current);
         timerRef.current = null;
      }
      setRecordingTime('');
   }, []);

   // ─── Transcript helpers ────────────────────────────────
   const addOriginal = useCallback((text: string, speaker?: string | null) => {
      setShowListening(false);
      setSegments((prev) => {
         const next: Segment[] = [
            ...prev,
            {
               id: ++_segmentIdCounter,
               original: text,
               translation: null,
               status: 'original',
               speaker: speaker || null,
               createdAt: Date.now(),
            },
         ];
         const now = Date.now();
         // 60s timeout — generous enough for slow translation APIs
         return next.filter((s) => !(s.status === 'original' && s.createdAt && now - s.createdAt > 60000));
      });
   }, []);

   const addTranslation = useCallback((text: string) => {
      setSegments((prev) => {
         const next = [...prev];
         const idx = next.findIndex((s) => s.status === 'original');
         if (idx >= 0) {
            next[idx] = { ...next[idx], translation: text, status: 'translated' };
         } else {
            next.push({
               id: ++_segmentIdCounter,
               original: '',
               translation: text,
               status: 'translated',
               speaker: null,
            });
         }
         return next;
      });
   }, []);

   const clearTranscript = useCallback(() => {
      setSegments([]);
      setProvisionalText('');
      setProvisionalSpeaker(null);
      setShowListening(false);
      recordingStartRef.current = null;
   }, []);

   const getPlainText = useCallback(() => {
      const lines: string[] = [];
      for (const seg of segmentsRef.current) {
         if (seg.original) lines.push(seg.original);
         if (seg.translation) lines.push(seg.translation);
         if (seg.original || seg.translation) lines.push('');
      }
      return lines.join('\n').trim();
   }, []);

   const getFormattedContent = useCallback((metadata: Record<string, string> = {}) => {
      const segs = segmentsRef.current;
      if (segs.length === 0) return null;
      const lines: string[] = [];
      lines.push('---');
      lines.push(`date: ${new Date().toISOString()}`);
      if (metadata.model) lines.push(`model: ${metadata.model}`);
      if (metadata.sourceLang) lines.push(`source_language: ${metadata.sourceLang}`);
      if (metadata.targetLang) lines.push(`target_language: ${metadata.targetLang}`);
      if (metadata.duration) lines.push(`recording_duration: ${metadata.duration}`);
      if (metadata.audioSource) lines.push(`audio_source: ${metadata.audioSource}`);
      lines.push(`segments: ${segs.length}`);
      lines.push('---');
      lines.push('');
      for (const seg of segs) {
         if (seg.speaker) lines.push(`**Speaker ${seg.speaker}:**`);
         if (seg.original) lines.push(`> ${seg.original}`);
         if (seg.translation) lines.push(seg.translation);
         lines.push('');
      }
      return lines.join('\n').trim();
   }, []);

   // ─── TTS ───────────────────────────────────────────────
   const getActiveTTS = useCallback(() => {
      const s = settingsManager.get();
      const provider = s?.tts_provider || 'edge';
      if (provider === 'elevenlabs') return elevenLabsTTS;
      return edgeTTSRust;
   }, []);

   const configureTTS = useCallback((tts: typeof elevenLabsTTS | typeof edgeTTSRust, s: AppSettings) => {
      const provider = s.tts_provider || 'edge';
      if (provider === 'elevenlabs') {
         (tts as typeof elevenLabsTTS).configure({
            apiKey: s.elevenlabs_api_key,
            voiceId: s.tts_voice_id || '21m00Tcm4TlvDq8ikWAM',
         });
      } else {
         (tts as typeof edgeTTSRust).configure({
            voice: s.edge_tts_voice || 'vi-VN-HoaiMyNeural',
            speed: s.edge_tts_speed !== undefined ? s.edge_tts_speed : 20,
         });
      }
   }, []);

   const speakIfEnabled = useCallback(
      (text: string) => {
         if (ttsEnabledRef.current && text?.trim()) {
            getActiveTTS().speak(text);
         }
      },
      [getActiveTTS],
   );

   const speakText = useCallback(
      (text: string, isOriginal = false) => {
         if (!text?.trim()) return;

         const s = settingsManager.get();
         const provider = s.tts_provider || 'edge';

         if (provider === 'elevenlabs' && !s.elevenlabs_api_key) {
            showToast('Add ElevenLabs API key in Settings → TTS', 'error');
            return;
         }

         audioPlayer.stop();

         const tts = getActiveTTS();
         if (provider === 'edge') {
            const sourceLangVoiceMap: Record<string, string> = {
               en: 'en-US-JennyNeural',
               ja: 'ja-JP-NanamiNeural',
               ko: 'ko-KR-SunHiNeural',
               zh: 'zh-CN-XiaoxiaoNeural',
               vi: 'vi-VN-HoaiMyNeural',
               auto: 'en-US-JennyNeural',
            };
            const voice = isOriginal
               ? sourceLangVoiceMap[s.source_language] || 'en-US-JennyNeural'
               : s.edge_tts_voice || 'vi-VN-HoaiMyNeural';
            (tts as typeof edgeTTSRust).configure({
               voice,
               speed: s.edge_tts_speed !== undefined ? s.edge_tts_speed : 20,
            });
         } else {
            (tts as typeof elevenLabsTTS).configure({
               apiKey: s.elevenlabs_api_key,
               voiceId: s.tts_voice_id || '21m00Tcm4TlvDq8ikWAM',
            });
         }

         if (!tts.isConnected) tts.connect();
         audioPlayer.resume();
         tts.speak(text);
      },
      [getActiveTTS, showToast],
   );

   const toggleTTS = useCallback(() => {
      const s = settingsManager.get();
      const provider = s.tts_provider || 'edge';
      if (provider === 'elevenlabs' && !s.elevenlabs_api_key) {
         showToast('Add ElevenLabs API key in Settings → TTS', 'error');
         setView('settings');
         return;
      }
      setTtsEnabled((prev) => {
         const next = !prev;
         const tts = getActiveTTS();
         if (next) {
            configureTTS(tts, s);
            tts.connect();
            audioPlayer.resume();
            const label: Record<string, string> = { edge: 'Edge TTS (Free)', elevenlabs: 'ElevenLabs' };
            showToast(`TTS narration ON (${label[provider] || provider})`, 'success');
         } else {
            tts.disconnect();
            audioPlayer.stop();
            showToast('TTS narration OFF', 'success');
         }
         return next;
      });
   }, [getActiveTTS, configureTTS, showToast]);

   // ─── Source ────────────────────────────────────────────
   const switchSource = useCallback(
      async (source: string) => {
         setCurrentSource(source);
         showToast(`Source: ${source === 'system' ? 'System Audio' : 'Microphone'}`, 'success');
      },
      [showToast],
   );

   // ─── Save transcript ──────────────────────────────────
   const saveTranscript = useCallback(async () => {
      const segs = segmentsRef.current;
      if (segs.length === 0) return;
      const duration = recordingStartRef.current
         ? (() => {
              const ms = Date.now() - recordingStartRef.current!;
              const s = Math.floor(ms / 1000);
              return `${Math.floor(s / 60)}m ${s % 60}s`;
           })()
         : 'unknown';
      const s = settingsManager.get();
      const content = getFormattedContent({
         model:
            translationModeRef.current === 'deepgram'
               ? 'Deepgram Nova-3'
               : translationModeRef.current === 'assemblyai'
                 ? 'AssemblyAI'
                 : 'Local MLX Whisper',
         sourceLang: s.source_language || 'auto',
         targetLang: s.target_language || 'vi',
         duration,
         audioSource: currentSource,
      });
      if (!content) return;
      try {
         const path = await invoke<string>('save_transcript', { content });
         const filename = path.split('/').pop();
         showToast(`Saved: ${filename}`, 'success');
      } catch {
         showToast('Failed to save transcript', 'error');
      }
   }, [currentSource, getFormattedContent, showToast]);

   // ─── Start / Stop ─────────────────────────────────────
   const start = useCallback(async () => {
      if (isStartingRef.current) return;
      isStartingRef.current = true;
      try {
         const s = settingsManager.get();
         translationModeRef.current = s.translation_mode || 'deepgram';

         // Validate required API key based on provider
         const mode = translationModeRef.current;
         if (mode === 'deepgram' && !s.deepgram_api_key) {
            showToast('Deepgram API key is required. Add it in Settings.', 'error');
            setView('settings');
            return;
         }
         if (mode === 'assemblyai' && !s.assemblyai_api_key) {
            showToast('AssemblyAI API key is required. Add it in Settings.', 'error');
            setView('settings');
            return;
         }
         if ((s.translation_engine || 'mymemory') === 'llm' && !s.llm_api_key) {
            showToast('LLM API key is required for AI translation. Add it in Settings.', 'error');
            setView('settings');
            return;
         }

         setIsRunning(true);
         startTimer();
         setShowListening(true);

         if (translationModeRef.current === 'local') {
            await startLocalMode(s);
         } else if (translationModeRef.current === 'assemblyai') {
            await startAssemblyAIMode(s);
         } else {
            await startDeepgramMode(s);
         }

         if (ttsEnabledRef.current) {
            const tts = getActiveTTS();
            configureTTS(tts, s);
            tts.connect();
            audioPlayer.resume();
         }
      } catch (err) {
         console.error('[App] Start error:', err);
         showToast(`Error: ${err}`, 'error');
         setIsRunning(false);
         updateStatus('error');
         clearTranscript();
      } finally {
         isStartingRef.current = false;
      }
   }, [showToast, startTimer, getActiveTTS, configureTTS, updateStatus, clearTranscript]);

   const startDeepgramMode = useCallback(
      async (s: AppSettings) => {
         updateStatus('connecting');
         deepgramClient.connect({
            apiKey: s.deepgram_api_key,
            sourceLanguage: s.source_language,
            targetLanguage: s.target_language,
            translationEngine: s.translation_engine || 'mymemory',
            customContext: s.custom_context ?? undefined,
            llmApiKey: s.llm_api_key || '',
            llmBaseUrl: s.llm_base_url || 'https://api.openai.com/v1',
            llmModel: s.llm_model || 'gpt-4o-mini',
         });

         try {
            const channel = new window.__TAURI__.core.Channel();
            channel.onmessage = (pcmData: unknown) => {
               const bytes = new Uint8Array(pcmData as ArrayBuffer);
               deepgramClient.sendAudio(bytes.buffer as ArrayBuffer);
            };
            await invoke('start_capture', { source: currentSource, channel });
         } catch (err) {
            showToast(`Audio error: ${err}`, 'error');
            await stop();
         }
      },
      [currentSource, updateStatus, showToast],
   );

   const startAssemblyAIMode = useCallback(
      async (s: AppSettings) => {
         updateStatus('connecting');
         assemblyAIClient.connect({
            apiKey: s.assemblyai_api_key,
            sourceLanguage: s.source_language,
            targetLanguage: s.target_language,
            translationEngine: s.translation_engine || 'mymemory',
            customContext: s.custom_context ?? undefined,
            llmApiKey: s.llm_api_key || '',
            llmBaseUrl: s.llm_base_url || 'https://api.openai.com/v1',
            llmModel: s.llm_model || 'gpt-4o-mini',
         });

         try {
            const channel = new window.__TAURI__.core.Channel();
            let logCount = 0;
            channel.onmessage = (pcmData: unknown) => {
               if (logCount < 3) {
                  logCount++;
                  console.log(
                     '[AssemblyAI-Channel] type:',
                     typeof pcmData,
                     'isArray:',
                     Array.isArray(pcmData),
                     'isArrayBuffer:',
                     pcmData instanceof ArrayBuffer,
                     'constructor:',
                     (pcmData as object)?.constructor?.name,
                     'sample:',
                     Array.isArray(pcmData) ? (pcmData as number[]).slice(0, 10) : 'N/A',
                  );
               }
               const bytes = new Uint8Array(pcmData as ArrayBuffer);
               assemblyAIClient.sendAudio(bytes.buffer as ArrayBuffer);
            };
            await invoke('start_capture', { source: currentSource, channel });
         } catch (err) {
            showToast(`Audio error: ${err}`, 'error');
            await stop();
         }
      },
      [currentSource, updateStatus, showToast],
   );

   const startLocalMode = useCallback(
      async (s: AppSettings) => {
         updateStatus('connecting');
         try {
            await invoke('start_capture', { source: currentSource, channel: new window.__TAURI__.core.Channel() });
            await invoke('stop_capture');
         } catch (err) {
            showToast(`Audio permission required: ${err}`, 'error');
            setIsRunning(false);
            updateStatus('error');
            return;
         }

         try {
            localPipelineChannelRef.current = new window.__TAURI__.core.Channel();
            localPipelineReadyRef.current = false;

            localPipelineChannelRef.current.onmessage = (msg: unknown) => {
               let data: LocalPipelineData;
               try {
                  data = typeof msg === 'string' ? JSON.parse(msg) : (msg as LocalPipelineData);
               } catch {
                  return;
               }
               handleLocalPipelineResult(data);
            };

            const sourceLangMap: Record<string, string> = {
               auto: 'auto',
               ja: 'Japanese',
               en: 'English',
               zh: 'Chinese',
               ko: 'Korean',
               vi: 'Vietnamese',
            };
            await invoke('start_local_pipeline', {
               sourceLang: sourceLangMap[s.source_language] || 'Japanese',
               targetLang: s.target_language || 'vi',
               channel: localPipelineChannelRef.current,
            });
         } catch (err) {
            showToast(`Pipeline error: ${err}`, 'error');
            await stop();
            return;
         }

         try {
            const audioChannel = new window.__TAURI__.core.Channel();
            audioChannel.onmessage = async (pcmData: unknown) => {
               try {
                  await invoke('send_audio_to_pipeline', { data: Array.from(new Uint8Array(pcmData as ArrayBuffer)) });
               } catch {}
            };
            await invoke('start_capture', { source: currentSource, channel: audioChannel });
         } catch (err) {
            showToast(`Audio: ${err}. Pipeline still loading...`, 'error');
         }
      },
      [currentSource, updateStatus, showToast],
   );

   const handleLocalPipelineResult = useCallback(
      (data: LocalPipelineData) => {
         switch (data.type) {
            case 'ready':
               localPipelineReadyRef.current = true;
               updateStatus('connected');
               setShowListening(true);
               showToast('Local models ready!', 'success');
               break;
            case 'result':
               if (data.original) addOriginal(data.original);
               setTimeout(() => {
                  if (data.translated) {
                     addTranslation(data.translated);
                     speakIfEnabled(data.translated);
                  }
               }, 80);
               break;
            case 'status':
               setStatusText(data.message?.replace(/^\[pipeline\]\s*/, '') || 'Loading...');
               break;
            case 'done':
               updateStatus('disconnected');
               break;
         }
      },
      [updateStatus, showToast, addOriginal, addTranslation, speakIfEnabled],
   );

   const stop = useCallback(async () => {
      setIsRunning(false);
      stopTimer();

      try {
         await invoke('stop_capture');
      } catch {}

      if (translationModeRef.current === 'local') {
         try {
            await invoke('stop_local_pipeline');
         } catch {}
         localPipelineReadyRef.current = false;
         updateStatus('disconnected');
      } else if (translationModeRef.current === 'assemblyai') {
         assemblyAIClient.disconnect();
      } else {
         deepgramClient.disconnect();
      }

      setProvisionalText('');
      elevenLabsTTS.disconnect();
      edgeTTSRust.disconnect();
      audioPlayer.stop();

      if (segmentsRef.current.length > 0) await saveTranscript();
   }, [stopTimer, updateStatus, saveTranscript]);

   // ─── Pin / Compact ────────────────────────────────────
   const togglePin = useCallback(async () => {
      const next = !isPinned;
      setIsPinned(next);
      await appWindow.current.setAlwaysOnTop(next);
      showToast(next ? 'Pinned on top' : 'Unpinned', 'success');
   }, [isPinned, showToast]);

   const toggleCompact = useCallback(() => {
      setIsCompact((p) => !p);
   }, []);

   // ─── Initialize ────────────────────────────────────────
   useEffect(() => {
      let mounted = true;

      async function init() {
         await settingsManager.load();
         const s = settingsManager.get();
         if (mounted) {
            setSettings(s);
            setCurrentSource(s.audio_source === 'both' ? 'system' : s.audio_source || 'system');
            setFontSize(s.font_size || 16);
            setMaxChars((s.max_lines || 5) * 160);
            const provider = s.tts_provider || 'edge';
            const needsKey = provider === 'elevenlabs' && !s.elevenlabs_api_key;
            setTtsEnabled(needsKey ? false : !!s.tts_enabled);
         }

         try {
            const arch = await invoke<string>('get_platform_info');
            const info = JSON.parse(arch);
            if (mounted) setIsAppleSilicon(info.os === 'macos' && info.arch === 'aarch64');
         } catch {
            if (mounted) setIsAppleSilicon(false);
         }

         audioPlayer.init();

         for (const tts of [elevenLabsTTS, edgeTTSRust]) {
            tts.onAudioChunk = (base64Audio: string) => {
               audioPlayer.enqueue(base64Audio);
            };
            tts.onError = (error: string) => {
               if (mounted) showToast(error, 'error');
            };
         }

         deepgramClient.onOriginal = (text: string, speaker: string | null) => {
            if (mounted) addOriginal(text, speaker);
         };
         deepgramClient.onTranslation = (text: string) => {
            if (mounted) {
               addTranslation(text);
               speakIfEnabled(text);
            }
         };
         deepgramClient.onProvisional = (text: string, speaker: string | null) => {
            if (mounted) {
               setShowListening(false);
               setProvisionalText(text || '');
               setProvisionalSpeaker(speaker || null);
            }
         };
         deepgramClient.onStatusChange = (s: string) => {
            if (mounted) updateStatus(s as ConnectionStatus);
         };
         deepgramClient.onError = (error: string) => {
            if (mounted) showToast(error, 'error');
         };

         // AssemblyAI callbacks
         assemblyAIClient.onOriginal = (text: string, speaker: string | null) => {
            if (mounted) addOriginal(text, speaker);
         };
         assemblyAIClient.onTranslation = (text: string) => {
            if (mounted) {
               addTranslation(text);
               speakIfEnabled(text);
            }
         };
         assemblyAIClient.onProvisional = (text: string, speaker: string | null) => {
            if (mounted) {
               setShowListening(false);
               setProvisionalText(text || '');
               setProvisionalSpeaker(speaker || null);
            }
         };
         assemblyAIClient.onStatusChange = (s: string) => {
            if (mounted) updateStatus(s as ConnectionStatus);
         };
         assemblyAIClient.onError = (error: string) => {
            if (mounted) showToast(error, 'error');
         };

         console.log('Personal Translator v0.4.0 (React) initialized');
      }

      init();
      return () => {
         mounted = false;
      };
   }, []); // eslint-disable-line react-hooks/exhaustive-deps

   // ─── Settings save ─────────────────────────────────────
   const handleSaveSettings = useCallback(
      async (newSettings: Partial<AppSettings>) => {
         try {
            await settingsManager.save(newSettings);
            const merged = settingsManager.get();
            setSettings(merged);
            setFontSize(merged.font_size || 16);
            setMaxChars((merged.max_lines || 5) * 160);
            setCurrentSource(merged.audio_source === 'both' ? 'system' : merged.audio_source || 'system');
            const provider = merged.tts_provider || 'edge';
            const needsKey = provider === 'elevenlabs' && !merged.elevenlabs_api_key;
            setTtsEnabled(needsKey ? false : !!merged.tts_enabled);
            showToast('Settings saved', 'success');
            setView('overlay');
         } catch (err) {
            showToast(`Failed to save: ${err}`, 'error');
         }
      },
      [showToast],
   );

   const value: AppContextValue = useMemo(
      () => ({
         view,
         setView,
         isRunning,
         status,
         statusText,
         setStatusText,
         currentSource,
         ttsEnabled,
         isPinned,
         isCompact,
         settings,
         toast,
         segments,
         provisionalText,
         provisionalSpeaker,
         showListening,
         fontSize,
         maxChars,
         recordingTime,
         isAppleSilicon,

         start,
         stop,
         switchSource,
         toggleTTS,
         togglePin,
         toggleCompact,
         showToast,
         clearTranscript,
         getPlainText,
         saveTranscript,
         saveSettings: handleSaveSettings,
         speakText,
         appWindow: appWindow.current,
      }),
      [
         view,
         isRunning,
         status,
         statusText,
         currentSource,
         ttsEnabled,
         isPinned,
         isCompact,
         settings,
         toast,
         segments,
         provisionalText,
         provisionalSpeaker,
         showListening,
         fontSize,
         maxChars,
         recordingTime,
         isAppleSilicon,
         start,
         stop,
         switchSource,
         toggleTTS,
         togglePin,
         toggleCompact,
         showToast,
         clearTranscript,
         getPlainText,
         saveTranscript,
         handleSaveSettings,
         speakText,
      ],
   );

   return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
