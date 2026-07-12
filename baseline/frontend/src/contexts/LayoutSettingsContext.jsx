import PropTypes from 'prop-types';
import { createContext, useCallback, useEffect, useMemo } from 'react';

import defaults from 'config';
import { useLocalStorage } from 'hooks/useLocalStorage';

export const LayoutSettingsContext = createContext(undefined);

export function LayoutSettingsProvider({ children }) {
  const { state, setState, setField, resetState } = useLocalStorage('crm-baseline-layout-settings', defaults);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const nextTheme = state.themeMode === 'dark' ? 'dark' : 'light';

    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.style.colorScheme = nextTheme;
  }, [state.themeMode]);

  const setSidebarCollapsed = useCallback((isSidebarCollapsed) => setField('isSidebarCollapsed', isSidebarCollapsed), [setField]);

  const toggleSidebarCollapsed = useCallback(
    () => setState((previousState) => ({ ...previousState, isSidebarCollapsed: !previousState.isSidebarCollapsed })),
    [setState]
  );

  const setMobileSidebarOpen = useCallback((isMobileSidebarOpen) => setField('isMobileSidebarOpen', isMobileSidebarOpen), [setField]);

  const toggleMobileSidebar = useCallback(
    () =>
      setState((previousState) => ({
        ...previousState,
        isMobileSidebarOpen: !previousState.isMobileSidebarOpen
      })),
    [setState]
  );

  const setThemeMode = useCallback((themeMode) => setField('themeMode', themeMode), [setField]);
  const setLayoutMode = useCallback((layoutMode) => setField('layoutMode', layoutMode), [setField]);
  const setPresetColor = useCallback((presetColor) => setField('presetColor', presetColor), [setField]);
  const setFontFamily = useCallback((fontFamily) => setField('fontFamily', fontFamily), [setField]);

  const value = useMemo(
    () => ({
      state,
      setState,
      setField,
      resetState,
      setSidebarCollapsed,
      toggleSidebarCollapsed,
      setMobileSidebarOpen,
      toggleMobileSidebar,
      setThemeMode,
      setLayoutMode,
      setPresetColor,
      setFontFamily
    }),
    [
      resetState,
      setField,
      setFontFamily,
      setLayoutMode,
      setMobileSidebarOpen,
      setPresetColor,
      setSidebarCollapsed,
      setState,
      setThemeMode,
      state,
      toggleMobileSidebar,
      toggleSidebarCollapsed,
    ]
  );

  return <LayoutSettingsContext.Provider value={value}>{children}</LayoutSettingsContext.Provider>;
}

LayoutSettingsProvider.propTypes = { children: PropTypes.node };