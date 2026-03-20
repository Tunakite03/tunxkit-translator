import { Label } from './ui/label';
import { Slider } from './ui/slider';
import { Checkbox } from './ui/checkbox';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';
import { Sun, Moon, FolderOpen } from 'lucide-react';
import { useTheme } from '../hooks/use-theme';
import { open } from '@tauri-apps/plugin-dialog';
import type { FormData } from './SettingsView';

interface Props {
   form: FormData;
   update: <K extends keyof FormData>(key: K, value: FormData[K]) => void;
}

export default function DisplayTab({ form, update }: Props) {
   const { theme, setTheme } = useTheme();

   return (
      <div className='space-y-5'>
         <SettingsSection>
            <Label className='text-xs text-muted-foreground'>Theme</Label>
            <div className='flex gap-1 bg-muted rounded-lg p-1'>
               {[
                  { value: 'light' as const, icon: Sun, label: 'Light' },
                  { value: 'dark' as const, icon: Moon, label: 'Dark' },
               ].map(({ value, icon: Icon, label }) => (
                  <button
                     key={value}
                     onClick={() => setTheme(value)}
                     className={cn(
                        'flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all cursor-pointer',
                        theme === value
                           ? 'bg-background text-foreground shadow-xs'
                           : 'text-muted-foreground hover:text-foreground/80',
                     )}
                  >
                     <Icon className='h-3.5 w-3.5' />
                     {label}
                  </button>
               ))}
            </div>
         </SettingsSection>
         <SettingsSection>
            <SliderField
               label='Opacity'
               value={form.overlay_opacity}
               min={20}
               max={100}
               display={`${form.overlay_opacity}%`}
               onChange={(v) => update('overlay_opacity', v)}
            />
            <SliderField
               label='Font Size'
               value={form.font_size}
               min={12}
               max={140}
               display={`${form.font_size}px`}
               onChange={(v) => update('font_size', v)}
            />
            <SliderField
               label='Max Lines'
               value={form.max_lines}
               min={2}
               max={15}
               display={String(form.max_lines)}
               onChange={(v) => update('max_lines', v)}
            />
            <div className='flex items-center gap-2 mt-3'>
               <Checkbox
                  id='show-original'
                  checked={form.show_original}
                  onCheckedChange={(v) => update('show_original', v as boolean)}
               />
               <Label
                  htmlFor='show-original'
                  className='text-sm text-secondary-foreground cursor-pointer'
               >
                  Show original text
               </Label>
            </div>
         </SettingsSection>

         {/* Transcript Auto-save */}
         <SettingsSection>
            <Label className='text-xs text-muted-foreground'>Transcript</Label>
            <div className='flex items-center gap-2'>
               <Checkbox
                  id='auto-save-transcript'
                  checked={form.auto_save_transcript}
                  onCheckedChange={(v) => update('auto_save_transcript', v as boolean)}
               />
               <Label
                  htmlFor='auto-save-transcript'
                  className='text-sm text-secondary-foreground cursor-pointer'
               >
                  Auto-save on stop / clear / close
               </Label>
            </div>
            {form.auto_save_transcript && (
               <div className='space-y-1.5 mt-2'>
                  <Label className='text-xs text-muted-foreground'>Save path</Label>
                  <div className='flex gap-1.5'>
                     <Input
                        value={form.transcript_save_path}
                        onChange={(e) => update('transcript_save_path', e.target.value)}
                        placeholder='Default (app data folder)'
                        className='text-xs h-8 flex-1'
                     />
                     <Button
                        variant='outline'
                        size='icon-sm'
                        className='h-8 w-8 shrink-0'
                        onClick={async () => {
                           const selected = await open({
                              directory: true,
                              title: 'Choose transcript save folder',
                              defaultPath: form.transcript_save_path || undefined,
                           });
                           if (selected) update('transcript_save_path', selected);
                        }}
                     >
                        <FolderOpen className='h-3.5 w-3.5' />
                     </Button>
                  </div>
                  <p className='text-[10px] text-muted-foreground/70'>Leave empty to use default app data folder</p>
               </div>
            )}
         </SettingsSection>
      </div>
   );
}

function SettingsSection({ children }: { children: React.ReactNode }) {
   return (
      <div className='space-y-2 p-3 rounded-lg border border-border/50 bg-card/30 hover:bg-card/50 transition-colors'>
         {children}
      </div>
   );
}

function SliderField({
   label,
   value,
   min,
   max,
   step = 1,
   display,
   onChange,
}: {
   label: string;
   value: number;
   min: number;
   max: number;
   step?: number;
   display: string;
   onChange: (value: number) => void;
}) {
   return (
      <div className='flex items-center gap-3'>
         <Label className='text-xs text-muted-foreground min-w-[65px]'>{label}</Label>
         <Slider
            value={[value]}
            min={min}
            max={max}
            step={step}
            onValueChange={([v]) => onChange(v)}
            className='flex-1'
         />
         <span className='text-xs font-semibold text-secondary-foreground min-w-[36px] text-right tabular-nums'>
            {display}
         </span>
      </div>
   );
}
