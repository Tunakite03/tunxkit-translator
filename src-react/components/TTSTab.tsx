import { Label } from './ui/label';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Slider } from './ui/slider';
import { Checkbox } from './ui/checkbox';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectGroup, SelectLabel } from './ui/select';
import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import type { FormData } from './SettingsView';

const EDGE_VOICES = [
   {
      group: '🇻🇳 Tiếng Việt',
      voices: [
         { value: 'vi-VN-HoaiMyNeural', label: 'HoaiMy — Nữ' },
         { value: 'vi-VN-NamMinhNeural', label: 'NamMinh — Nam' },
      ],
   },
   {
      group: '🇺🇸 English (US)',
      voices: [
         { value: 'en-US-JennyNeural', label: 'Jenny — Female' },
         { value: 'en-US-AriaNeural', label: 'Aria — Female' },
         { value: 'en-US-AnaNeural', label: 'Ana — Female (Young)' },
         { value: 'en-US-GuyNeural', label: 'Guy — Male' },
         { value: 'en-US-DavisNeural', label: 'Davis — Male' },
         { value: 'en-US-TonyNeural', label: 'Tony — Male' },
      ],
   },
   {
      group: '🇬🇧 English (UK)',
      voices: [
         { value: 'en-GB-SoniaNeural', label: 'Sonia — Female' },
         { value: 'en-GB-LibbyNeural', label: 'Libby — Female' },
         { value: 'en-GB-RyanNeural', label: 'Ryan — Male' },
      ],
   },
   {
      group: '🇯🇵 日本語',
      voices: [
         { value: 'ja-JP-NanamiNeural', label: 'Nanami — 女性' },
         { value: 'ja-JP-MayuNeural', label: 'Mayu — 女性' },
         { value: 'ja-JP-ShioriNeural', label: 'Shiori — 女性' },
         { value: 'ja-JP-KeitaNeural', label: 'Keita — 男性' },
         { value: 'ja-JP-DaichiNeural', label: 'Daichi — 男性' },
      ],
   },
   {
      group: '🇰🇷 한국어',
      voices: [
         { value: 'ko-KR-SunHiNeural', label: 'SunHi — 여성' },
         { value: 'ko-KR-YuJinNeural', label: 'YuJin — 여성' },
         { value: 'ko-KR-InJoonNeural', label: 'InJoon — 남성' },
      ],
   },
   {
      group: '🇨🇳 中文',
      voices: [
         { value: 'zh-CN-XiaoxiaoNeural', label: 'Xiaoxiao — 女声' },
         { value: 'zh-CN-XiaoyiNeural', label: 'Xiaoyi — 女声' },
         { value: 'zh-CN-YunjianNeural', label: 'Yunjian — 男声' },
         { value: 'zh-CN-YunxiNeural', label: 'Yunxi — 男声' },
         { value: 'zh-TW-HsiaoChenNeural', label: 'HsiaoChen — 女聲 (TW)' },
         { value: 'zh-TW-YunJheNeural', label: 'YunJhe — 男聲 (TW)' },
      ],
   },
   {
      group: '🇫🇷 Français',
      voices: [
         { value: 'fr-FR-DeniseNeural', label: 'Denise — Femme' },
         { value: 'fr-FR-EloiseNeural', label: 'Eloise — Femme' },
         { value: 'fr-FR-HenriNeural', label: 'Henri — Homme' },
      ],
   },
   {
      group: '🇩🇪 Deutsch',
      voices: [
         { value: 'de-DE-KatjaNeural', label: 'Katja — Weiblich' },
         { value: 'de-DE-AmalaNeural', label: 'Amala — Weiblich' },
         { value: 'de-DE-ConradNeural', label: 'Conrad — Männlich' },
      ],
   },
   {
      group: '🇪🇸 Español',
      voices: [
         { value: 'es-ES-ElviraNeural', label: 'Elvira — Femenina' },
         { value: 'es-MX-DaliaNeural', label: 'Dalia — Femenina (MX)' },
         { value: 'es-ES-AlvaroNeural', label: 'Alvaro — Masculina' },
      ],
   },
   {
      group: '🇹🇭 ไทย',
      voices: [
         { value: 'th-TH-PremwadeeNeural', label: 'Premwadee — หญิง' },
         { value: 'th-TH-NiwatNeural', label: 'Niwat — ชาย' },
      ],
   },
   {
      group: '🇮🇩 Bahasa Indonesia',
      voices: [
         { value: 'id-ID-GadisNeural', label: 'Gadis — Perempuan' },
         { value: 'id-ID-ArdiNeural', label: 'Ardi — Laki-laki' },
      ],
   },
   {
      group: '🇵🇹 Português',
      voices: [
         { value: 'pt-BR-FranciscaNeural', label: 'Francisca — Feminino (BR)' },
         { value: 'pt-BR-AntonioNeural', label: 'Antonio — Masculino (BR)' },
      ],
   },
   {
      group: '🇷🇺 Русский',
      voices: [
         { value: 'ru-RU-SvetlanaNeural', label: 'Svetlana — Женский' },
         { value: 'ru-RU-DmitryNeural', label: 'Dmitry — Мужской' },
      ],
   },
   {
      group: '🇮🇳 हिन्दी',
      voices: [
         { value: 'hi-IN-SwaraNeural', label: 'Swara — महिला' },
         { value: 'hi-IN-MadhurNeural', label: 'Madhur — पुरुष' },
      ],
   },
   {
      group: '🇮🇹 Italiano',
      voices: [
         { value: 'it-IT-ElsaNeural', label: 'Elsa — Femmina' },
         { value: 'it-IT-DiegoNeural', label: 'Diego — Maschio' },
      ],
   },
];

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
                     {EDGE_VOICES.map((group) => (
                        <SelectGroup key={group.group}>
                           <SelectLabel>{group.group}</SelectLabel>
                           {group.voices.map((v) => (
                              <SelectItem
                                 key={v.value}
                                 value={v.value}
                              >
                                 {v.label}
                              </SelectItem>
                           ))}
                        </SelectGroup>
                     ))}
                  </SelectContent>
               </Select>
               <SliderField
                  label='Speed'
                  value={form.edge_tts_speed}
                  min={-80}
                  max={100}
                  step={10}
                  display={`${form.edge_tts_speed >= 0 ? '+' : ''}${form.edge_tts_speed}%`}
                  onChange={(v) => update('edge_tts_speed', v)}
               />
               <p className='text-[11px] text-muted-foreground mt-1'>Microsoft Edge voices — free, no API key needed</p>
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
                        <SelectGroup>
                           <SelectLabel>Female</SelectLabel>
                           <SelectItem value='21m00Tcm4TlvDq8ikWAM'>Rachel — Calm</SelectItem>
                           <SelectItem value='EXAVITQu4vr4xnSDxMaL'>Sarah — Soft</SelectItem>
                           <SelectItem value='ThT5KcBeYPX3keUQqHPh'>Dorothy — Pleasant</SelectItem>
                           <SelectItem value='jBpfuIE2acCO8z3wKNLl'>Gigi — Childish</SelectItem>
                           <SelectItem value='MF3mGyEYCl7XYWbV9V6O'>Elli — Young</SelectItem>
                           <SelectItem value='XB0fDUnXU5powFXDhCwa'>Charlotte — Confident</SelectItem>
                           <SelectItem value='pFZP5JQG7iQjIQuC4Bku'>Lily — Warm</SelectItem>
                        </SelectGroup>
                        <SelectGroup>
                           <SelectLabel>Male</SelectLabel>
                           <SelectItem value='onwK4e9ZLuTAKqWW03F9'>Daniel — Deep</SelectItem>
                           <SelectItem value='pNInz6obpgDQGcFmaJgB'>Adam — Deep</SelectItem>
                           <SelectItem value='ErXwobaYiN019PkySvjV'>Antoni — Well-rounded</SelectItem>
                           <SelectItem value='VR6AewLTigWG4xSOukaG'>Arnold — Crisp</SelectItem>
                           <SelectItem value='yoZ06aMxZJJ28mfd3POQ'>Sam — Raspy</SelectItem>
                           <SelectItem value='TxGEqnHWrfWFTfGW9XjX'>Josh — Narrative</SelectItem>
                           <SelectItem value='ODq5zmih8GrVes37Dizd'>Patrick — Firm</SelectItem>
                        </SelectGroup>
                     </SelectContent>
                  </Select>
               </div>
            </SettingsSection>
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
