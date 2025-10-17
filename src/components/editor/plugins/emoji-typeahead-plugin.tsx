import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_CRITICAL,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  KEY_TAB_COMMAND,
} from "lexical"

import { cn } from "@/lib/utils"

import emojiData from "@emoji-mart/data/sets/15/native.json" assert { type: "json" }

type EmojiMartSkin = { unified: string; native: string }

type EmojiRecord = {
  shortcode: string
  emoji: string
  keywords: string[]
}

type EmojiLookupEntry = {
  matchable: string
  record: EmojiRecord
}

const TRIGGER = ":"
const MAX_RESULTS = 25

const normalizeShortcode = (value: string) => value.replace(/[_\s]+/g, "_").toLowerCase()

const dataset = emojiData as unknown as {
  emojis: Record<string, { id: string; name: string; keywords?: string[]; skins: EmojiMartSkin[]; version: number }>
  aliases: Record<string, string>
}

const aliasGroups = Object.entries(dataset.aliases ?? {}).reduce<Record<string, Set<string>>>((group, [alias, targetId]) => {
  if (!group[targetId]) {
    group[targetId] = new Set()
  }
  group[targetId].add(alias)
  return group
}, {})

const EMOJI_LOOKUP: EmojiLookupEntry[] = Object.entries(dataset.emojis).reduce(
  (accumulator, [id, entry]) => {
    const baseEmoji = entry.skins?.[0]?.native
    if (!baseEmoji) return accumulator

    const keywords = (entry.keywords ?? []).map((keyword) => keyword.toLowerCase())
    const rawShortcodes = [id, ...(aliasGroups[id] ? Array.from(aliasGroups[id]) : [])]
    const normalizedShortcodes = Array.from(new Set(rawShortcodes.map((shortcode) => normalizeShortcode(shortcode))))

    if (normalizedShortcodes.length === 0) {
      return accumulator
    }

    const preferredShortcode =
      normalizedShortcodes.find((code) => /[a-z]/i.test(code.replace(/_/g, ""))) ?? normalizedShortcodes[0]

    normalizedShortcodes.forEach((normalized) => {
      accumulator.push({
        matchable: normalized,
        record: {
          shortcode: preferredShortcode,
          emoji: baseEmoji,
          keywords,
        },
      })
    })

    return accumulator
  },
  [] as EmojiLookupEntry[]
)

const searchEmoji = (query: string) => {
  if (!query) return []

  const normalized = query.replace(/[^a-z0-9_+\-]+/gi, "").toLowerCase()
  return EMOJI_LOOKUP.reduce<
    Array<{
      record: EmojiRecord
      priority: number
      matchable: string
    }>
  >((accumulator, entry) => {
    const prefixMatch = entry.matchable.startsWith(normalized)
    const keywordMatch = !prefixMatch && entry.record.keywords.some((keyword) => keyword.includes(normalized))

    if (!prefixMatch && !keywordMatch) {
      return accumulator
    }

    let priority = 3
    if (prefixMatch) {
      if (entry.matchable === normalized) {
        priority = 0
      } else if (!entry.matchable.includes("_")) {
        priority = 1
      } else {
        priority = 2
      }
    }

    accumulator.push({
      record: entry.record,
      priority,
      matchable: entry.matchable,
    })

    return accumulator
  }, [])
    .sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority
      }

      if (a.matchable.length !== b.matchable.length) {
        return a.matchable.length - b.matchable.length
      }

      return a.matchable.localeCompare(b.matchable)
    })
    .slice(0, MAX_RESULTS)
    .map((entry) => entry.record)
}

type SuggestionPosition = { top: number; left: number } | null

