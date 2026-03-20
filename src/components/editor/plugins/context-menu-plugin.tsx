import type { JSX } from "react"
import { useCallback, useMemo } from "react"
import { $isLinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  NodeContextMenuOption,
  NodeContextMenuPlugin,
  NodeContextMenuSeparator,
} from "@lexical/react/LexicalNodeContextMenuPlugin"
import {
  $getSelection,
  $isDecoratorNode,
  $isNodeSelection,
  $isRangeSelection,
  COPY_COMMAND,
  CUT_COMMAND,
  PASTE_COMMAND,
  type LexicalNode,
} from "lexical"
import {
  Clipboard,
  ClipboardType,
  Copy,
  Link2Off,
  ListTodo,
  Scissors,
  Trash2,
} from "lucide-react"
import { useTodos } from "@/hooks"
import { showErrorToast, showSuccessToast, showWarningToast } from "@/lib/notifications"

interface ContextMenuPluginProps {
  currentNoteClientId?: string
  currentNoteTitle?: string
}

function getDisplayNoteTitle(title?: string): string | undefined {
  if (!title) {
    return undefined
  }

  return title.endsWith(".lexical") ? title.slice(0, -".lexical".length) : title
}

export function ContextMenuPlugin({
  currentNoteClientId,
  currentNoteTitle,
}: ContextMenuPluginProps): JSX.Element {
  const [editor] = useLexicalComposerContext()
  const { addTodo } = useTodos()

  const handleAddSelectionToTodos = useCallback(() => {
    let selectionText = ""

    editor.getEditorState().read(() => {
      const selection = $getSelection()
      if ($isRangeSelection(selection) && !selection.isCollapsed()) {
        selectionText = selection.getTextContent().replace(/\s+/g, " ").trim()
      }
    })

    if (!selectionText) {
      showWarningToast("Select text first", "Highlight some text in the note, then add it to Todos.")
      return
    }

    void addTodo(selectionText, {
      sourceNoteClientId: currentNoteClientId,
      sourceNoteTitle: getDisplayNoteTitle(currentNoteTitle),
    }).then((createdTodo) => {
      if (!createdTodo) {
        showErrorToast("Todo not added", "The selected text could not be saved as a todo.")
        return
      }

      showSuccessToast("Added to Todos")
    })
  }, [addTodo, currentNoteClientId, currentNoteTitle, editor])

  const items = useMemo(() => {
    return [
      new NodeContextMenuOption(`Remove Link`, {
        $onSelect: () => {
          editor.dispatchCommand(TOGGLE_LINK_COMMAND, null)
        },
        $showOn: (node: LexicalNode) => $isLinkNode(node.getParent()),
        disabled: false,
        icon: <Link2Off className="h-4 w-4" />,
      }),
      new NodeContextMenuSeparator({
        $showOn: (node: LexicalNode) => $isLinkNode(node.getParent()),
      }),
      new NodeContextMenuOption(`Cut`, {
        $onSelect: () => {
          editor.dispatchCommand(CUT_COMMAND, null)
        },
        disabled: false,
        icon: <Scissors className="h-4 w-4" />,
      }),
      new NodeContextMenuOption(`Copy`, {
        $onSelect: () => {
          editor.dispatchCommand(COPY_COMMAND, null)
        },
        disabled: false,
        icon: <Copy className="h-4 w-4" />,
      }),
      new NodeContextMenuOption(`Add To Todos`, {
        $onSelect: () => {
          handleAddSelectionToTodos()
        },
        disabled: false,
        icon: <ListTodo className="h-4 w-4" />,
      }),
      new NodeContextMenuOption(`Paste`, {
        $onSelect: () => {
          void navigator.clipboard.read().then(async () => {
            const data = new DataTransfer()

            const readClipboardItems = await navigator.clipboard.read()
            const item = readClipboardItems[0]

            const permission = await navigator.permissions.query({
              // @ts-expect-error These types are incorrect.
              name: "clipboard-read",
            })
            if (permission.state === "denied") {
              showErrorToast("Clipboard access denied", "Allow clipboard access to paste.")
              return
            }

            for (const type of item.types) {
              const blob = await item.getType(type)
              if (type.startsWith("image/")) {
                const extension = type.split("/")[1] || "png"
                const file = new File([blob], `clipboard-image.${extension}`, {
                  type,
                })
                data.items.add(file)
              } else {
                const dataString = await blob.text()
                data.setData(type, dataString)
              }
            }

            const event = new ClipboardEvent("paste", {
              clipboardData: data,
            })

            editor.dispatchCommand(PASTE_COMMAND, event)
          }).catch(() => {
            showErrorToast("Clipboard access failed", "The browser refused to read the clipboard.")
          })
        },
        disabled: false,
        icon: <Clipboard className="h-4 w-4" />,
      }),
      new NodeContextMenuOption(`Paste as Plain Text`, {
        $onSelect: () => {
          void navigator.clipboard.read().then(async () => {
            const permission = await navigator.permissions.query({
              // @ts-expect-error These types are incorrect.
              name: "clipboard-read",
            })

            if (permission.state === "denied") {
              showErrorToast("Clipboard access denied", "Allow clipboard access to paste.")
              return
            }

            const data = new DataTransfer()
            const clipboardText = await navigator.clipboard.readText()
            data.setData("text/plain", clipboardText)

            const event = new ClipboardEvent("paste", {
              clipboardData: data,
            })
            editor.dispatchCommand(PASTE_COMMAND, event)
          }).catch(() => {
            showErrorToast("Clipboard access failed", "The browser refused to read the clipboard.")
          })
        },
        disabled: false,
        icon: <ClipboardType className="h-4 w-4" />,
      }),
      new NodeContextMenuSeparator(),
      new NodeContextMenuOption(`Delete Node`, {
        $onSelect: () => {
          const selection = $getSelection()
          if ($isRangeSelection(selection)) {
            const currentNode = selection.anchor.getNode()
            const ancestorNodeWithRootAsParent = currentNode.getParents().at(-2)

            ancestorNodeWithRootAsParent?.remove()
          } else if ($isNodeSelection(selection)) {
            const selectedNodes = selection.getNodes()
            selectedNodes.forEach((node) => {
              if ($isDecoratorNode(node)) {
                node.remove()
              }
            })
          }
        },
        disabled: false,
        icon: <Trash2 className="h-4 w-4" />,
      }),
    ]
  }, [editor, handleAddSelectionToTodos])

  return (
    <NodeContextMenuPlugin
      className="bg-white text-black !z-50 overflow-hidden border-2 border-black shadow-[4px_4px_0px_0px_#000] outline-none [&:has(*)]:!z-10 font-mono"
      itemClassName="relative w-full flex cursor-default items-center gap-2 px-3 py-2 text-sm outline-none select-none hover:bg-black hover:text-white focus:bg-black focus:text-white data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 font-black transition-colors duration-150"
      separatorClassName="bg-black -mx-1 h-px my-1"
      items={items}
    />
  )
}
