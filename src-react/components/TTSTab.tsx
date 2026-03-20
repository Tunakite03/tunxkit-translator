import { Label } from './ui/label';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Slider } from './ui/slider';
import { Checkbox } from './ui/checkbox';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select';
import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import type { FormData } from './SettingsView';

interface Props {
   form: FormData;
   update: <K extends keyof FormData>(key: K, value: FormData[K]) => void;
}

export default function TTSTab({ form, update }: Props) {
   const [showElevenLabsKey, setShowElevenLabsKey] = useState(false);

   return (
      <div className='space-y-5'>
         <SettingsSection>
            <div className='flex items-center gap-2'>
               <Checkbox
                  id='tts-enabled'
                  checked={form.tts_enabled}
                  onCheckedChange={(v) => update('tts_enabled', v as boolean)}
               />
               <Label
                  htmlFor='tts-enabled'
                  className='text-sm text-secondary-foreground cursor-pointer'
               >
                  Enable TTS narration
               </Label>
            </div>
         </SettingsSection>

         {form.tts_enabled && (
            <>
               <SettingsSection>
                  <Label className='text-xs text-muted-foreground'>Provider</Label>
                  <Select
                     value={form.tts_provider}
                     onValueChange={(v) => update('tts_provider', v)}
                  >
                     <SelectTrigger>
                        <SelectValue />
                     </SelectTrigger>
                     <SelectContent>
                        <SelectItem value='edge'>🎙️ Edge TTS — Free (Natural)</SelectItem>
                        <SelectItem value='elevenlabs'>✨ ElevenLabs — Premium</SelectItem>
                     </SelectContent>
                  </Select>
               </SettingsSection>

               {form.tts_provider === 'edge' && (
                  <SettingsSection>
                     <Label className='text-xs text-muted-foreground'>Voice</Label>
                     <Select
                        value={form.edge_tts_voice}
                        onValueChange={(v) => update('edge_tts_voice', v)}
                     >
                        <SelectTrigger>
                           <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                           <SelectItem value='vi-VN-HoaiMyNeural'>HoaiMy — Nữ 🇻🇳</SelectItem>
                           <SelectItem value='vi-VN-NamMinhNeural'>NamMinh — Nam 🇻🇳</SelectItem>
                           <SelectItem value='en-US-JennyNeural'>Jenny — Female 🇺🇸</SelectItem>
                           <SelectItem value='en-US-GuyNeural'>Guy — Male 🇺🇸</SelectItem>
                           <SelectItem value='ja-JP-NanamiNeural'>Nanami — 女性 🇯🇵</SelectItem>
                           <SelectItem value='ko-KR-SunHiNeural'>SunHi — 여성 🇰🇷</SelectItem>
                           <SelectItem value='zh-CN-XiaoxiaoNeural'>Xiaoxiao — 女声 🇨🇳</SelectItem>
                        </SelectContent>
                     </Select>
                     <SliderField
                        label='Speed'
                        value={form.edge_tts_speed}
                        min={-50}
                        max={100}
                        step={10}
                        display={`${form.edge_tts_speed >= 0 ? '+' : ''}${form.edge_tts_speed}%`}
                        onChange={(v) => update('edge_tts_speed', v)}
                     />
                     <p className='text-[11px] text-muted-foreground mt-1'>
                        Microsoft Edge voices — free, no API key needed
                     </p>
                  </SettingsSection>
               )}

               {form.tts_provider === 'elevenlabs' && (
                  <SettingsSection>
                     <Label className='text-xs text-muted-foreground'>ElevenLabs API Key</Label>
                     <div className='flex gap-1.5'>
                        <Input
                           type={showElevenLabsKey ? 'text' : 'password'}
                           value={form.elevenlabs_api_key}
                           onChange={(e) => update('elevenlabs_api_key', e.target.value)}
                           placeholder='Enter key...'
                           className='flex-1'
                        />
                        <Button
                           variant='ghost'
                           size='icon-sm'
                           onClick={() => setShowElevenLabsKey(!showElevenLabsKey)}
                        >
                           {showElevenLabsKey ? <EyeOff className='h-3.5 w-3.5' /> : <Eye className='h-3.5 w-3.5' />}
                        </Button>
                     </div>
                     <p className='text-[11px] text-muted-foreground mt-1'>
                        <a
                           href='#'
                           className='text-primary hover:underline'
                           onClick={(e) => {
                              e.preventDefault();
                              window.__TAURI__.opener.openUrl('https://elevenlabs.io/app/sign-up');
                           }}
                        >
                           elevenlabs.io
                        </a>{' '}
                        — Premium quality
                     </p>
                     <div className='mt-3 space-y-1.5'>
                        <Label className='text-xs text-muted-foreground'>Voice</Label>
                        <Select
                           value={form.tts_voice_id}
                           onValueChange={(v) => update('tts_voice_id', v)}
                        >
                           <SelectTrigger>
                              <SelectValue />
                           </SelectTrigger>
                           <SelectContent>
                              <SelectItem value='21m00Tcm4TlvDq8ikWAM'>Rachel — Female</SelectItem>
                              <SelectItem value='EXAVITQu4vr4xnSDxMaL'>Sarah — Female</SelectItem>
                              <SelectItem value='onwK4e9ZLuTAKqWW03F9'>Daniel — Male</SelectItem>
                              <SelectItem value='pNInz6obpgDQGcFmaJgB'>Adam — Male</SelectItem>
                           </SelectContent>
                        </Select>
                     </div>
                  </SettingsSection>
               )}
            </>
         )}
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
