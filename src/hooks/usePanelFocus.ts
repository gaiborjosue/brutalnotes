// Hook for managing panel focus mode

import { useState, useCallback, useEffect } from 'react'

type PanelType = 'todo' | 'files' | 'record' | null

export function usePanelFocus() {
  const [focusedPanel, setFocusedPanel] = useState<PanelType>(null)
  const [isCtrlPressed, setIsCtrlPressed] = useState(false)
  const [hoveredPanel, setHoveredPanel] = useState<PanelType>(null)

  // Track Ctrl key state
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey) {
        setIsCtrlPressed(true)
      }
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) {
        setIsCtrlPressed(false)
      }
    }

    const handleBlur = () => {
      setIsCtrlPressed(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleBlur)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleBlur)
    }
  }, [])

  const togglePanelFocus = useCallback((panel: PanelType) => {
    if (focusedPanel === panel) {
      setFocusedPanel(null) // Unfocus if already focused
    } else {
      setFocusedPanel(panel) // Focus the panel
    }
  }, [focusedPanel])

  const handlePanelHover = useCallback((panel: PanelType) => {
    if (isCtrlPressed) {
      setHoveredPanel(panel)
    }
  }, [isCtrlPressed])

  const handlePanelLeave = useCallback(() => {
    setHoveredPanel(null)
  }, [])

  const handlePanelClick = useCallback((panel: PanelType) => {
    if (isCtrlPressed) {
      togglePanelFocus(panel)
    }
  }, [isCtrlPressed, togglePanelFocus])

  return {
    focusedPanel,
    isCtrlPressed,
    hoveredPanel,
    handlePanelHover,
    handlePanelLeave,
    handlePanelClick,
    togglePanelFocus,
    isFocused: (panel: PanelType) => focusedPanel === panel,
    shouldShowTooltip: (panel: PanelType) => isCtrlPressed && hoveredPanel === panel,
  }
}
