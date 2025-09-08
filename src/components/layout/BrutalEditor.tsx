"use client"

import { useState, useEffect, useRef } from "react"
import {
  type InitialConfigType,
  LexicalComposer,
} from "@lexical/react/LexicalComposer"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary"
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin"
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin"
import { HeadingNode, QuoteNode } from "@lexical/rich-text"
import { ParagraphNode, TextNode, type SerializedEditorState } from "lexical"
import { ListItemNode, ListNode } from "@lexical/list"
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin"
import { CodeHighlightNode, CodeNode } from "@lexical/code"
import { AutoLinkNode, LinkNode } from "@lexical/link"
import {
  CHECK_LIST,
  ELEMENT_TRANSFORMERS,
  MULTILINE_ELEMENT_TRANSFORMERS,
  TEXT_FORMAT_TRANSFORMERS,
  TEXT_MATCH_TRANSFORMERS,
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
import { ContentEditable } from "@/components/editor/editor-ui/content-editable"
import { ToolbarPlugin } from "@/components/editor/plugins/toolbar/toolbar-plugin"
import { HistoryToolbarPlugin } from "@/components/editor/plugins/toolbar/history-toolbar-plugin"
import { FontFormatToolbarPlugin } from "@/components/editor/plugins/toolbar/font-format-toolbar-plugin"
import { ElementFormatToolbarPlugin } from "@/components/editor/plugins/toolbar/element-format-toolbar-plugin"
import { FontColorToolbarPlugin } from "@/components/editor/plugins/toolbar/font-color-toolbar-plugin"
import { FontBackgroundToolbarPlugin } from "@/components/editor/plugins/toolbar/font-background-toolbar-plugin"
import { FontSizeToolbarPlugin } from "@/components/editor/plugins/toolbar/font-size-toolbar-plugin"
import { BlockFormatDropDown } from "@/components/editor/plugins/toolbar/block-format-toolbar-plugin"
import { FormatBulletedList } from "@/components/editor/plugins/toolbar/block-format/format-bulleted-list"
import { FormatCheckList } from "@/components/editor/plugins/toolbar/block-format/format-check-list"
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
import { AutoSavePlugin } from "@/components/editor/plugins/actions/auto-save-plugin"
import { UnsavedChangesPlugin } from "@/components/editor/plugins/actions/unsaved-changes-plugin"
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
  ],
  onError: (error: Error) => {
    console.error(error)
  },
}

interface BrutalEditorProps {
  onFileSaved?: () => void
  onLoadFile?: (loadFunction: (content: string, fileId: number) => void) => void
  onUnsavedChangesWarning?: (hasUnsavedChanges: boolean, saveFunction: () => Promise<void>) => void
}

export function BrutalEditor({ onFileSaved, onLoadFile, onUnsavedChangesWarning }: BrutalEditorProps = {}) {
  const [editorState, setEditorState] = useState<SerializedEditorState>(initialValue)
  const [currentAutoSavedFileId, setCurrentAutoSavedFileId] = useState<number | null>(null)

    return (
      <div className="bg-white h-full flex flex-col overflow-hidden border-t-4 border-black">
        <LexicalComposer
          initialConfig={{
            ...editorConfig,
            editorState: JSON.stringify(editorState),
          }}
        >
          <TooltipProvider>
          <BrutalEditorPlugins 
            onFileSaved={onFileSaved} 
            onLoadFile={onLoadFile} 
            currentAutoSavedFileId={currentAutoSavedFileId}
            onAutoSavedFileChange={setCurrentAutoSavedFileId}
            onUnsavedChangesWarning={onUnsavedChangesWarning}
          />

          <OnChangePlugin
              ignoreSelectionChange={true}
              onChange={(editorState) => {
                setEditorState(editorState.toJSON())
              }}
            />
          </TooltipProvider>
        </LexicalComposer>
      </div>
    )
}

const placeholder = `Start writing here...`

