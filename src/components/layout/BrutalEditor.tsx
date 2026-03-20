"use client"

import { useState, useEffect, useRef, useCallback, type MutableRefObject } from "react"
import {
  type InitialConfigType,
  LexicalComposer,
} from "@lexical/react/LexicalComposer"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary"
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin"
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin"
import { TablePlugin } from "@lexical/react/LexicalTablePlugin"
import { HeadingNode, QuoteNode } from "@lexical/rich-text"
import { ParagraphNode, TextNode, type SerializedEditorState, $getRoot, $createParagraphNode, $createTextNode } from "lexical"
import { ListItemNode, ListNode } from "@lexical/list"
import { TableCellNode, TableNode, TableRowNode } from "@lexical/table"
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin"
import { CodeHighlightNode, CodeNode } from "@lexical/code"
import { AutoLinkNode, LinkNode } from "@lexical/link"
import {
  CHECK_LIST,
  ELEMENT_TRANSFORMERS,
  MULTILINE_ELEMENT_TRANSFORMERS,
  TEXT_FORMAT_TRANSFORMERS,
  TEXT_MATCH_TRANSFORMERS,
  $convertFromMarkdownString,
  TRANSFORMERS,
} from "@lexical/markdown"
import { CheckListPlugin } from "@lexical/react/LexicalCheckListPlugin"
import { HorizontalRuleNode } from "@lexical/react/LexicalHorizontalRuleNode"
import { HorizontalRulePlugin } from "@lexical/react/LexicalHorizontalRulePlugin"
import { ListPlugin } from "@lexical/react/LexicalListPlugin"
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin"
import { TabIndentationPlugin } from "@lexical/react/LexicalTabIndentationPlugin"
import { ClearEditorPlugin } from "@lexical/react/LexicalClearEditorPlugin"

import { CollapsibleContainerNode } from "@/components/editor/nodes/collapsible-container-node"
import { CollapsibleContentNode } from "@/components/editor/nodes/collapsible-content-node" 
import { CollapsibleTitleNode } from "@/components/editor/nodes/collapsible-title-node"
import { ExcalidrawNode } from "@/components/editor/nodes/excalidraw-node"
import { EquationNode } from "@/components/editor/nodes/equation-node"
import { ImageNode } from "@/components/editor/nodes/image-node"
import { PageBreakNode } from "@/components/editor/nodes/page-break-node"
import { CollapsiblePlugin } from "@/components/editor/plugins/collapsible-plugin"
import { ExcalidrawPlugin } from "@/components/editor/plugins/excalidraw-plugin"
import { ImagesPlugin } from "@/components/editor/plugins/images-plugin"
import { PageBreakPlugin } from "@/components/editor/plugins/page-break-plugin"
import { TableActionMenuPlugin } from "@/components/editor/plugins/table-action-menu-plugin"
import { TableCellResizerPlugin } from "@/components/editor/plugins/table-cell-resizer-plugin"
import { TableHoverActionsPlugin } from "@/components/editor/plugins/table-hover-actions-plugin"
import { EquationsPlugin } from "@/components/editor/plugins/equations-plugin"
import { EmojiTypeaheadPlugin } from "@/components/editor/plugins/emoji-typeahead-plugin"
import { ContentEditable } from "@/components/editor/editor-ui/content-editable"
import { ToolbarPlugin } from "@/components/editor/plugins/toolbar/toolbar-plugin"
import { HistoryToolbarPlugin } from "@/components/editor/plugins/toolbar/history-toolbar-plugin"
import { FontFormatToolbarPlugin } from "@/components/editor/plugins/toolbar/font-format-toolbar-plugin"
import { ElementFormatToolbarPlugin } from "@/components/editor/plugins/toolbar/element-format-toolbar-plugin"
import { FontColorToolbarPlugin } from "@/components/editor/plugins/toolbar/font-color-toolbar-plugin"
import { FontBackgroundToolbarPlugin } from "@/components/editor/plugins/toolbar/font-background-toolbar-plugin"
import { FontSizeToolbarPlugin } from "@/components/editor/plugins/toolbar/font-size-toolbar-plugin"
import { CodeLanguageToolbarPlugin } from "@/components/editor/plugins/toolbar/code-language-toolbar-plugin"
import { AssistancePlugin } from "@/components/editor/plugins/toolbar/assistance-plugin"
import { AIDetectionPanel } from "@/components/editor/ai-detection-panel"

