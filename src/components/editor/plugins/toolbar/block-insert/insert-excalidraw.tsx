"use client"

import { FrameIcon } from "lucide-react"

import { useToolbarContext } from "@/components/editor/context/toolbar-context"
import { ExcalidrawModal } from "@/components/editor/editor-ui/excalidraw-modal"
import { $createExcalidrawNode } from "@/components/editor/nodes/excalidraw-node"
import { $wrapNodeInElement } from "@lexical/utils"
import { $createParagraphNode, $insertNodes, $isRootOrShadowRoot } from "lexical"
import type { AppState, BinaryFiles } from "@excalidraw/excalidraw/types"
import { SelectItem } from "@/components/ui/select"

export function InsertExcalidraw() {
  const { activeEditor, showModal } = useToolbarContext()
  return (
    <SelectItem
      value="excalidraw"
      onPointerUp={() =>
        showModal("Insert Excalidraw", (onClose) => (
          <ExcalidrawModal
            initialElements={[]}
            initialAppState={{} as AppState}
            initialFiles={{} as BinaryFiles}
            isShown={true}
            onDelete={onClose}
            onClose={onClose}
            onSave={(elements, appState, files) => {
              activeEditor.update(() => {
                const excalidrawNode = $createExcalidrawNode()
                excalidrawNode.setData(
                  JSON.stringify({ appState, elements, files })
                )
                $insertNodes([excalidrawNode])
                if ($isRootOrShadowRoot(excalidrawNode.getParentOrThrow())) {
                  $wrapNodeInElement(excalidrawNode, $createParagraphNode).selectEnd()
                }
              })
              onClose()
            }}
            closeOnClickOutside={false}
          />
        ))
      }
      className=""
    >
      <div className="flex items-center gap-1">
        <FrameIcon className="size-4" />
        <span>Excalidraw</span>
      </div>
    </SelectItem>
  )
}