function BrutalEditorPlugins({ onFileSaved, onLoadFile, currentAutoSavedFileId, onAutoSavedFileChange, onUnsavedChangesWarning }: { 
  onFileSaved?: () => void
  onLoadFile?: (loadFunction: (content: string, fileId: number) => void) => void
  currentAutoSavedFileId?: number | null
  onAutoSavedFileChange?: (fileId: number | null) => void
  onUnsavedChangesWarning?: (hasUnsavedChanges: boolean, saveFunction: () => Promise<void>) => void
}) {
  const [editor] = useLexicalComposerContext()
  const contentEditableRef = useRef<HTMLDivElement>(null)
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(false)
  const [lastSaveTime, setLastSaveTime] = useState<Date | null>(null)
  
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
          // Set the current auto-saved file ID to the file being loaded
          onAutoSavedFileChange?.(fileId)
        } catch (error) {
          console.error('Error loading file content:', error)
        }
      }
      onLoadFile(loadFileContent)
    }
  }, []) // Remove dependencies to prevent infinite loop
  
  const onRef = () => {
    // Handle floating anchor element if needed
  }

  return (
    <div className="h-full flex flex-col">
      {/* Brutal Toolbar */}
      <ToolbarPlugin>
        {() => (
          <div className="flex gap-2 p-3 border-b-4 border-black bg-neutral-200 overflow-auto [&_button]:!border-2 [&_button]:!border-black [&_button]:!shadow-[2px_2px_0px_0px_#000] [&_button]:!bg-white [&_button:hover]:!translate-x-1 [&_button:hover]:!translate-y-1 [&_button:hover]:!shadow-none [&_button]:!font-black [&_button]:!text-black [&_button[aria-pressed='true']]:!bg-black [&_button[aria-pressed='true']]:!text-white disabled:[&_button]:!opacity-50 disabled:[&_button]:!bg-gray-200 [&_[role='combobox']]:!border-2 [&_[role='combobox']]:!border-black [&_[role='combobox']]:!shadow-[2px_2px_0px_0px_#000] [&_[role='combobox']]:!bg-white [&_[role='combobox']]:!font-black [&_[role='combobox']]:!text-black">
            <BlockFormatDropDown>
              <FormatParagraph />
              <FormatHeading levels={["h1", "h2", "h3"]} />
              <FormatNumberedList />
              <FormatBulletedList />
              <FormatCheckList />
              <FormatQuote />
            </BlockFormatDropDown>
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
        
        {/* Unsaved Changes Plugin */}
        <UnsavedChangesPlugin
          currentFileId={currentAutoSavedFileId}
          isAutoSaveEnabled={autoSaveEnabled}
          lastSaveTime={lastSaveTime}
          onUnsavedChangesChange={onUnsavedChangesWarning}
          onManualSave={async () => {
            // Trigger auto-save manually when user chooses to save
            const editorState = editor.getEditorState()
            const contentJson = JSON.stringify(editorState.toJSON())
            
            // Use the auto-save logic to save current content
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

            if (currentAutoSavedFileId) {
              // Update existing file
              await NoteService.updateNote(currentAutoSavedFileId, {
                content: contentJson,
                updatedAt: new Date()
              })
            } else {
              // Create new auto-save file
              const fileName = `UnsavedChanges-${Date.now()}.lexical`
              const result = await NoteService.createNote(
                fileName,
                contentJson,
                `/temp/${fileName}`,
                false,
                tempFolderId
              )
              if (result.success && result.data) {
                onAutoSavedFileChange?.(result.data.id)
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
                     currentAutoSavedFileId={currentAutoSavedFileId}
                     onAutoSavedFileChange={onAutoSavedFileChange}
                   />
                  <AutoSavePlugin 
                    onFileSaved={onFileSaved}
                    currentAutoSavedFileId={currentAutoSavedFileId}
                    onAutoSavedFileChange={onAutoSavedFileChange}
                    onAutoSaveStateChange={(isEnabled, lastSave) => {
                      setAutoSaveEnabled(isEnabled)
                      setLastSaveTime(lastSave)
                    }}
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
