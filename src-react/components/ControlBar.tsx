import { useApp } from '../store/app-store';
import { settingsManager } from '../services/settings';
import { Button } from './ui/button';
import { Separator } from './ui/separator';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';
import { cn } from '@/lib/utils';
import { useState, useEffect, useCallback } from 'react';
import {
   Settings,
   Play,
   Square,
   Volume2,
   Mic,
   MessageSquare,
   Trash2,
   Copy,
   FolderOpen,
   Download,
   Minimize2,
   Maximize2,
   Pin,
   PinOff,
   X,
   Minus,
   Maximize,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/* ─── Title Bar (always visible) ─── */
export function TitleBar() {
   const {
      status,
      statusText,
      recordingTime,
      isPinned,
      isCompact,
      togglePin,
      toggleCompact,
      isRunning,
      stop,
      saveTranscript,
      segments,
      appWindow,
   } = useApp();

   const [maximized, setMaximized] = useState(false);

   useEffect(() => {
      let unlisten: (() => void) | undefined;
      (async () => {
         setMaximized(await appWindow.isMaximized());
         unlisten = await appWindow.onResized(async () => {
            setMaximized(await appWindow.isMaximized());
         });
      })();
      return () => {
         unlisten?.();
      };
   }, [appWindow]);

   const handleMinimize = useCallback(async () => {
      await appWindow.minimize();
   }, [appWindow]);

   const handleMaximizeRestore = useCallback(async () => {
      await appWindow.toggleMaximize();
   }, [appWindow]);

   const handleClose = useCallback(async () => {
      if (segments.length > 0) await saveTranscript();
      await stop();
      await appWindow.close();
   }, [segments, saveTranscript, stop, appWindow]);

   const statusDotClass: Record<string, string> = {
      disconnected: 'bg-muted-foreground/50',
      connecting: 'bg-chart-3 animate-pulse-dot',
      connected: 'bg-chart-1 shadow-[0_0_6px_oklch(0.7459_0.1483_156.4499/0.4)]',
      error: 'bg-destructive shadow-[0_0_6px_oklch(0.4926_0.1864_26.2192/0.3)]',
   };

   return (
      <div
         className='flex items-center h-9 pl-3 pr-1 bg-card/90 border-b border-border/50 shrink-0'
         data-tauri-drag-region
      >
         {/* Status */}
         <div
            className='flex items-center gap-1.5 flex-1 pointer-events-none'
            data-tauri-drag-region
         >
            <div className={cn('w-2 h-2 rounded-full shrink-0 transition-colors', statusDotClass[status])} />
            <span className='text-[11px] font-medium text-muted-foreground tracking-wide'>{statusText}</span>
            {recordingTime && (
               <span className='text-[10px] font-semibold text-destructive tabular-nums ml-1'>{recordingTime}</span>
            )}
         </div>

         {/* Pin */}
         <ToolbarButton
            icon={isPinned ? Pin : PinOff}
            tooltip={isPinned ? 'Unpin' : 'Pin on top'}
            onClick={togglePin}
            active={isPinned}
         />

         {/* Window Controls */}
         <div className='flex items-center ml-1'>
            <WindowButton
               icon={isCompact ? Maximize2 : Minimize2}
               tooltip={isCompact ? 'Exit compact' : 'Compact mode'}
               onClick={toggleCompact}
            />
            <WindowButton
               icon={Minus}
               tooltip='Minimize'
               onClick={handleMinimize}
            />
            <WindowButton
               icon={maximized ? Minimize2 : Maximize}
               tooltip={maximized ? 'Restore' : 'Maximize'}
               onClick={handleMaximizeRestore}
            />
            <WindowButton
               icon={X}
               tooltip='Close'
               onClick={handleClose}
               destructive
            />
         </div>
      </div>
   );
}

/* ─── Toolbar / Navigation Bar ─── */
export default function ControlBar() {
   const {
      setView,
      isRunning,
      currentSource,
      ttsEnabled,
      recordingTime,
      start,
      stop,
      switchSource,
      toggleTTS,
      showToast,
      clearTranscript,
      getPlainText,
      saveTranscript,
      saveTranscriptAs,
      segments,
   } = useApp();

   const handleStartStop = async () => {
      if (isRunning) await stop();
      else await start();
   };

   const handleCopy = async () => {
      const text = getPlainText();
      if (text) {
         await navigator.clipboard.writeText(text);
         showToast('Copied to clipboard', 'success');
      } else {
         showToast('Nothing to copy', 'info');
      }
   };

   const handleClear = async () => {
      if (segments.length > 0) await saveTranscript();
      clearTranscript();
   };

   const handleOpenTranscripts = async () => {
      try {
         const s = settingsManager.get();
         const customPath = s.transcript_save_path || undefined;
         await window.__TAURI__.core.invoke('open_transcript_dir', { customPath });
      } catch (err) {
         showToast('Failed to open folder: ' + err, 'error');
      }
   };

   return (
      <div
         className='flex items-center h-10 px-2 gap-1.5 border-b border-border bg-card/60 shrink-0'
         style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
         {/* Settings */}
         <ToolbarButton
            icon={Settings}
            tooltip='Settings'
            onClick={() => setView('settings')}
         />

         <Separator
            orientation='vertical'
            className='h-5 mx-0.5'
         />

         {/* Source Buttons */}
         <div className='flex gap-0.5 bg-muted rounded-lg p-0.5'>
            <Button
               variant={currentSource === 'system' ? 'default' : 'ghost'}
               size='icon-sm'
               className={cn('gap-1 px-2 w-auto', currentSource === 'system' && 'bg-primary text-primary-foreground')}
               onClick={() => switchSource('system')}
            >
               <Volume2 className='h-3.5 w-3.5' />
               <span className='text-[9px] font-semibold uppercase tracking-wider'>System</span>
            </Button>
            <Button
               variant={currentSource === 'microphone' ? 'default' : 'ghost'}
               size='icon-sm'
               className={cn(
                  'gap-1 px-2 w-auto',
                  currentSource === 'microphone' && 'bg-primary text-primary-foreground',
               )}
               onClick={() => switchSource('microphone')}
            >
               <Mic className='h-3.5 w-3.5' />
               <span className='text-[9px] font-semibold uppercase tracking-wider'>Mic</span>
            </Button>
         </div>

         {/* Start/Stop */}
         <Tooltip>
            <TooltipTrigger asChild>
               <Button
                  size='icon'
                  className={cn(
                     'shrink-0',
                     isRunning
                        ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90 animate-record-pulse'
                        : 'bg-primary text-primary-foreground hover:bg-primary/90',
                  )}
                  onClick={handleStartStop}
               >
                  {isRunning ? <Square className='h-4 w-4' /> : <Play className='h-4 w-4' />}
               </Button>
            </TooltipTrigger>
            <TooltipContent>{isRunning ? 'Stop' : 'Start'} (Ctrl+Enter)</TooltipContent>
         </Tooltip>

         {/* TTS Toggle */}
         <Tooltip>
            <TooltipTrigger asChild>
               <Button
                  variant={ttsEnabled ? 'default' : 'outline'}
                  size='sm'
                  className={cn('gap-1 shrink-0', ttsEnabled && 'bg-primary text-primary-foreground')}
                  onClick={toggleTTS}
               >
                  <MessageSquare className='h-3.5 w-3.5' />
                  <span className='text-xs font-semibold tracking-wide'>TTS</span>
               </Button>
            </TooltipTrigger>
            <TooltipContent>Toggle TTS (Ctrl+T)</TooltipContent>
         </Tooltip>

         <div className='flex-1' />

         {/* Toolbar Actions */}
         <div className='flex items-center gap-0.5'>
            <ToolbarButton
               icon={Download}
               tooltip='Save transcript as...'
               onClick={saveTranscriptAs}
            />
            <ToolbarButton
               icon={Trash2}
               tooltip='Clear transcript'
               onClick={handleClear}
            />
            <ToolbarButton
               icon={Copy}
               tooltip='Copy transcript'
               onClick={handleCopy}
            />
            <ToolbarButton
               icon={FolderOpen}
               tooltip='Open saved transcripts'
               onClick={handleOpenTranscripts}
            />
         </div>
      </div>
   );
}

interface ToolbarButtonProps {
   icon: LucideIcon;
   tooltip: string;
   onClick: () => void;
   active?: boolean;
   destructive?: boolean;
}

function ToolbarButton({ icon: Icon, tooltip, onClick, active, destructive }: ToolbarButtonProps) {
   return (
      <Tooltip>
         <TooltipTrigger asChild>
            <Button
               variant='ghost'
               size='icon-sm'
               className={cn(
                  'text-muted-foreground hover:text-foreground',
                  active && 'text-primary',
                  destructive && 'hover:text-destructive hover:bg-destructive/10',
               )}
               onClick={onClick}
               style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
               <Icon className='h-3.5 w-3.5' />
            </Button>
         </TooltipTrigger>
         <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
   );
}

interface WindowButtonProps {
   icon: LucideIcon;
   tooltip: string;
   onClick: () => void;
   destructive?: boolean;
}

function WindowButton({ icon: Icon, tooltip, onClick, destructive }: WindowButtonProps) {
   return (
      <Tooltip>
         <TooltipTrigger asChild>
            <button
               className={cn(
                  'inline-flex items-center justify-center w-10 h-9 transition-colors',
                  'text-muted-foreground hover:bg-muted hover:text-foreground',
                  destructive && 'hover:bg-destructive hover:text-destructive-foreground',
               )}
               onClick={onClick}
               style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
               <Icon className='h-4 w-4' />
            </button>
         </TooltipTrigger>
         <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
   );
}
