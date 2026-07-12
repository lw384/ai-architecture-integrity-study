import { use } from 'react';

import { LayoutSettingsContext } from 'contexts/LayoutSettingsContext';

export default function useLayoutSettings() {
  const context = use(LayoutSettingsContext);

  if (!context) {
    throw new Error('useLayoutSettings must be used inside LayoutSettingsProvider');
  }

  return context;
}