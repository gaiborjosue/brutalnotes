// Focus Tooltip Component

interface FocusTooltipProps {
  show: boolean
  isFocused: boolean
}

export function FocusTooltip({ show, isFocused }: FocusTooltipProps) {
  if (!show) return null

  return (
    <div className="absolute top-2 right-2 z-50 pointer-events-none">
      <div className="bg-black text-white px-2 py-1 rounded text-xs font-mono font-bold shadow-lg">
        {isFocused ? 'Click to unfocus' : 'Click to focus'}
      </div>
    </div>
  )
}
