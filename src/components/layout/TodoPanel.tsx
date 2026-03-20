import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { toast } from "sonner"
import {
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import Star10 from "@/components/stars/s10"
import { useTodos } from "@/hooks"
import type { LocalTodo } from "@/services/indexedDBService"
import { showErrorToast, showWarningToast } from "@/lib/notifications"

interface TodoPanelProps {
  collapsed?: boolean
  onToggle?: () => void
  className?: string
  currentNoteClientId?: string
  onOpenLinkedNoteByClientId?: (clientId: string) => void | Promise<void>
}

const NOTE_FILE_EXTENSION = ".lexical"
const DELETE_UNDO_WINDOW_MS = 4000

function getDisplayNoteTitle(title?: string): string {
  if (!title) {
    return "Linked note"
  }

  return title.endsWith(NOTE_FILE_EXTENSION)
    ? title.slice(0, -NOTE_FILE_EXTENSION.length)
    : title
}

function getTodoKey(todo: LocalTodo): string {
  return String(todo.id ?? todo.clientId ?? todo.serverId ?? todo.text)
}

interface TodoRowProps {
  todo: LocalTodo
  isEditing: boolean
  editingText: string
  onEditingTextChange: (value: string) => void
  onBeginEdit: () => void
  onCommitEdit: () => void
  onCancelEdit: () => void
  onToggle: () => void
  onQueueDelete: () => void
  onOpenSource?: () => void
  sourceLabel?: string
  sourceAvailable?: boolean
  hideSourceBadge?: boolean
}

function TodoRow({
  todo,
  isEditing,
  editingText,
  onEditingTextChange,
  onBeginEdit,
  onCommitEdit,
  onCancelEdit,
  onToggle,
  onQueueDelete,
  onOpenSource,
  sourceLabel,
  sourceAvailable = false,
  hideSourceBadge = false,
}: TodoRowProps) {
  return (
    <div className="group flex items-start gap-2 border-2 border-black bg-white px-2 py-2 transition-colors hover:bg-yellow-50">
      <Checkbox
        checked={todo.completed}
        onCheckedChange={onToggle}
        className="mt-0.5 border-2 border-black"
        aria-label={todo.completed ? "Mark todo as incomplete" : "Mark todo as complete"}
      />

      <div className="min-w-0 flex-1">
        {isEditing ? (
          <Input
            value={editingText}
            onChange={(event) => onEditingTextChange(event.target.value)}
            onBlur={onCommitEdit}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                onCommitEdit()
              }

              if (event.key === "Escape") {
                event.preventDefault()
                onCancelEdit()
              }
            }}
            className="h-8 border-2 border-black bg-white font-mono text-sm"
            aria-label="Edit todo"
            autoFocus
          />
        ) : (
          <button
            type="button"
            onClick={onBeginEdit}
            className={`w-full truncate text-left font-mono text-sm ${
              todo.completed ? "text-neutral-500 line-through" : "text-black"
            }`}
            title="Rename todo"
          >
            {todo.text}
          </button>
        )}
      </div>

      {!hideSourceBadge && sourceLabel ? (
        <button
          type="button"
          onClick={onOpenSource}
          disabled={!sourceAvailable}
          className={`shrink-0 max-w-28 truncate border-2 border-black px-1.5 py-0.5 font-mono text-[10px] font-black uppercase ${
            sourceAvailable
              ? "bg-blue-100 text-black hover:bg-blue-200"
              : "cursor-not-allowed bg-neutral-100 text-neutral-500"
          }`}
          title={sourceAvailable ? `Open ${sourceLabel}` : `${sourceLabel} is unavailable on this device`}
        >
          {sourceLabel}
        </button>
      ) : null}

      {!isEditing ? (
        <div className="flex shrink-0 items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
          <Button
            type="button"
            size="sm"
            variant="neutral"
            onClick={onBeginEdit}
            className="h-7 w-7 p-0"
            title="Edit todo"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="neutral"
            onClick={onQueueDelete}
            className="h-7 w-7 p-0 hover:bg-red-200"
            title="Delete todo"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function TodoSection({
  title,
  count,
  children,
  action,
}: {
  title: string
  count: number
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2 border-b-2 border-black pb-1">
        <div className="font-mono text-[11px] font-black uppercase tracking-wide text-neutral-700">
          {title} <span className="text-neutral-500">• {count}</span>
        </div>
        {action}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

export function TodoPanel({
  collapsed = false,
  onToggle,
  className,
  currentNoteClientId,
  onOpenLinkedNoteByClientId,
}: TodoPanelProps = {}) {
  const [newTodo, setNewTodo] = useState("")
  const [editingTodoId, setEditingTodoId] = useState<number | null>(null)
  const [editingText, setEditingText] = useState("")
  const [showCompleted, setShowCompleted] = useState(false)
  const [pendingDeleteIds, setPendingDeleteIds] = useState<number[]>([])
  const deleteTimersRef = useRef(new Map<number, number>())
  const isMountedRef = useRef(true)

  const {
    todos,
    addTodo,
    toggleTodo,
    deleteTodo,
    updateTodo,
    isInitialLoading,
    isSyncing,
    isLiveSync,
    isOnline,
    hasErrors,
    error: syncError,
  } = useTodos()

  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const pendingDeleteIdSet = useMemo(() => new Set(pendingDeleteIds), [pendingDeleteIds])

  const visibleTodos = useMemo(
    () => todos.filter((todo) => !pendingDeleteIdSet.has(todo.id ?? -1)),
    [todos, pendingDeleteIdSet],
  )

  const visiblePendingTodos = useMemo(
    () => visibleTodos.filter((todo) => !todo.completed),
    [visibleTodos],
  )

  const visibleCompletedTodos = useMemo(
    () => visibleTodos.filter((todo) => todo.completed),
    [visibleTodos],
  )

  const currentNotePendingTodos = useMemo(() => {
    if (!currentNoteClientId) {
      return []
    }

    return visiblePendingTodos.filter(
      (todo) => todo.sourceNoteClientId === currentNoteClientId,
    )
  }, [currentNoteClientId, visiblePendingTodos])

  const otherPendingTodos = useMemo(() => {
    if (!currentNoteClientId) {
      return visiblePendingTodos
    }

    return visiblePendingTodos.filter(
      (todo) => todo.sourceNoteClientId !== currentNoteClientId,
    )
  }, [currentNoteClientId, visiblePendingTodos])

  const pendingCount = visiblePendingTodos.length

  const statusMeta = useMemo(() => {
    if (hasErrors || syncError) {
      return {
        dotClassName: "bg-red-500",
        label: "Sync will retry. Local changes are still safe.",
      }
    }

    if (isInitialLoading) {
      return {
        dotClassName: "animate-pulse bg-yellow-500",
        label: "Loading todos...",
      }
    }

    if (!isOnline) {
      return {
        dotClassName: "bg-neutral-400",
        label: "Offline. Todos are saving locally.",
      }
    }

    if (isSyncing) {
      return {
        dotClassName: "animate-pulse bg-yellow-500",
        label: "Syncing local changes...",
      }
    }

    if (isLiveSync) {
      return {
        dotClassName: "bg-green-500",
        label: "Live sync active.",
      }
    }

    return {
      dotClassName: "bg-neutral-400",
      label: "Waiting for sync.",
    }
  }, [hasErrors, syncError, isInitialLoading, isOnline, isSyncing, isLiveSync])

  const addTodoHandler = async () => {
    const trimmedTodo = newTodo.trim()
    if (!trimmedTodo) {
      return
    }

    try {
      const createdTodo = await addTodo(trimmedTodo)
      if (!createdTodo) {
        showErrorToast("Todo not added", "The task could not be saved.")
        return
      }

      setNewTodo("")
    } catch (error) {
      console.error('Failed to add todo:', error)
      showErrorToast("Todo not added", "The task could not be saved.")
    }
  }

  const toggleTodoHandler = async (id: number) => {
    const success = await toggleTodo(id)
    if (!success) {
      showErrorToast("Todo not updated", "The task could not be updated.")
    }
  }

  const beginEditingTodo = (todo: LocalTodo) => {
    if (!todo.id) {
      return
    }

    setEditingTodoId(todo.id)
    setEditingText(todo.text)
  }

  const cancelEditingTodo = () => {
    setEditingTodoId(null)
    setEditingText("")
  }

  const commitEditingTodo = async () => {
    if (!editingTodoId) {
      return
    }

    const trimmedText = editingText.trim()
    if (!trimmedText) {
      showWarningToast("Todo needs text", "Rename the task or press Escape to cancel.")
      return
    }

    const existingTodo = todos.find((todo) => todo.id === editingTodoId)
    if (!existingTodo) {
      cancelEditingTodo()
      return
    }

    if (existingTodo.text === trimmedText) {
      cancelEditingTodo()
      return
    }

    const success = await updateTodo(editingTodoId, { text: trimmedText })
    if (!success) {
      showErrorToast("Todo not updated", "The task name could not be saved.")
      return
    }

    cancelEditingTodo()
  }

  const undoQueuedDelete = (id: number) => {
    const timerId = deleteTimersRef.current.get(id)
    if (timerId) {
      window.clearTimeout(timerId)
      deleteTimersRef.current.delete(id)
    }

    setPendingDeleteIds((currentIds) => currentIds.filter((currentId) => currentId !== id))
  }

  const queueDeleteTodo = (todo: LocalTodo) => {
    if (!todo.id || pendingDeleteIdSet.has(todo.id)) {
      return
    }

    setPendingDeleteIds((currentIds) => [...currentIds, todo.id!])
    cancelEditingTodo()

    const timeoutId = window.setTimeout(async () => {
      deleteTimersRef.current.delete(todo.id!)
      const success = await deleteTodo(todo.id!)
      if (!success && isMountedRef.current) {
        setPendingDeleteIds((currentIds) => currentIds.filter((currentId) => currentId !== todo.id))
        showErrorToast("Todo not deleted", "The task could not be removed.")
        return
      }

      if (isMountedRef.current) {
        setPendingDeleteIds((currentIds) => currentIds.filter((currentId) => currentId !== todo.id))
      }
    }, DELETE_UNDO_WINDOW_MS)

    deleteTimersRef.current.set(todo.id, timeoutId)

    toast("Todo queued for deletion", {
      description: `"${todo.text}" will be removed in a few seconds.`,
      duration: DELETE_UNDO_WINDOW_MS,
      action: {
        label: "Undo",
        onClick: () => undoQueuedDelete(todo.id!),
      },
    })
  }

  const handleOpenLinkedNote = (todo: LocalTodo) => {
    if (!todo.sourceNoteClientId || !onOpenLinkedNoteByClientId) {
      return
    }

    const result = onOpenLinkedNoteByClientId(todo.sourceNoteClientId)
    if (result && typeof (result as Promise<void>).then === "function") {
      ;(result as Promise<void>).catch((error) => {
        console.error("Failed to open linked note:", error)
        showErrorToast("Linked note not opened", "The note could not be opened.")
      })
    }
  }

  const handleHeaderKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onToggle) return
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      onToggle()
    }
  }

  const cardClasses = collapsed
    ? "gap-0 pt-6 pb-0 border-4 border-black shadow-[4px_4px_0px_0px_#000] bg-white"
    : "h-full min-h-0 gap-0 pt-6 pb-0 border-4 border-black shadow-[4px_4px_0px_0px_#000] bg-white flex flex-col"

  const renderTodoRow = (todo: LocalTodo, options?: { hideSourceBadge?: boolean }) => {
    const sourceLabel = todo.sourceNoteClientId
      ? getDisplayNoteTitle(todo.sourceNoteTitle)
      : undefined

    return (
      <TodoRow
        key={getTodoKey(todo)}
        todo={todo}
        isEditing={editingTodoId === todo.id}
        editingText={editingTodoId === todo.id ? editingText : todo.text}
        onEditingTextChange={setEditingText}
        onBeginEdit={() => beginEditingTodo(todo)}
        onCommitEdit={() => {
          void commitEditingTodo()
        }}
        onCancelEdit={cancelEditingTodo}
        onToggle={() => {
          if (todo.id) {
            void toggleTodoHandler(todo.id)
          }
        }}
        onQueueDelete={() => queueDeleteTodo(todo)}
        onOpenSource={() => handleOpenLinkedNote(todo)}
        sourceLabel={sourceLabel}
        sourceAvailable={Boolean(todo.sourceNoteClientId && onOpenLinkedNoteByClientId)}
        hideSourceBadge={options?.hideSourceBadge}
      />
    )
  }

  return (
    <Card
      className={`${cardClasses} ${onToggle ? "cursor-pointer" : ""} ${className ?? ""}`.trim()}
      aria-expanded={!collapsed}
    >
      <CardHeader
        className="border-b-4 border-black bg-yellow-300 p-3"
        onClick={onToggle}
        role={onToggle ? "button" : undefined}
        tabIndex={onToggle ? 0 : undefined}
        onKeyDown={handleHeaderKeyDown}
      >
        <CardTitle className="flex items-center justify-between gap-3 text-lg font-black text-black">
          <div className="flex min-w-0 items-center gap-2">
            <Star10 size={20} color="#000" />
            <span>TODOS</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="border-2 border-black bg-yellow-100 px-2 py-0.5 font-mono text-[10px] font-black uppercase">
              {isInitialLoading ? "..." : `${pendingCount} left`}
            </span>
            <div className="flex items-center gap-1.5" title={statusMeta.label}>
              <div className={`h-2.5 w-2.5 rounded-full ${statusMeta.dotClassName}`} />
              {(hasErrors || syncError) ? (
                <CircleAlert className="h-3.5 w-3.5 text-red-700" />
              ) : null}
            </div>
          </div>
        </CardTitle>
      </CardHeader>

      {!collapsed ? (
        <CardContent className="flex-1 min-h-0 px-0 pb-0 pt-2">
          <div className="flex h-full min-h-0 flex-col">
            <div className="px-3">
              <div className="flex gap-2">
                <Input
                  value={newTodo}
                  onChange={(event) => setNewTodo(event.target.value)}
                  placeholder="Add brutal todo..."
                  className="h-10 flex-1 border-2 border-black bg-white font-mono text-sm"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      void addTodoHandler()
                    }
                  }}
                />
                <Button
                  type="button"
                  onClick={() => void addTodoHandler()}
                  size="sm"
                  className="h-10 border-2 border-black bg-green-400 px-3 font-black text-black shadow-[2px_2px_0px_0px_#000] hover:bg-green-500"
                  title="Add todo"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {syncError || hasErrors || !isOnline || isSyncing ? (
                <div className="mt-2 font-mono text-[11px] uppercase text-neutral-600">
                  {hasErrors || syncError
                    ? "Sync will retry. Local changes are safe."
                    : !isOnline
                      ? "Offline. Todos stay local until you reconnect."
                      : "Local changes are syncing in the background."}
                </div>
              ) : null}
            </div>

            <ScrollArea className="mt-3 flex-1 min-h-0 border-t-2 border-black">
              <div className="space-y-3 p-3">
                {isInitialLoading ? (
                  <div className="py-6 text-center font-mono text-sm text-neutral-500">
                    Loading todos...
                  </div>
                ) : visibleTodos.length === 0 ? (
                  <div className="py-6 text-center font-mono text-sm text-neutral-500">
                    No todos yet. Add one above or turn selected note text into a task.
                  </div>
                ) : (
                  <>
                    {currentNotePendingTodos.length > 0 ? (
                      <TodoSection
                        title="For This Note"
                        count={currentNotePendingTodos.length}
                      >
                        {currentNotePendingTodos.map((todo) => renderTodoRow(todo, { hideSourceBadge: true }))}
                      </TodoSection>
                    ) : null}

                    {otherPendingTodos.length > 0 ? (
                      <TodoSection
                        title={currentNotePendingTodos.length > 0 ? "Other Tasks" : "Pending"}
                        count={otherPendingTodos.length}
                      >
                        {otherPendingTodos.map((todo) => renderTodoRow(todo))}
                      </TodoSection>
                    ) : null}

                    {visibleCompletedTodos.length > 0 ? (
                      <TodoSection
                        title="Done"
                        count={visibleCompletedTodos.length}
                        action={
                          <button
                            type="button"
                            onClick={() => setShowCompleted((currentValue) => !currentValue)}
                            className="flex items-center gap-1 font-mono text-[11px] font-black uppercase text-neutral-700"
                          >
                            {showCompleted ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            )}
                            {showCompleted ? "Hide" : "Show"}
                          </button>
                        }
                      >
                        {showCompleted ? visibleCompletedTodos.map((todo) => renderTodoRow(todo)) : null}
                      </TodoSection>
                    ) : null}
                  </>
                )}
              </div>
            </ScrollArea>
          </div>
        </CardContent>
      ) : null}
    </Card>
  )
}
