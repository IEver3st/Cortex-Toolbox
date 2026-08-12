import { AlertCircle, AlertTriangle, Check, Info, LoaderCircle } from 'lucide-react';
import { Toaster } from 'sonner';
import { usePreferences } from '../hooks/usePreferences';
import { useSystemColorMode } from '../lib/theme/system-color-mode';

export function CortexToaster(): React.JSX.Element {
  const preferences = usePreferences();
  const systemColorMode = useSystemColorMode();
  const colorMode = preferences.data?.colorMode;
  const theme: 'light' | 'dark' =
    colorMode === 'light' ? 'light' : colorMode === 'dark' ? 'dark' : systemColorMode;

  return (
    <Toaster
      theme={theme}
      position="bottom-right"
      className="cortex-toaster"
      offset={{ bottom: 18, right: 18 }}
      mobileOffset={{ bottom: 12, left: 12, right: 12 }}
      containerAriaLabel="Cortex notifications"
      toastOptions={{
        unstyled: true,
        className: 'cortex-toast',
      }}
      icons={{
        success: <Check aria-hidden="true" />,
        info: <Info aria-hidden="true" />,
        warning: <AlertTriangle aria-hidden="true" />,
        error: <AlertCircle aria-hidden="true" />,
        loading: <LoaderCircle className="cortex-toast-loader" aria-hidden="true" />,
      }}
    />
  );
}
