/**
 * Auto-updater module
 * Checks for updates on app launch using Tauri updater plugin
 */

class Updater {
   updateAvailable: TauriUpdate | null = null;
   onUpdateFound: ((version: string, notes: string) => void) | null = null;

   private _getCheck(): (() => Promise<TauriUpdate | null>) | undefined {
      try {
         return window.__TAURI__?.updater?.check;
      } catch {
         return undefined;
      }
   }

   async checkForUpdates(): Promise<void> {
      const check = this._getCheck();
      if (!check) {
         console.log('[Updater] Skipped — plugin not available');
         return;
      }

      try {
         console.log('[Updater] Checking for updates...');
         const update = await check();

         if (update) {
            console.log(`[Updater] Update found: v${update.version}`);
            this.updateAvailable = update;

            if (this.onUpdateFound) {
               this.onUpdateFound(update.version, update.body || '');
            }
         } else {
            console.log('[Updater] App is up to date');
         }
      } catch (err) {
         console.warn('[Updater] Check failed:', (err as Error).message || err);
      }
   }

   async downloadAndInstall(onProgress?: (downloaded: number, total: number) => void): Promise<void> {
      if (!this.updateAvailable) return;

      try {
         let downloaded = 0;
         let contentLength = 0;

         await this.updateAvailable.downloadAndInstall((event) => {
            switch (event.event) {
               case 'Started':
                  contentLength = event.data.contentLength || 0;
                  console.log(`[Updater] Downloading ${contentLength} bytes...`);
                  break;
               case 'Progress':
                  downloaded += event.data.chunkLength || 0;
                  if (onProgress) onProgress(downloaded, contentLength);
                  break;
               case 'Finished':
                  console.log('[Updater] Download complete');
                  break;
            }
         });

         console.log('[Updater] Update installed, restarting...');
      } catch (err) {
         console.error('[Updater] Install failed:', err);
         throw err;
      }
   }
}

export const updater = new Updater();
