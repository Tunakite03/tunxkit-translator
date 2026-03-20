/// <reference types="vite/client" />

// Tauri global types
interface TauriCore {
   invoke: <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
   Channel: new () => TauriChannel;
}

interface TauriChannel {
   onmessage: ((data: unknown) => void) | null;
}

interface TauriWindow {
   getCurrentWindow: () => TauriAppWindow;
}

interface TauriAppWindow {
   setAlwaysOnTop: (alwaysOnTop: boolean) => Promise<void>;
   startDragging: () => Promise<void>;
   minimize: () => Promise<void>;
   toggleMaximize: () => Promise<void>;
   isMaximized: () => Promise<boolean>;
   close: () => Promise<void>;
   onResized: (handler: () => void) => Promise<(() => void) | undefined>;
}

interface TauriOpener {
   openUrl: (url: string) => Promise<void>;
}

interface TauriUpdater {
   check: (() => Promise<TauriUpdate | null>) | undefined;
}

interface TauriUpdate {
   version: string;
   body?: string;
   downloadAndInstall: (handler: (event: TauriUpdateEvent) => void) => Promise<void>;
}

interface TauriUpdateEvent {
   event: 'Started' | 'Progress' | 'Finished';
   data: {
      contentLength?: number;
      chunkLength?: number;
   };
}

interface Window {
   __TAURI__: {
      core: TauriCore;
      window: TauriWindow;
      opener: TauriOpener;
      updater?: TauriUpdater;
   };
}
