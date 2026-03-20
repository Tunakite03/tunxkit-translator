# Contributing to Tunxkit Translator

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing.

## Getting Started

### Prerequisites

- **Node.js** (LTS recommended)
- **Rust toolchain** (`rustup`, `cargo`)
- **Tauri v2 prerequisites** for your OS — see [Tauri docs](https://v2.tauri.app/start/prerequisites/)

### Local Development Setup

```bash
# Clone the repo
git clone https://github.com/Tunakite03/tunxkit-translator.git
cd tunxkit-translator

# Install frontend dependencies
npm install

# Run in development mode
npm run tauri dev
```

## How to Contribute

### Reporting Bugs

1. Check [existing issues](https://github.com/Tunakite03/tunxkit-translator/issues) first.
2. Use the **Bug Report** issue template.
3. Include steps to reproduce, expected vs actual behavior, and your OS/environment.

### Suggesting Features

1. Open an issue using the **Feature Request** template.
2. Describe the problem you're trying to solve and the proposed solution.

### Submitting Code Changes

1. **Fork** the repository and create a branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. Make your changes following the coding guidelines below.
3. Test your changes locally with `npm run tauri dev`.
4. **Commit** with a clear message (see commit conventions below).
5. **Push** to your fork and open a **Pull Request** against `main`.

## Coding Guidelines

### Frontend (React + TypeScript)

- Use TypeScript strict mode — avoid `any` types.
- Follow existing component patterns in `src-react/components/`.
- Use Radix UI primitives for UI components.
- Use Tailwind CSS for styling.

### Backend (Rust)

- Run `cargo fmt` before committing.
- Run `cargo clippy` and fix all warnings.
- Keep Tauri commands in `src-tauri/src/commands/`.

### General

- Keep PRs focused — one feature or fix per PR.
- Don't include unrelated formatting or refactoring changes.
- Add comments only where logic isn't self-evident.

## Commit Conventions

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new TTS provider support
fix: resolve audio capture crash on Windows
docs: update README setup instructions
chore: bump dependency versions
refactor: simplify translation queue logic
```

## Project Structure

```
src-react/          # React frontend (UI, services, store)
src-tauri/          # Rust backend (audio, commands, settings)
scripts/            # Python scripts for local ML pipeline
```

## Code of Conduct

Please read our [Code of Conduct](CODE_OF_CONDUCT.md) before contributing.

## Questions?

Open a [Discussion](https://github.com/Tunakite03/tunxkit-translator/discussions) or an issue if you need help.

---

Thank you for helping improve Tunxkit Translator!