const useTypeaheadState = () => {
  const [activeIndex, setActiveIndex] = useState(0)
  const [suggestions, setSuggestions] = useState<EmojiRecord[]>([])
  const [position, setPosition] = useState<SuggestionPosition>(null)
  const [tokenRange, setTokenRange] = useState<{
    nodeKey: string
    startOffset: number
    endOffset: number
  } | null>(null)

  const reset = useCallback(() => {
    setActiveIndex(0)
    setSuggestions([])
    setPosition(null)
    setTokenRange(null)
  }, [])

  return {
    activeIndex,
    setActiveIndex,
    suggestions,
    setSuggestions,
    position,
    setPosition,
    tokenRange,
    setTokenRange,
    reset,
  }
}

const getCaretCoordinates = (): SuggestionPosition => {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return null

  const range = selection.getRangeAt(0)
  const rects = range.getClientRects()
  const rect = rects[0]
  if (!rect) return null

  return {
    top: rect.bottom + window.scrollY,
    left: rect.left + window.scrollX,
  }
}

export function EmojiTypeaheadPlugin() {
  const [editor] = useLexicalComposerContext()
  const [portalElement, setPortalElement] = useState<HTMLElement | null>(null)

  const {
    activeIndex,
    setActiveIndex,
    suggestions,
    setSuggestions,
    position,
    setPosition,
    tokenRange,
    setTokenRange,
    reset,
  } = useTypeaheadState()

  const suggestionsRef = useRef<EmojiRecord[]>(suggestions)
  const activeIndexRef = useRef<number>(activeIndex)
  const tokenRangeRef = useRef<typeof tokenRange>(tokenRange)

  useEffect(() => {
    suggestionsRef.current = suggestions
  }, [suggestions])

  useEffect(() => {
    activeIndexRef.current = activeIndex
  }, [activeIndex])

  useEffect(() => {
    tokenRangeRef.current = tokenRange
  }, [tokenRange])

  useEffect(() => {
    if (typeof document !== "undefined") {
      setPortalElement(document.body)
    }
  }, [])

  const selectSuggestion = useCallback(
    (suggestion: EmojiRecord) => {
      const range = tokenRangeRef.current
      if (!range) {
        reset()
        return
      }

      editor.update(() => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) return

        const node = selection.anchor.getNode()
        if (!$isTextNode(node) || node.getKey() !== range.nodeKey) return

        const text = node.getTextContent()
        const before = text.slice(0, range.startOffset)
        const after = text.slice(range.endOffset)

        const replacement = `${suggestion.emoji} `
        node.setTextContent(before + replacement + after)

        const newOffset = range.startOffset + replacement.length
        selection.anchor.set(node.getKey(), newOffset, "text")
        selection.focus.set(node.getKey(), newOffset, "text")
      })

      reset()
    },
    [editor, reset]
  )

  const navigateSuggestions = useCallback(
    (direction: 1 | -1) => {
      const currentSuggestions = suggestionsRef.current
      if (currentSuggestions.length === 0) {
        return false
      }

      const nextIndex =
        (activeIndexRef.current + direction + currentSuggestions.length) % currentSuggestions.length
      activeIndexRef.current = nextIndex
      setActiveIndex(nextIndex)
      return true
    },
    [setActiveIndex]
  )

  const acceptCurrentSuggestion = useCallback(() => {
    const currentSuggestions = suggestionsRef.current
    if (currentSuggestions.length === 0) {
      return false
    }

    const suggestionIndex = activeIndexRef.current
    if (suggestionIndex < 0 || suggestionIndex >= currentSuggestions.length) {
      return false
    }

    const suggestion = currentSuggestions[suggestionIndex]
    if (!suggestion) {
      return false
    }

    selectSuggestion(suggestion)
    return true
  }, [selectSuggestion])

  const interceptEvent = useCallback((event: KeyboardEvent) => {
    event.preventDefault()
    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation()
    }
    if (typeof event.stopPropagation === "function") {
      event.stopPropagation()
    }
  }, [])

  useEffect(() => {
    const unregisterDown = editor.registerCommand(
      KEY_ARROW_DOWN_COMMAND,
      (event) => {
        if (suggestionsRef.current.length === 0) {
          return false
        }
        interceptEvent(event)
        navigateSuggestions(1)
        return true
      },
      COMMAND_PRIORITY_CRITICAL
    )

    const unregisterUp = editor.registerCommand(
      KEY_ARROW_UP_COMMAND,
      (event) => {
        if (suggestionsRef.current.length === 0) {
          return false
        }
        interceptEvent(event)
        navigateSuggestions(-1)
        return true
      },
      COMMAND_PRIORITY_CRITICAL
    )

    const unregisterEnter = editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event) => {
        if (suggestionsRef.current.length === 0) {
          return false
        }
        interceptEvent(event)
        return acceptCurrentSuggestion()
      },
      COMMAND_PRIORITY_CRITICAL
    )

    const unregisterTab = editor.registerCommand(
      KEY_TAB_COMMAND,
      (event) => {
        if (suggestionsRef.current.length === 0) {
          return false
        }
        interceptEvent(event)
        return acceptCurrentSuggestion()
      },
      COMMAND_PRIORITY_CRITICAL
    )

    return () => {
      unregisterDown()
      unregisterUp()
      unregisterEnter()
      unregisterTab()
    }
  }, [acceptCurrentSuggestion, editor, interceptEvent, navigateSuggestions])

  useEffect(() => {
    return editor.registerCommand(
      KEY_ESCAPE_COMMAND,
      (event) => {
        if (suggestionsRef.current.length === 0) return false
        event.preventDefault()
        reset()
        return true
      },
      COMMAND_PRIORITY_CRITICAL
    )
  }, [editor, reset])

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
          reset()
          return
        }

        const anchor = selection.anchor
        const anchorNode = anchor.getNode()
        if (!$isTextNode(anchorNode)) {
          reset()
          return
        }

        const anchorOffset = anchor.offset
        const textContent = anchorNode.getTextContent()
        const searchStart = textContent.lastIndexOf(TRIGGER, anchorOffset - 1)
        if (searchStart === -1) {
          reset()
          return
        }

        const query = textContent.slice(searchStart + 1, anchorOffset)
        if (query.length === 0 || /\s/.test(query)) {
          reset()
          return
        }

        const suggestions = searchEmoji(query)
        if (suggestions.length === 0) {
          reset()
          return
        }

        setSuggestions(suggestions)
        const clampedIndex = Math.min(activeIndexRef.current, suggestions.length - 1)
        activeIndexRef.current = clampedIndex
        setActiveIndex(clampedIndex)
        setTokenRange({
          nodeKey: anchorNode.getKey(),
          startOffset: searchStart,
          endOffset: anchorOffset,
        })

        setPosition(getCaretCoordinates())
      })
    })
  }, [editor, reset, setActiveIndex, setPosition, setSuggestions, setTokenRange])

  if (!portalElement || suggestions.length === 0 || !position) return null

  return createPortal(
    <div
      className="pointer-events-auto absolute z-50 min-w-[12rem] max-w-[20rem] overflow-hidden rounded-md border border-border bg-popover shadow-lg"
      style={
        position
          ? { top: position.top + 4, left: position.left, position: "absolute" }
          : undefined
      }
    >
      <ul className="flex max-h-64 flex-col overflow-auto p-1 text-sm">
        {suggestions.map((suggestion, index) => (
          <li
            key={`${suggestion.shortcode}-${index}`}
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-gray-100",
              activeIndex === index && "bg-gray-100"
            )}
            onMouseDown={(event) => {
              event.preventDefault()
              selectSuggestion(suggestion)
            }}
          >
            <span className="text-lg">{suggestion.emoji}</span>
            <span className="truncate font-mono text-xs text-muted-foreground">
              {TRIGGER}
              {suggestion.shortcode}
            </span>
          </li>
        ))}
      </ul>
    </div>,
    portalElement
  )
}


