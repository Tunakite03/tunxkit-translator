import { useApp } from '../store/app-store';
import { useEffect, useCallback, useRef, useState, type MouseEvent } from 'react';
import ControlBar from './ControlBar';
import TranscriptArea from './TranscriptArea';
import { ArrowDown } from 'lucide-react';

export default function OverlayView() {
   const {
      isCompact,
      settings,
      appWindow,
      start,
      stop,
      isRunning,
      switchSource,
      toggleTTS,
      togglePin,
      toggleCompact,
      setView,
      segments,
      provisionalText,
   } = useApp();

   const opacity = settings?.overlay_opacity ?? 0.85;

   const scrollRef = useRef<HTMLDivElement>(null);
   const [autoScroll, setAutoScroll] = useState(true);
   const isUserScrolling = useRef(false);
   const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

   // Auto-scroll when new content arrives
   useEffect(() => {
      if (autoScroll && scrollRef.current) {
         scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
   }, [segments, provisionalText, autoScroll]);

   const handleScroll = useCallback(() => {
      const el = scrollRef.current;
      if (!el) return;
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      if (atBottom) {
         setAutoScroll(true);
      } else if (!isUserScrolling.current) {
         // programmatic scroll, ignore
      } else {
         setAutoScroll(false);
      }
   }, []);

   // Track user-initiated scrolls vs programmatic
   useEffect(() => {
      const el = scrollRef.current;
      if (!el) return;
      const onWheel = () => {
         isUserScrolling.current = true;
      };
      const onTouchStart = () => {
         isUserScrolling.current = true;
      };
      const onScrollEnd = () => {
         setTimeout(() => {
            isUserScrolling.current = false;
         }, 100);
      };
      el.addEventListener('wheel', onWheel, { passive: true });
      el.addEventListener('touchstart', onTouchStart, { passive: true });
      el.addEventListener('scrollend', onScrollEnd, { passive: true });
      // Fallback for browsers without scrollend
      const onScroll = () => {
         if (isUserScrolling.current) {
            if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
            scrollTimerRef.current = setTimeout(() => {
               isUserScrolling.current = false;
            }, 150);
         }
      };
      el.addEventListener('scroll', onScroll, { passive: true });
      return () => {
         el.removeEventListener('wheel', onWheel);
         el.removeEventListener('touchstart', onTouchStart);
         el.removeEventListener('scrollend', onScrollEnd);
         el.removeEventListener('scroll', onScroll);
         if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
      };
   }, []);

   const scrollToBottom = useCallback(() => {
      if (scrollRef.current) {
         scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
         setAutoScroll(true);
      }
   }, []);

   useEffect(() => {
      const handler = (e: KeyboardEvent) => {
         if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;

         if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            isRunning ? stop() : start();
         }
         if (e.key === 'Escape') {
            e.preventDefault();
            if (isCompact) toggleCompact();
         }
         if ((e.metaKey || e.ctrlKey) && e.key === ',') {
            e.preventDefault();
            setView('settings');
         }
         if ((e.metaKey || e.ctrlKey) && e.key === '1') {
            e.preventDefault();
            switchSource('system');
         }
         if ((e.metaKey || e.ctrlKey) && e.key === '2') {
            e.preventDefault();
            switchSource('microphone');
         }
         if ((e.metaKey || e.ctrlKey) && e.key === 't') {
            e.preventDefault();
            toggleTTS();
         }
         if ((e.metaKey || e.ctrlKey) && e.key === 'm') {
            e.preventDefault();
            appWindow.minimize();
         }
         if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
            e.preventDefault();
            togglePin();
         }
         if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
            e.preventDefault();
            toggleCompact();
         }
      };
      document.addEventListener('keydown', handler);
      return () => document.removeEventListener('keydown', handler);
   }, [isRunning, start, stop, switchSource, toggleTTS, togglePin, toggleCompact, setView, appWindow, isCompact]);

   const handleDrag = useCallback(
      (e: MouseEvent) => {
         if ((e.target as HTMLElement).closest('button, input, select, textarea, a')) return;
         if (e.buttons === 1) {
            e.preventDefault();
            appWindow.startDragging();
         }
      },
      [appWindow],
   );

   return (
      <div
         className='flex flex-col w-full h-full overflow-hidden'
         style={{ opacity }}
      >
         {!isCompact && <ControlBar />}

         <div className='flex-1 min-h-0 relative'>
            <div
               ref={scrollRef}
               className='h-full overflow-y-auto overflow-x-hidden px-4 py-3'
               onMouseDown={handleDrag}
               onScroll={handleScroll}
               data-tauri-drag-region
            >
               <TranscriptArea />
            </div>

            {!autoScroll && (
               <button
                  onClick={scrollToBottom}
                  className='absolute bottom-3 right-3 z-10 flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all animate-fade-in-up cursor-pointer'
                  title='Scroll to bottom'
               >
                  <ArrowDown className='h-4 w-4' />
               </button>
            )}
         </div>

         <div
            className='h-1.5 flex items-center justify-center cursor-ns-resize shrink-0'
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
         >
            <div className='w-10 h-0.75 rounded-full bg-muted-foreground/20 hover:bg-muted-foreground/40 transition-colors' />
         </div>
      </div>
   );
}