import type { AIDetectionResponse } from "@/lib/ai-detection-service"
import { BlockFormatDropDown } from "@/components/editor/plugins/toolbar/block-format-toolbar-plugin"
import { FormatBulletedList } from "@/components/editor/plugins/toolbar/block-format/format-bulleted-list"
import { FormatCheckList } from "@/components/editor/plugins/toolbar/block-format/format-check-list"
import { FormatCodeBlock } from "@/components/editor/plugins/toolbar/block-format/format-code-block"
import { FormatHeading } from "@/components/editor/plugins/toolbar/block-format/format-heading"
import { FormatNumberedList } from "@/components/editor/plugins/toolbar/block-format/format-numbered-list"
import { FormatParagraph } from "@/components/editor/plugins/toolbar/block-format/format-paragraph"
import { FormatQuote } from "@/components/editor/plugins/toolbar/block-format/format-quote"
import { BlockInsertPlugin } from "@/components/editor/plugins/toolbar/block-insert-plugin"
import { InsertCollapsibleContainer } from "@/components/editor/plugins/toolbar/block-insert/insert-collapsible-container"
import { InsertEquation } from "@/components/editor/plugins/toolbar/block-insert/insert-equation"
import { InsertExcalidraw } from "@/components/editor/plugins/toolbar/block-insert/insert-excalidraw"
import { InsertImage } from "@/components/editor/plugins/toolbar/block-insert/insert-image"
import { InsertTable } from "@/components/editor/plugins/toolbar/block-insert/insert-table"
import { InsertPageBreak } from "@/components/editor/plugins/toolbar/block-insert/insert-page-break"
import { ActionsPlugin } from "@/components/editor/plugins/actions/actions-plugin"
import { ClearEditorActionPlugin } from "@/components/editor/plugins/actions/clear-editor-plugin"
import { ShareNotePlugin } from "@/components/editor/plugins/actions/share-note-plugin"
import { CounterCharacterPlugin } from "@/components/editor/plugins/actions/counter-character-plugin"
import { ImportExportPlugin } from "@/components/editor/plugins/actions/import-export-plugin"
import { SaveFilePlugin } from "@/components/editor/plugins/actions/save-file-plugin"
import { SaveShortcutPlugin } from "@/components/editor/plugins/actions/save-shortcut-plugin"
import { UnsavedChangesPlugin } from "@/components/editor/plugins/actions/unsaved-changes-plugin"
import { CodeHighlightPlugin } from "@/components/editor/plugins/code-highlight-plugin"
import { CodeActionMenuPlugin } from "@/components/editor/plugins/code-action-menu-plugin"
import { ContextMenuPlugin } from "@/components/editor/plugins/context-menu-plugin"
import { editorTheme } from "@/components/editor/themes/editor-theme"
import { Input } from "@/components/ui/input"
import { TooltipProvider } from "@/components/ui/tooltip"
import { showErrorToast } from "@/lib/notifications"
import { useNotes } from "@/hooks"


const initialValue = {
  root: {
    children: [
      {
        children: [],
        direction: "ltr",
        format: "",
        indent: 0,
        type: "paragraph",
        version: 1,
      },
    ],
    direction: "ltr",
    format: "",
    indent: 0,
    type: "root",
    version: 1,
  },
} as unknown as SerializedEditorState

const NOTE_FILE_EXTENSION = ".lexical"

function getDisplayFileName(title: string): string {
  return title.endsWith(NOTE_FILE_EXTENSION)
    ? title.slice(0, -NOTE_FILE_EXTENSION.length)
    : title
}

function normalizeNoteTitle(title: string): string {
  return title.endsWith(NOTE_FILE_EXTENSION)
    ? title
    : `${title}${NOTE_FILE_EXTENSION}`
}

