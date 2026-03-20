# Realtime Translator

Desktop **real-time speech translator overlay** built with **Tauri 2 + React + TypeScript + Rust**.

It captures **system audio** or **microphone audio**, transcribes speech in real time, translates it to your target language, and can optionally read translations aloud with TTS.

---

## Features

- 🎧 **Real-time audio capture**
   - System audio (what your computer is playing)
   - Microphone input
- 🧠 **Speech-to-text modes**
   - Cloud STT via **Deepgram Nova-3**
   - Local STT via **MLX Whisper** (Apple Silicon, experimental)
- 🌐 **Translation engines**
   - **MyMemory** (free, no extra API key)
   - **LLM translation** (OpenAI-compatible API)
- 🗂️ **Context-aware translation**
   - Domain hints
   - Custom term pairs (glossary)
- 🔊 **TTS playback**
   - **Edge TTS** (free)
   - **ElevenLabs**
- 🪟 **Overlay-first UX**
   - Always-on-top window
   - Compact mode, pin/unpin, opacity control
   - Adjustable transcript font size and line limits
- 📝 **Auto transcript saving**
   - Saves markdown transcripts to app data folder

---

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, Radix UI
- **Desktop Runtime:** Tauri 2
- **Backend:** Rust (audio capture, settings persistence, translation commands)
- **Local Pipeline:** Python scripts for MLX setup and offline inference

---

## Prerequisites

Before running locally, install:

- **Node.js** (recommended: LTS)
- **Rust toolchain** (`rustup`, `cargo`)
- **Tauri prerequisites** for your OS

Official docs for Tauri prerequisites:
https://v2.tauri.app/start/prerequisites/

---

## Run in Development

```bash
npm install
npm run tauri dev
```

## Build App

```bash
npm run tauri build
```

---

## First-Time Setup

1. Open **Settings**.
2. Add your **Deepgram API key** (required for cloud STT mode).
3. Choose source and target languages.
4. Choose translation engine:
   - `mymemory` (free)
   - `llm` (requires LLM API key + base URL + model)
5. (Optional) Enable TTS and configure provider.

---

## Keyboard Shortcuts

> On macOS, use `Cmd` in place of `Ctrl`.

- `Ctrl + Enter` → Start/Stop capture
- `Ctrl + ,` → Open Settings
- `Ctrl + 1` → Switch to System Audio
- `Ctrl + 2` → Switch to Microphone
- `Ctrl + T` → Toggle TTS
- `Ctrl + P` → Pin/Unpin window
- `Ctrl + D` → Toggle compact mode
- `Esc` → Exit compact mode

---

## Documentation

- macOS install guide: `docs/installation_guide.md`
- Windows install guide: `docs/installation_guide_win.md`
- TTS guide: `docs/tts_guide.md`
- Implementation notes: `docs/03_implementation_plan.md`

---

## Project Structure

```text
tunxkit-translator/
├─ src-react/        # React UI (overlay, settings, controls)
├─ src-tauri/        # Rust backend (audio, commands, persistence)
├─ scripts/          # Local MLX pipeline + setup helpers
└─ docs/             # User and installation documentation
```

---

## License

This project is licensed under the terms of the [LICENSE](LICENSE) file.
