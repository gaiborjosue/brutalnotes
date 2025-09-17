"use client"

import { useState, useEffect, useRef, useCallback } from "react"
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
import { ImageNode } from "@/components/editor/nodes/image-node"
import { PageBreakNode } from "@/components/editor/nodes/page-break-node"
import { CollapsiblePlugin } from "@/components/editor/plugins/collapsible-plugin"
import { ExcalidrawPlugin } from "@/components/editor/plugins/excalidraw-plugin"
import { ImagesPlugin } from "@/components/editor/plugins/images-plugin"
import { PageBreakPlugin } from "@/components/editor/plugins/page-break-plugin"
import { TableActionMenuPlugin } from "@/components/editor/plugins/table-action-menu-plugin"
import { TableCellResizerPlugin } from "@/components/editor/plugins/table-cell-resizer-plugin"
import { TableHoverActionsPlugin } from "@/components/editor/plugins/table-hover-actions-plugin"
import { ContentEditable } from "@/components/editor/editor-ui/content-editable"
import { ToolbarPlugin } from "@/components/editor/plugins/toolbar/toolbar-plugin"
import { HistoryToolbarPlugin } from "@/components/editor/plugins/toolbar/history-toolbar-plugin"
import { FontFormatToolbarPlugin } from "@/components/editor/plugins/toolbar/font-format-toolbar-plugin"
import { ElementFormatToolbarPlugin } from "@/components/editor/plugins/toolbar/element-format-toolbar-plugin"
import { FontColorToolbarPlugin } from "@/components/editor/plugins/toolbar/font-color-toolbar-plugin"
import { FontBackgroundToolbarPlugin } from "@/components/editor/plugins/toolbar/font-background-toolbar-plugin"
import { FontSizeToolbarPlugin } from "@/components/editor/plugins/toolbar/font-size-toolbar-plugin"
import { CodeLanguageToolbarPlugin } from "@/components/editor/plugins/toolbar/code-language-toolbar-plugin"
import { SummarizeToolbarPlugin } from "@/components/editor/plugins/toolbar/summarize-toolbar-plugin"
import { ProofreadToolbarPlugin } from "@/components/editor/plugins/toolbar/proofread-toolbar-plugin"
import { ProofreadingPanel } from "@/components/editor/plugins/toolbar/ProofreadingPanel"
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
import { CounterCharacterPlugin } from "@/components/editor/plugins/actions/counter-character-plugin"
import { ImportExportPlugin } from "@/components/editor/plugins/actions/import-export-plugin"
import { SaveFilePlugin } from "@/components/editor/plugins/actions/save-file-plugin"
import { UnsavedChangesPlugin } from "@/components/editor/plugins/actions/unsaved-changes-plugin"
import { CodeHighlightPlugin } from "@/components/editor/plugins/code-highlight-plugin"
import { CodeActionMenuPlugin } from "@/components/editor/plugins/code-action-menu-plugin"
import { ContextMenuPlugin } from "@/components/editor/plugins/context-menu-plugin"
import { editorTheme } from "@/components/editor/themes/editor-theme"
import { TooltipProvider } from "@/components/ui/tooltip"
import { NoteService } from "@/lib/database-service"

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
}