const editorConfig: InitialConfigType = {
  namespace: "BrutalNotesEditor",
  theme: editorTheme,
  nodes: [
    HeadingNode,
    ParagraphNode,
    TextNode,
    QuoteNode,
    ListNode,
    ListItemNode,
    LinkNode,
    AutoLinkNode,
    CodeNode,
    CodeHighlightNode,
    HorizontalRuleNode,
    CollapsibleContainerNode,
    CollapsibleContentNode,
    CollapsibleTitleNode,
    ExcalidrawNode,
    EquationNode,
    ImageNode,
    PageBreakNode,
    TableNode,
    TableRowNode,
    TableCellNode,
  ],
  onError: (error: Error) => {
    console.error(error)
  },
}

interface BrutalEditorProps {
  onFileSaved?: () => void
  onLoadFile?: (loadFunction: (content: string, fileId: number) => void) => void
  onUnsavedChangesWarning?: (hasUnsavedChanges: boolean, saveFunction: () => Promise<void>) => void
  onCurrentFileChange?: (fileId: number | null) => void
  currentFileId?: number | null
  onInsertContent?: (insertFunction: (content: string) => void) => void
  onReplaceContent?: (replaceFunction: ((content: string) => void) | null) => void
  onLoadSharedMarkdown?: (loadFunction: ((markdown: string) => void) | null) => void
}

export function BrutalEditor({ onFileSaved, onLoadFile, onUnsavedChangesWarning, onCurrentFileChange, currentFileId, onInsertContent, onReplaceContent, onLoadSharedMarkdown }: BrutalEditorProps = {}) {
  const notesHook = useNotes()
  const { notes, createNote: createNoteHook, updateNote: updateNoteHook, getNoteById } = notesHook
  const [editorState, setEditorState] = useState<SerializedEditorState>(initialValue)
  const [currentDraftFileId, setCurrentDraftFileId] = useState<number | null>(null)
  const [currentFileName, setCurrentFileName] = useState<string | null>(null)
  
  // Create stable references to hook functions for use in callbacks
  const createNote = useCallback(createNoteHook, [createNoteHook])
  const updateNote = useCallback(updateNoteHook, [updateNoteHook])
  
  // Get or create temp folder for auto-save
  const getOrCreateTempFolder = useCallback(async (): Promise<number | undefined> => {
    try {
      // Try to find existing temp folder first
      const tempFolder = notes.find(note => 
        note.isFolder && note.title === 'temp'
      )
      if (tempFolder) {
        return tempFolder.id
      }

      // Create new temp folder
      console.log('🔧 Creating missing temp folder for auto-save')
      const newTempFolder = await createNote(
        'temp',
        '',
        undefined, // path will be generated automatically
        true // isFolder
      )
      
      if (newTempFolder?.id) {
        return newTempFolder.id
      } else {
        console.error('❌ Failed to create temp folder for auto-save')
        return undefined
      }
    } catch (error) {
      console.error('❌ Error in getOrCreateTempFolder:', error)
      return undefined
    }
  }, [notes, createNote])
  
  // AI Detection panel state
  const [aiDetectionData, setAIDetectionData] = useState<AIDetectionResponse | null>(null)

  
  // Ref to store the editor replacement function
  const replaceEditorContentRef = useRef<((text: string) => void) | null>(null)

  const currentNote = notes.find(note => note.id === currentFileId)
  const currentNoteTitle = currentNote?.title

  // Keep the current file name in sync with note updates, not just file switches.
  useEffect(() => {
    let isCancelled = false

    const fetchFileName = async () => {
      if (!currentFileId) {
        setCurrentFileName(null)
        return
      }

      if (currentNoteTitle) {
        setCurrentFileName(getDisplayFileName(currentNoteTitle))
        return
      }

      try {
        const note = await getNoteById(currentFileId)
        if (isCancelled) {
          return
        }

        if (note) {
          setCurrentFileName(getDisplayFileName(note.title))
        } else {
          setCurrentFileName(null)
        }
      } catch (error) {
        if (isCancelled) {
          return
        }

        console.error('Error fetching file name:', error)
        setCurrentFileName(null)
      }
    }

    void fetchFileName()

    return () => {
      isCancelled = true
    }
  }, [currentFileId, currentNoteTitle, getNoteById])

  const handleCurrentFileChange = useCallback((fileId: number | null) => {
    setCurrentDraftFileId(fileId) // Update internal state
    onCurrentFileChange?.(fileId)   // Notify parent (MainLayout)
  }, [onCurrentFileChange])

  // AI Detection handlers
  const handleAIDetectionResult = useCallback((result: AIDetectionResponse | null) => {
    setAIDetectionData(result)
  }, [])

  const handleAIDetectionClose = useCallback(() => {
    setAIDetectionData(null)
  }, [])

    return (
      <div className="bg-white h-full flex flex-col overflow-hidden border-t-4 border-black">
        <LexicalComposer
          initialConfig={{
            ...editorConfig,
            editorState: JSON.stringify(editorState),
          }}
        >
          <TooltipProvider>
          <div className="flex-1 flex flex-col overflow-hidden">
            <BrutalEditorPlugins 
              onFileSaved={onFileSaved} 
              onLoadFile={onLoadFile} 
              currentDraftFileId={currentDraftFileId}
              onCurrentFileChange={handleCurrentFileChange}
              onUnsavedChangesWarning={onUnsavedChangesWarning}
              currentFileName={currentFileName}
              onAIDetectionResult={handleAIDetectionResult}
              replaceEditorContentRef={replaceEditorContentRef}
              onInsertContent={onInsertContent}
              onReplaceContent={onReplaceContent}
              onLoadSharedMarkdown={onLoadSharedMarkdown}
              getOrCreateTempFolder={getOrCreateTempFolder}
              createNote={createNote}
              updateNote={updateNote}
              currentNoteClientId={currentNote?.clientId}
              currentNoteTitle={currentNote?.title}
            />

            <OnChangePlugin
                ignoreSelectionChange={true}
                onChange={(editorState) => {
                  setEditorState(editorState.toJSON())
                }}
              />
          </div>

          {/* AI Detection Panel - shown as side panel when active */}
          <AIDetectionPanel
            result={aiDetectionData}
            isVisible={!!aiDetectionData}
            onClose={handleAIDetectionClose}
          />
          </TooltipProvider>
        </LexicalComposer>
      </div>
    )
}

