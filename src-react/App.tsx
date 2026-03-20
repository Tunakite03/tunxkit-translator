import { AppProvider } from './store/app-store';
import OverlayView from './components/OverlayView';
import SettingsView from './components/SettingsView';
import Toast from './components/Toast';
import { useApp } from './store/app-store';
import { TitleBar } from './components/ControlBar';
import { TooltipProvider } from './components/ui/tooltip';
import { ThemeProvider } from './hooks/use-theme';

function AppContent() {
   const { view } = useApp();
   return (
      <div className='flex flex-col w-full h-full border border-border bg-background shadow-xl overflow-hidden'>
         <TitleBar />
         <div className='flex-1 min-h-0'>
            {view === 'overlay' && <OverlayView />}
            {view === 'settings' && <SettingsView />}
         </div>
         <Toast />
      </div>
   );
}

export default function App() {
   return (
      <ThemeProvider>
         <TooltipProvider delayDuration={300}>
            <AppProvider>
               <AppContent />
            </AppProvider>
         </TooltipProvider>
      </ThemeProvider>
   );
}
