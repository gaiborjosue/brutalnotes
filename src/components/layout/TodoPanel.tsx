import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Plus, Trash2 } from "lucide-react"
import Star10 from "@/components/stars/s10"
import { TodoService } from "@/lib/database-service"
import { useTodosShape } from "@/lib/electric/shapes"

export function TodoPanel() {
  const [newTodo, setNewTodo] = useState("")
  const { todos, shape, isInitialLoading, isSyncing, isLiveSync } = useTodosShape()

  const loading = shape.isLoading
  const syncError = shape.isError ? String(shape.error) : null

  const addTodo = async () => {
    if (!newTodo.trim()) {
      return
    }

    const result = await TodoService.addTodo(newTodo.trim())
    if (!result.success) {
      console.error('Failed to add todo:', result.error)
      return
    }

    setNewTodo("")
  }

  const toggleTodo = async (id: number) => {
    const result = await TodoService.toggleTodo(id)
    if (!result.success) {
      console.error('Failed to toggle todo:', result.error)
    }
  }

  const deleteTodo = async (id: number) => {
    const result = await TodoService.deleteTodo(id)
    if (!result.success) {
      console.error('Failed to delete todo:', result.error)
    }
  }

  return (
    <Card className="h-full min-h-0 border-4 border-black shadow-[4px_4px_0px_0px_#000] bg-white flex flex-col">
      <CardHeader className="border-b-4 border-black bg-yellow-300 p-3">
        <CardTitle className="text-lg font-black text-black flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Star10 size={20} color="#000" />
            TODOS
            {/* Show sync status with subtle dots */}
            {isInitialLoading && (
              <span className="text-xs font-mono text-gray-600 bg-yellow-200 px-2 py-1 rounded">
                LOADING...
              </span>
            )}
            {isSyncing && !isInitialLoading && (
              <div 
                className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" 
                title="Syncing..."
              />
            )}
            {isLiveSync && (
              <div 
                className="w-2 h-2 bg-green-500 rounded-full" 
                title="Live sync active"
              />
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0 flex-1 min-h-0">
        <div className="space-y-3 h-full min-h-0 flex flex-col">
          {syncError && (
            <div className="bg-red-100 border-2 border-red-500 text-red-700 px-2 py-1 text-xs font-mono rounded">
              ⚠️ {syncError}
            </div>
          )}

          <div className="flex gap-2">
            <Input
              value={newTodo}
              onChange={(e) => setNewTodo(e.target.value)}
              placeholder="Add brutal todo..."
              className="flex-1 border-2 border-black font-mono text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  void addTodo()
                }
              }}
            />
            <Button
              onClick={() => void addTodo()}
              size="sm"
              className="border-2 border-black shadow-[2px_2px_0px_0px_#000] bg-green-400 hover:bg-green-500 text-black font-black"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <ScrollArea className="flex-1 min-h-0">
            <div className="space-y-2">
              {loading ? (
                <div className="text-center text-gray-500 font-mono">Loading todos...</div>
              ) : todos.length === 0 ? (
                <div className="text-center text-gray-500 font-mono text-sm">
                  No todos yet. Add one above! 💪
                </div>
              ) : (
                todos.map((todo) => (
                  <div
                    key={todo.id ?? todo.serverId}
                    className="flex items-center gap-2 p-2 border-2 border-black hover:bg-gray-50 bg-white"
                  >
                    <Checkbox
                      checked={todo.completed}
                      onCheckedChange={() => {
                        if (todo.id) {
                          void toggleTodo(todo.id)
                        }
                      }}
                      className="border-2 border-black"
                    />
                    <span
                      className={`flex-1 text-sm font-mono ${
                        todo.completed ? "line-through text-gray-500" : "text-black"
                      }`}
                    >
                      {todo.text}
                    </span>

                    <div className="flex items-center gap-1">
                      {todo.syncStatus === 'error' && (
                        <div
                          className="w-2 h-2 bg-red-500 rounded-full"
                          title="Sync failed - will retry automatically"
                        />
                      )}

                      <Button
                        onClick={() => {
                          if (todo.id) {
                            void deleteTodo(todo.id)
                          }
                        }}
                        size="sm"
                        className="h-6 w-6 p-0 hover:bg-red-400"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  )
}
