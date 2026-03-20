import { useApp, type Segment } from '../store/app-store';
import { cn } from '@/lib/utils';
import { Mic, Volume2 } from 'lucide-react';

export default function TranscriptArea() {
   const { segments, provisionalText, provisionalSpeaker, showListening, fontSize, speakText } = useApp();

   const hasContent = segments.length > 0 || provisionalText || showListening;

   if (!hasContent) {
      return (
         <div
            className='flex flex-col items-center justify-center h-full gap-3 text-muted-foreground'
            data-tauri-drag-region
         >
            <Mic className='h-8 w-8 opacity-40' />
            <p className='text-sm font-normal'>Press ▶ to start translating</p>
            <kbd className='text-xs bg-muted px-2.5 py-1 rounded-md border border-border font-mono'>
               Ctrl + Enter
            </kbd>{' '}
            <kbd className='text-xs bg-muted px-2.5 py-1 rounded-md border border-border font-mono'>
               Ctrl + D — Compact mode
            </kbd>{' '}
         </div>
      );
   }

   let lastSpeaker: string | null = null;

   return (
      <div
         className='space-y-1'
         style={{ fontSize: `${fontSize}px`, lineHeight: 1.7 }}
      >
         {showListening && segments.length === 0 && !provisionalText && (
            <div className='flex flex-col items-center justify-center py-8 gap-4 text-muted-foreground animate-fade-in-up'>
               <ListeningWaves />
               <p className='text-xs font-medium tracking-wide'>Listening...</p>
            </div>
         )}

         {segments.map((seg, i) => {
            const showSpeaker = seg.speaker && seg.speaker !== lastSpeaker;
            if (seg.speaker) lastSpeaker = seg.speaker;

            return (
               <div key={seg.id}>
                  {showSpeaker && <SpeakerLabel speaker={seg.speaker!} />}
                  <SegmentBlock
                     seg={seg}
                     speakText={speakText}
                  />
               </div>
            );
         })}

         {provisionalText && (
            <div>
               {provisionalSpeaker && provisionalSpeaker !== lastSpeaker && (
                  <SpeakerLabel speaker={provisionalSpeaker} />
               )}
               <div className='px-2 py-1 rounded-md animate-seg-slide-in'>
                  <span className='text-muted-foreground italic'>{provisionalText}</span>
                  <span className='text-primary font-light animate-blink ml-0.5'>|</span>
               </div>
            </div>
         )}
      </div>
   );
}

function SegmentBlock({ seg, speakText }: { seg: Segment; speakText: (text: string, isOriginal?: boolean) => void }) {
   const isPending = seg.status === 'original';
   return (
      <div
         className={cn(
            'group/seg px-2 py-1 rounded-md border-l-2 transition-colors animate-seg-slide-in hover:bg-muted/30',
            isPending ? 'border-l-primary bg-primary/5' : 'border-l-transparent',
         )}
      >
         {seg.original && (
            <div className='flex items-start gap-1'>
               <div className='text-muted-foreground/60 text-[0.8em] mt-1 mb-0.5 flex-1 min-w-0'>{seg.original}</div>
               <button
                  onClick={() => speakText(seg.original, true)}
                  className='shrink-0 mt-1 p-0.5 rounded opacity-0 group-hover/seg:opacity-60 hover:opacity-100! hover:text-primary transition-opacity cursor-pointer'
                  title='Read original'
               >
                  <Volume2 className='h-3 w-3' />
               </button>
            </div>
         )}
         {seg.translation && (
            <div className='flex items-start gap-1'>
               <div className='text-foreground font-normal flex-1 min-w-0'>{seg.translation}</div>
               <button
                  onClick={() => speakText(seg.translation!, false)}
                  className='shrink-0 mt-0.5 p-0.5 rounded opacity-0 group-hover/seg:opacity-60 hover:opacity-100! hover:text-primary transition-opacity cursor-pointer'
                  title='Read translation'
               >
                  <Volume2 className='h-3.5 w-3.5' />
               </button>
            </div>
         )}
      </div>
   );
}

function SpeakerLabel({ speaker }: { speaker: string }) {
   return (
      <div className='flex items-center gap-1.5 text-chart-3 font-semibold text-[0.8em] tracking-wide mt-3 mb-1 pb-1 border-b border-chart-3/15'>
         <div className='w-1.5 h-1.5 rounded-full bg-current opacity-70' />
         Speaker {speaker}
      </div>
   );
}

function ListeningWaves() {
   return (
      <div className='flex items-center gap-[3px] h-8'>
         {[0, 0.15, 0.3, 0.45, 0.6].map((delay, i) => (
            <span
               key={i}
               className='block w-[3px] rounded-full bg-primary shadow-[0_0_4px_oklch(0.7830_0.0384_132.7370/0.3)] animate-wave'
               style={{ animationDelay: `${delay}s`, height: '8px' }}
            />
         ))}
      </div>
   );
}
