import { useEffect, useState } from 'react';
import { useApp, type ToastData } from '../store/app-store';
import { cn } from '@/lib/utils';

export default function Toast() {
   const { toast } = useApp();
   const [visible, setVisible] = useState(false);
   const [current, setCurrent] = useState<ToastData | null>(null);

   useEffect(() => {
      if (!toast) return;
      setCurrent(toast);
      setVisible(true);

      const duration = toast.type === 'error' ? 5000 : 3000;
      const hideTimer = setTimeout(() => setVisible(false), duration);
      const removeTimer = setTimeout(() => setCurrent(null), duration + 350);

      return () => {
         clearTimeout(hideTimer);
         clearTimeout(removeTimer);
      };
   }, [toast]);

   if (!current) return null;

   const icons: Record<string, string> = { success: '✓', error: '✗', info: 'ⓘ' };
   const duration = current.type === 'error' ? 5000 : 3000;

   const typeStyles: Record<string, string> = {
      success: 'bg-chart-1/12 text-chart-1 border-chart-1/20',
      error: 'bg-destructive/12 text-destructive border-destructive/20',
      info: 'bg-primary/12 text-primary border-primary/20',
   };

   const progressColor: Record<string, string> = {
      success: 'bg-chart-1',
      error: 'bg-destructive',
      info: 'bg-primary',
   };

   return (
      <div
         className={cn(
            'fixed bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium border backdrop-blur-xl shadow-lg z-[1000] transition-all duration-300 overflow-hidden max-w-[90%]',
            typeStyles[current.type] || typeStyles.info,
            visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3 pointer-events-none',
         )}
      >
         <span className='text-sm shrink-0'>{icons[current.type] || ''}</span>
         <span className='flex-1'>{current.message}</span>
         {visible && (
            <div
               className={cn(
                  'absolute bottom-0 left-0 h-0.5 rounded-b-lg',
                  progressColor[current.type] || progressColor.info,
               )}
               style={{ animation: `toast-progress ${duration}ms linear forwards` }}
            />
         )}
      </div>
   );
}