export function BrutalEditor({ onFileSaved, onLoadFile, onUnsavedChangesWarning, onCurrentFileChange, currentFileId, onInsertContent }: BrutalEditorProps = {}) {
  const [editorState, setEditorState] = useState<SerializedEditorState>(initialValue)
  const [currentDraftFileId, setCurrentDraftFileId] = useState<number | null>(null)
  const [currentFileName, setCurrentFileName] = useState<string | null>(null)
  
  // Proofreading panel state
  const [proofreadingData, setProofreadingData] = useState<{
    originalText: string
    correctedText: string
    corrections?: {
      startIndex: number
      endIndex: number
      suggestion: string
      type: string
      explanation?: string
    }[]
  } | null>(null)
  
  // Ref to store the editor replacement function
  const replaceEditorContentRef = useRef<((text: string) => void) | null>(null)

  // Fetch current file name when currentFileId changes
  useEffect(() => {
    const fetchFileName = async () => {
      if (currentFileId) {
        try {
          const result = await NoteService.getNoteById(currentFileId)
          if (result.success && result.data) {
            // Remove .lexical extension for display
            const displayName = result.data.title.endsWith('.lexical') 
              ? result.data.title.slice(0, -8)
              : result.data.title
            setCurrentFileName(displayName)
          } else {
            setCurrentFileName(null)
          }
        } catch (error) {
          console.error('Error fetching file name:', error)
          setCurrentFileName(null)
        }
      } else {
        setCurrentFileName(null)
      }
    }
    
    fetchFileName()
  }, [currentFileId])

  // Combined handler for current file changes
  const handleCurrentFileChange = useCallback((fileId: number | null) => {
    setCurrentDraftFileId(fileId) // Update internal state
    onCurrentFileChange?.(fileId)   // Notify parent (MainLayout)
  }, [onCurrentFileChange])

  // Proofreading panel handlers
  const handleProofreadingAccept = useCallback(() => {
    if (proofreadingData && replaceEditorContentRef.current) {
      // Replace the editor content with the corrected text
      replaceEditorContentRef.current(proofreadingData.correctedText)
      console.log("Accepted proofreading changes and replaced editor content")
      setProofreadingData(null)
    } else if (proofreadingData) {
      console.warn("Editor replacement function not available")
    }
  }, [proofreadingData])

  const handleProofreadingReject = useCallback(() => {
    setProofreadingData(null)
  }, [])

  const handleProofreadingClose = useCallback(() => {
    setProofreadingData(null)
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
          {/* Main editor area - takes remaining space when panel is open */}
          <div className={`flex-1 flex flex-col overflow-hidden ${proofreadingData ? 'min-h-0' : ''}`}>
            <BrutalEditorPlugins 
              onFileSaved={onFileSaved} 
              onLoadFile={onLoadFile} 
              currentDraftFileId={currentDraftFileId}
              onCurrentFileChange={handleCurrentFileChange}
              onUnsavedChangesWarning={onUnsavedChangesWarning}
              currentFileName={currentFileName}
              onProofreadingResult={setProofreadingData}
              replaceEditorContentRef={replaceEditorContentRef}
              onInsertContent={onInsertContent}
            />

            <OnChangePlugin
                ignoreSelectionChange={true}
                onChange={(editorState) => {
                  setEditorState(editorState.toJSON())
                }}
              />
          </div>

          {/* Proofreading Panel - shown at bottom when active */}
          {proofreadingData && (
            <div className="border-t border-gray-200 bg-white overflow-y-auto max-h-96">
              <ProofreadingPanel
                correctedText={proofreadingData.correctedText}
                onAccept={handleProofreadingAccept}
                onReject={handleProofreadingReject}
                onClose={handleProofreadingClose}
              />
            </div>
          )}
          </TooltipProvider>
        </LexicalComposer>
      </div>
    )
}

const placeholder = `Start writing here...`

function BrutalEditorPlugins({ onFileSaved, onLoadFile, currentDraftFileId, onCurrentFileChange, onUnsavedChangesWarning, currentFileName, onProofreadingResult, replaceEditorContentRef, onInsertContent }: { 
  onFileSaved?: () => void
  onLoadFile?: (loadFunction: (content: string, fileId: number) => void) => void
  currentDraftFileId?: number | null
  onCurrentFileChange?: (fileId: number | null) => void
  onUnsavedChangesWarning?: (hasUnsavedChanges: boolean, saveFunction: () => Promise<void>) => void
  currentFileName?: string | null
  onProofreadingResult?: (data: {
    originalText: string
    correctedText: string
    corrections?: {
      startIndex: number
      endIndex: number
      suggestion: string
      type: string
      explanation?: string
    }[]
  } | null) => void
  replaceEditorContentRef?: React.MutableRefObject<((text: string) => void) | null>
  onInsertContent?: (insertFunction: (content: string) => void) => void
}) {
  const [editor] = useLexicalComposerContext()
  const contentEditableRef = useRef<HTMLDivElement>(null)
  
  // Set up the editor content replacement function
  useEffect(() => {
    if (replaceEditorContentRef) {
      replaceEditorContentRef.current = (text: string) => {
        editor.update(() => {
          const root = $getRoot()
          root.clear()
          
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
    }
  }, [editor, replaceEditorContentRef])
  
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

  return (
    <div className="h-full flex flex-col">
      {/* Current File Title - Minimal Display */}
      {currentFileName && (
        <div className="px-3 py-1 bg-neutral-50 border-b border-neutral-200">
          <span className="text-xs text-neutral-600 font-mono">
            📄 {currentFileName}
          </span>
        </div>
      )}
      
      {/* Brutal Toolbar */}
      <ToolbarPlugin>
        {({ blockType }) => (
          <div className="flex gap-2 p-3 border-b-4 border-black bg-neutral-200 overflow-auto [&_button]:!border-2 [&_button]:!border-black [&_button]:!shadow-[2px_2px_0px_0px_#000] [&_button]:!bg-white [&_button:hover]:!translate-x-1 [&_button:hover]:!translate-y-1 [&_button:hover]:!shadow-none [&_button]:!font-black [&_button]:!text-black [&_button[aria-pressed='true']]:!bg-black [&_button[aria-pressed='true']]:!text-white disabled:[&_button]:!opacity-50 disabled:[&_button]:!bg-gray-200 [&_[role='combobox']]:!border-2 [&_[role='combobox']]:!border-black [&_[role='combobox']]:!shadow-[2px_2px_0px_0px_#000] [&_[role='combobox']]:!bg-white [&_[role='combobox']]:!font-black [&_[role='combobox']]:!text-black">
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
            <div className="w-px h-6 bg-black mx-1" />
            <HistoryToolbarPlugin />
            <div className="w-px h-6 bg-black mx-1" />
            <FontFormatToolbarPlugin format="bold" />
            <FontFormatToolbarPlugin format="italic" />
            <FontFormatToolbarPlugin format="underline" />
            <FontFormatToolbarPlugin format="strikethrough" />
            <div className="w-px h-6 bg-black mx-1" />
            <FontSizeToolbarPlugin />
            <div className="w-px h-6 bg-black mx-1" />
            <ElementFormatToolbarPlugin />
            <div className="w-px h-6 bg-black mx-1" />
            <FontColorToolbarPlugin />
            <FontBackgroundToolbarPlugin />
            <div className="w-px h-6 bg-black mx-1" />
            <SummarizeToolbarPlugin />
            <ProofreadToolbarPlugin onProofreadingResult={onProofreadingResult} />
          </div>
        )}
      </ToolbarPlugin>

      {/* Main Editor */}
      <div className="flex-1 relative overflow-hidden min-h-0 max-h-full">
               <RichTextPlugin
                 contentEditable={
                   <div className="absolute inset-0 p-6 overflow-y-auto custom-scrollbar" ref={contentEditableRef}>
                     <div className="" ref={onRef}>
                       <ContentEditable
                         placeholder={placeholder}
                         className="outline-none font-mono text-lg leading-7 typewriter pr-24 w-full min-h-full"
                       />
                     </div>
                   </div>
                 }
          ErrorBoundary={LexicalErrorBoundary}
        />
        
        {/* Context Menu Plugin */}
        <ContextMenuPlugin />
        
        {/* Code Plugins */}
        <CodeHighlightPlugin />
        <CodeActionMenuPlugin anchorElem={contentEditableRef.current} />
        
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
          onManualSave={async () => {
            // Manual save functionality for unsaved changes dialog
            const editorState = editor.getEditorState()
            const contentJson = JSON.stringify(editorState.toJSON())
            
            // Find temp folder for saving
            const allNotes = await NoteService.getAllNotes()
            let tempFolderId: number | undefined

            if (allNotes.success && allNotes.data) {
              const tempFolder = allNotes.data.find(note => 
                note.isFolder && note.title === 'temp'
              )
              tempFolderId = tempFolder?.id
            }

            if (!tempFolderId) {
              console.error('❌ Temp folder not found')
              return
            }

            if (currentDraftFileId) {
              // Update existing temporary note
              await NoteService.updateNote(currentDraftFileId, {
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
              const result = await NoteService.createNote(
                fileName,
                contentJson,
                `/temp/${fileName}`,
                false,
                tempFolderId
              )
              if (result.success && result.data?.id) {
                onCurrentFileChange?.(result.data.id)

                window.dispatchEvent(
                  new CustomEvent('noteSaved', {
                    detail: {
                      fileId: result.data.id,
                      content: contentJson
                    }
                  })
                )
              }
            }
            onFileSaved?.()
          }}
        />
      </div>
      
      {/* Actions Bar */}
      <ActionsPlugin>
               <div className="clear-both flex items-center justify-between gap-2 overflow-auto border-t-4 border-black bg-neutral-100 p-3 [&_button]:!border-2 [&_button]:!border-black [&_button]:!shadow-[2px_2px_0px_0px_#000] [&_button]:!bg-white [&_button:hover]:!translate-x-1 [&_button:hover]:!translate-y-1 [&_button:hover]:!shadow-none [&_button]:!font-black [&_button]:!text-black disabled:[&_button]:!opacity-50 disabled:[&_button]:!bg-gray-200">
                 <div className="flex flex-1 justify-start gap-2">
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
                 <div className="flex flex-1 justify-end">
                   <ClearEditorActionPlugin />
                 </div>
               </div>
      </ActionsPlugin>
    </div>
  )
}
