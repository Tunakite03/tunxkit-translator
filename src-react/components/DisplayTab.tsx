import { Label } from './ui/label';
import { Slider } from './ui/slider';
import { Checkbox } from './ui/checkbox';
import { cn } from '@/lib/utils';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../hooks/use-theme';
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