const placeholder = `Start writing here...`

function BrutalEditorPlugins({ onFileSaved, onLoadFile, currentDraftFileId, onCurrentFileChange, onUnsavedChangesWarning, currentFileName, onAIDetectionResult, replaceEditorContentRef, onInsertContent, onReplaceContent, onLoadSharedMarkdown, getOrCreateTempFolder, createNote, updateNote, currentNoteClientId, currentNoteTitle }: {
  onFileSaved?: () => void
  onLoadFile?: (loadFunction: (content: string, fileId: number) => void) => void
  currentDraftFileId?: number | null
  onCurrentFileChange?: (fileId: number | null) => void
  onUnsavedChangesWarning?: (hasUnsavedChanges: boolean, saveFunction: () => Promise<void>) => void
  currentFileName?: string | null
  onAIDetectionResult?: (result: AIDetectionResponse | null) => void
  replaceEditorContentRef?: MutableRefObject<((text: string) => void) | null>
  onInsertContent?: (insertFunction: (content: string) => void) => void
  onReplaceContent?: (replaceFunction: ((content: string) => void) | null) => void
  onLoadSharedMarkdown?: (loadFunction: ((markdown: string) => void) | null) => void
  getOrCreateTempFolder?: () => Promise<number | undefined>
  createNote?: (title: string, content: string, path?: string, isFolder?: boolean, parentId?: number) => Promise<{ id?: number } | null>
  updateNote?: (id: number, updates: { title?: string; content?: string; updatedAt?: Date }) => Promise<boolean>
  currentNoteClientId?: string
  currentNoteTitle?: string
}) {
  const [editor] = useLexicalComposerContext()
  const contentEditableRef = useRef<HTMLDivElement>(null)
  const currentFileNameInputRef = useRef<HTMLInputElement>(null)
  const [isRenamingCurrentFile, setIsRenamingCurrentFile] = useState(false)
  const [pendingFileName, setPendingFileName] = useState("")
  const [isSavingFileName, setIsSavingFileName] = useState(false)
  
  // Create manual save handler with access to editor context
  const handleManualSave = useCallback(async () => {
    if (!getOrCreateTempFolder || !createNote || !updateNote) {
      console.error('❌ Required functions not available for manual save')
      return
    }

    // Manual save functionality for unsaved changes dialog
    const editorState = editor.getEditorState()
    const contentJson = JSON.stringify(editorState.toJSON())
    
    // Get or create temp folder
    const tempFolderId = await getOrCreateTempFolder()
    if (!tempFolderId) {
      console.error('❌ Failed to get temp folder for auto-save')
      return
    }
    
    if (currentDraftFileId) {
      // Update existing temporary note
      await updateNote(currentDraftFileId, {
        content: contentJson,
        updatedAt: new Date()
      })

      window.dispatchEvent(
        new CustomEvent('noteSaved', {
          detail: {
            fileId: currentDraftFileId,
            content: contentJson
          }
        })
      )
    } else {
      // Create new temporary note
      const fileName = `Draft-${Date.now()}.lexical`
      const newNote = await createNote(
        fileName,
        contentJson,
        undefined, // path will be generated automatically
        false,
        tempFolderId
      )
      if (newNote?.id) {
        onCurrentFileChange?.(newNote.id)

        window.dispatchEvent(
          new CustomEvent('noteSaved', {
            detail: {
              fileId: newNote.id,
              content: contentJson
            }
          })
        )
      }
    }
    onFileSaved?.()
  }, [editor, getOrCreateTempFolder, currentDraftFileId, updateNote, createNote, onCurrentFileChange, onFileSaved])
  
  // Set up the editor content replacement function
  useEffect(() => {
    if (!replaceEditorContentRef) {
      onReplaceContent?.(null)
      return
    }

    const replaceFn = (text: string) => {
      editor.update(() => {
        const root = $getRoot()
        root.clear()

        const hasMarkdownSyntax = /^#+\s|^\*\s|\*\*.*?\*\*|__.*?__|`.*?`|\[.*?\]\(.*?\)/.test(text)

        if (hasMarkdownSyntax) {
          try {
            $convertFromMarkdownString(text, TRANSFORMERS)
          } catch (error) {
            console.warn("Failed to parse as markdown, inserting as plain text:", error)
            const paragraph = $createParagraphNode()
            const textNode = $createTextNode(text)
            paragraph.append(textNode)
            root.append(paragraph)
          }
        } else {
          const paragraph = $createParagraphNode()
          const textNode = $createTextNode(text)
          paragraph.append(textNode)
          root.append(paragraph)
        }
      })
    }

    replaceEditorContentRef.current = replaceFn
    onReplaceContent?.(replaceFn)

    return () => {
      replaceEditorContentRef.current = null
      onReplaceContent?.(null)
    }
  }, [editor, replaceEditorContentRef, onReplaceContent])
  
  // Set up the editor content insertion function (without clearing)
  useEffect(() => {
    if (onInsertContent) {
      const insertContent = (text: string) => {
        editor.update(() => {
          const root = $getRoot()
          
          // Try to detect if the text is markdown
          const hasMarkdownSyntax = /^#+\s|^\*\s|\*\*.*?\*\*|__.*?__|`.*?`|\[.*?\]\(.*?\)/.test(text)
          
          if (hasMarkdownSyntax) {
            // Parse as markdown and convert to Lexical nodes
            try {
              $convertFromMarkdownString(text, TRANSFORMERS)
            } catch (error) {
              console.warn("Failed to parse as markdown, inserting as plain text:", error)
              // Fallback to plain text
              const paragraph = $createParagraphNode()
              const textNode = $createTextNode(text)
              paragraph.append(textNode)
              root.append(paragraph)
            }
          } else {
            // Insert as plain text
            const paragraph = $createParagraphNode()
            const textNode = $createTextNode(text)
            paragraph.append(textNode)
            root.append(paragraph)
          }
        })
      }
      onInsertContent(insertContent)
    }
  }, [editor, onInsertContent])
  
  // Set up the shared markdown loading function (specifically for shared content)
  useEffect(() => {
    if (onLoadSharedMarkdown) {
      const loadSharedMarkdown = (markdown: string) => {
        editor.update(() => {
          const root = $getRoot()
          root.clear()

          // Force markdown parsing since we know this is markdown content from sharing
          try {
            $convertFromMarkdownString(markdown, TRANSFORMERS)
          } catch (error) {
            console.warn("Failed to parse shared markdown, inserting as plain text:", error)
            // Fallback to plain text
            const paragraph = $createParagraphNode()
            const textNode = $createTextNode(markdown)
            paragraph.append(textNode)
            root.append(paragraph)
          }
        })
      }
      onLoadSharedMarkdown(loadSharedMarkdown)
    }

    return () => {
      onLoadSharedMarkdown?.(null)
    }
  }, [editor, onLoadSharedMarkdown])
  
  // Auto-focus the editor on mount
  useEffect(() => {
    if (contentEditableRef.current) {
      // Focus the contentEditable element
      const editableElement = contentEditableRef.current.querySelector('[contenteditable="true"]')
      if (editableElement) {
        (editableElement as HTMLElement).focus()
      }
    }
  }, [])

  // Handle file loading - only run once on mount
  useEffect(() => {
    if (onLoadFile) {
      const loadFileContent = (content: string, fileId: number) => {
        try {
          const editorState = editor.parseEditorState(content)
          editor.setEditorState(editorState)
          // Set the current file ID to the file being loaded
          onCurrentFileChange?.(fileId)
        } catch (error) {
          console.error('Error loading file content:', error)
        }
      }
      onLoadFile(loadFileContent)
    }
  }, [onLoadFile, editor, onCurrentFileChange])
  
  const onRef = () => {
    // Handle floating anchor element if needed
  }

  useEffect(() => {
    if (!isRenamingCurrentFile) {
      setPendingFileName(currentFileName ?? "")
      return
    }

    currentFileNameInputRef.current?.focus()
    currentFileNameInputRef.current?.select()
  }, [currentFileName, isRenamingCurrentFile])

  const startCurrentFileRename = useCallback(() => {
    if (!currentDraftFileId || !currentFileName) {
      return
    }

    setPendingFileName(currentFileName)
    setIsRenamingCurrentFile(true)
  }, [currentDraftFileId, currentFileName])

  const cancelCurrentFileRename = useCallback(() => {
    setPendingFileName(currentFileName ?? "")
    setIsRenamingCurrentFile(false)
  }, [currentFileName])

  const commitCurrentFileRename = useCallback(async () => {
    if (!currentDraftFileId || !currentFileName || !updateNote || isSavingFileName) {
      setIsRenamingCurrentFile(false)
      return
    }

    const trimmedFileName = pendingFileName.trim()
    if (!trimmedFileName) {
      showErrorToast("Rename failed", "Note name cannot be empty.")
      currentFileNameInputRef.current?.focus()
      return
    }

    const normalizedCurrentTitle = normalizeNoteTitle(currentFileName)
    const normalizedNextTitle = normalizeNoteTitle(trimmedFileName)

    if (normalizedCurrentTitle === normalizedNextTitle) {
      setIsRenamingCurrentFile(false)
      return
    }

    setIsSavingFileName(true)

    try {
      const success = await updateNote(currentDraftFileId, {
        title: normalizedNextTitle,
        updatedAt: new Date(),
      })

      if (!success) {
        showErrorToast("Rename failed", "The note name could not be updated.")
        return
      }

      setIsRenamingCurrentFile(false)
    } finally {
      setIsSavingFileName(false)
    }
  }, [currentDraftFileId, currentFileName, updateNote, isSavingFileName, pendingFileName])

  return (
    <div className="h-full flex flex-col">
      {/* Current File Title */}
      {currentFileName && (
        <div className="flex items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-3 py-1.5">
          <span className="text-xs text-neutral-500 font-mono">📄</span>
          {isRenamingCurrentFile ? (
            <Input
              ref={currentFileNameInputRef}
              value={pendingFileName}
              onChange={(event) => setPendingFileName(event.target.value)}
              onBlur={() => {
                void commitCurrentFileRename()
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  void commitCurrentFileRename()
                }
                if (event.key === "Escape") {
                  event.preventDefault()
                  cancelCurrentFileRename()
                }
              }}
              disabled={isSavingFileName}
              className="h-7 max-w-sm border-black bg-white font-mono text-xs"
              aria-label="Rename current note"
            />
          ) : (
            <button
              type="button"
              className="min-w-0 truncate text-left text-xs font-mono text-neutral-700 transition-colors hover:text-black hover:underline"
              onClick={startCurrentFileRename}
              title="Rename current note"
            >
              {currentFileName}
            </button>
          )}
        </div>
      )}
      
      {/* Brutal Toolbar */}
      <ToolbarPlugin>
        {({ blockType }) => (
          <div className="toolbar-scroll-mobile flex flex-nowrap items-center gap-1 p-1.5 sm:p-2 border-b-4 border-black bg-neutral-200 whitespace-nowrap text-xs [&_button]:!border-2 [&_button]:!border-black [&_button]:!shadow-[2px_2px_0px_0px_#000] [&_button]:!bg-white [&_button]:!h-8 [&_button]:!px-2 [&_button:hover]:!translate-x-1 [&_button:hover]:!translate-y-1 [&_button:hover]:!shadow-none [&_button]:!font-black [&_button]:!text-black [&_button[aria-pressed='true']]:!bg-black [&_button[aria-pressed='true']]:!text-white [&_svg]:h-3 [&_svg]:w-3 disabled:[&_button]:!opacity-50 disabled:[&_button]:!bg-gray-200 [&_[role='combobox']]:!border-2 [&_[role='combobox']]:!border-black [&_[role='combobox']]:!shadow-[2px_2px_0px_0px_#000] [&_[role='combobox']]:!bg-white [&_[role='combobox']]:!font-black [&_[role='combobox']]:!text-black [&_[role='combobox']]:!h-8 [&_[role='combobox']]:!px-2 [&_[role='combobox']]:text-xs sm:[&_span]:inline [&_span]:hidden">
            <BlockFormatDropDown>
              <FormatParagraph />
              <FormatHeading levels={["h1", "h2", "h3"]} />
              <FormatNumberedList />
              <FormatBulletedList />
              <FormatCheckList />
              <FormatCodeBlock />
              <FormatQuote />
            </BlockFormatDropDown>
            {blockType === "code" && <CodeLanguageToolbarPlugin />}
            <BlockInsertPlugin>
              <InsertCollapsibleContainer />
              <InsertExcalidraw />
              <InsertImage />
              <InsertTable />
              <InsertEquation />
              <InsertPageBreak />
            </BlockInsertPlugin>
            <div className="w-px h-5 bg-black mx-1" />
            <HistoryToolbarPlugin />
            <div className="w-px h-5 bg-black mx-1" />
            <FontFormatToolbarPlugin format="bold" />
            <FontFormatToolbarPlugin format="italic" />
            <FontFormatToolbarPlugin format="underline" />
            <FontFormatToolbarPlugin format="strikethrough" />
            <div className="w-px h-5 bg-black mx-1" />
            <FontSizeToolbarPlugin />
            <div className="w-px h-5 bg-black mx-1" />
            <ElementFormatToolbarPlugin />
            <div className="w-px h-5 bg-black mx-1" />
            <FontColorToolbarPlugin />
            <FontBackgroundToolbarPlugin />
            <div className="w-px h-6 bg-black mx-1" />
            <AssistancePlugin 
              onAIDetectionResult={onAIDetectionResult}
            />
          </div>
        )}
      </ToolbarPlugin>

      {/* Main Editor */}
      <div className="flex-1 relative overflow-hidden min-h-0 max-h-full">
               <RichTextPlugin
                 contentEditable={
                   <div className="absolute inset-0 p-2 sm:p-6 overflow-y-auto custom-scrollbar" ref={contentEditableRef}>
                     <div className="" ref={onRef}>
                       <ContentEditable
                         placeholder={placeholder}
                          placeholderClassName="pointer-events-none absolute top-0 left-0 p-2 sm:p-6 pr-2 sm:pr-24 font-mono text-sm sm:text-lg leading-5 sm:leading-7 text-neutral-400"
                        className="outline-none font-mono text-sm sm:text-lg leading-5 sm:leading-7 pr-2 sm:pr-24 w-full min-h-full"
                       />
                     </div>
                   </div>
                 }
          ErrorBoundary={LexicalErrorBoundary}
        />
        
        {/* Context Menu Plugin */}
        <ContextMenuPlugin
          currentNoteClientId={currentNoteClientId}
          currentNoteTitle={currentNoteTitle}
        />
        
        {/* Code Plugins */}
        <CodeHighlightPlugin />
        <CodeActionMenuPlugin anchorElem={contentEditableRef.current} />
        <EmojiTypeaheadPlugin />

        {/* Core plugins */}
        <HistoryPlugin />
        <TabIndentationPlugin />
        
        {/* Markdown Support Plugins */}
        <ListPlugin />
        <CheckListPlugin />
        <HorizontalRulePlugin />
        
        {/* Markdown Shortcuts Plugin */}
        <MarkdownShortcutPlugin
          transformers={[
            CHECK_LIST,
            ...ELEMENT_TRANSFORMERS,
            ...MULTILINE_ELEMENT_TRANSFORMERS,
            ...TEXT_FORMAT_TRANSFORMERS,
            ...TEXT_MATCH_TRANSFORMERS,
          ]}
        />
        
        {/* Clear Editor Plugin */}
        <ClearEditorPlugin />
        
        {/* Collapsible Plugin */}
        <CollapsiblePlugin />
        
        {/* Excalidraw Plugin */}
        <ExcalidrawPlugin />
        
        {/* Images Plugin */}
        <ImagesPlugin />

        {/* Equations Plugin */}
        <EquationsPlugin />

        {/* Page Break Plugin */}
        <PageBreakPlugin />
        
        {/* Table Plugins */}
        <TablePlugin />
        <TableActionMenuPlugin anchorElem={contentEditableRef.current} />
        <TableCellResizerPlugin />
        <TableHoverActionsPlugin anchorElem={contentEditableRef.current} />
        
        {/* Unsaved Changes Plugin */}
        <UnsavedChangesPlugin
          currentFileId={currentDraftFileId ?? null}
          onUnsavedChangesChange={onUnsavedChangesWarning}
          onManualSave={handleManualSave}
        />
        
        {/* Save Shortcut Plugin (Ctrl+Alt+S) */}
        <SaveShortcutPlugin
          onFileSaved={onFileSaved}
          currentDraftFileId={currentDraftFileId}
          onCurrentFileChange={onCurrentFileChange}
        />
      </div>
      
      {/* Actions Bar */}
      <ActionsPlugin>
               <div className="clear-both flex items-center justify-between gap-1.5 sm:gap-2 overflow-auto border-t-4 border-black bg-neutral-100 p-1.5 sm:p-3 [&_button]:!border-2 [&_button]:!border-black [&_button]:!shadow-[2px_2px_0px_0px_#000] [&_button]:!bg-white [&_button:hover]:!translate-x-1 [&_button:hover]:!translate-y-1 [&_button:hover]:!shadow-none [&_button]:!font-black [&_button]:!text-black disabled:[&_button]:!opacity-50 disabled:[&_button]:!bg-gray-200">
                 <div className="flex flex-1 justify-start gap-1.5 sm:gap-2">
                   <SaveFilePlugin 
                     onFileSaved={onFileSaved} 
                     currentDraftFileId={currentDraftFileId}
                     onCurrentFileChange={onCurrentFileChange}
                   />
                   <ImportExportPlugin />
                 </div>
                 <div className="flex justify-center">
                   <CounterCharacterPlugin charset="UTF-16" />
                 </div>
                <div id="editor-actions-right" className="relative flex flex-1 justify-end gap-1.5 sm:gap-2">
                   <ShareNotePlugin />
                   <ClearEditorActionPlugin />
                 </div>
               </div>
      </ActionsPlugin>
    </div>
  )
}
