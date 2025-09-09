import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Plus, Trash2 } from "lucide-react"
import Star10 from "@/components/stars/s10"
import { TodoService } from "@/lib/database-service"
import type { Todo } from "@/lib/types"

export function TodoPanel() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [newTodo, setNewTodo] = useState("")
  const [loading, setLoading] = useState(true)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [syncing, setSyncing] = useState(false)
  const [networkError, setNetworkError] = useState<string | null>(null)

  // Load todos from database on component mount
  useEffect(() => {
    const loadTodos = async () => {
      const result = await TodoService.getAllTodos()
      if (result.success && result.data) {
        setTodos(result.data)
      } else {
        console.error('Failed to load todos:', result.error)
      }
      setLoading(false)
    }
    
    loadTodos()
  }, [])

  // Listen for online/offline status and sync events
  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    
    // Listen for sync completion to refresh UI
    const handleSyncCompleted = async () => {
      console.log('🔄 Sync completed, refreshing todos...')
      const result = await TodoService.getAllTodos()
      if (result.success && result.data) {
        console.log(`📋 Refreshed ${result.data.length} todos from database`)
        setTodos(result.data)
      } else {
        console.error('Failed to refresh todos after sync:', result.error)
      }
    }
    
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('todosSynced', handleSyncCompleted)
    
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('todosSynced', handleSyncCompleted)
    }
  }, [])

  // Manual sync function
  const handleManualSync = async () => {
    if (!isOnline) return
    
    setSyncing(true)
    setNetworkError(null)
    
    try {
      console.log('🔄 Manual sync started...')
      const result = await TodoService.syncTodos()
      if (result.success) {
        console.log('✅ Manual sync successful, refreshing UI...')
        // Force refresh todos after manual sync
        const todosResult = await TodoService.getAllTodos()
        if (todosResult.success && todosResult.data) {
          console.log(`📋 Manual sync: refreshed ${todosResult.data.length} todos`)
          setTodos(todosResult.data)
        }
      } else {
        console.error('❌ Manual sync failed:', result.error)
        setNetworkError(result.error || 'Sync failed')
        // Clear error after 5 seconds
        setTimeout(() => setNetworkError(null), 5000)
      }
    } catch (error) {
      console.error('Manual sync failed:', error)
      setNetworkError('Network error occurred')
      setTimeout(() => setNetworkError(null), 5000)
    } finally {
      setSyncing(false)
    }
  }

  const addTodo = async () => {
    if (newTodo.trim()) {
      const result = await TodoService.addTodo(newTodo.trim())
      if (result.success && result.data) {
        setTodos([result.data, ...todos])
        setNewTodo("")
      } else {
        console.error('Failed to add todo:', result.error)
      }
    }
  }

  const toggleTodo = async (id: number) => {
    const result = await TodoService.toggleTodo(id)
    if (result.success && result.data) {
      setTodos(todos.map(todo => 
        todo.id === id ? result.data! : todo
      ))
    } else {
      console.error('Failed to toggle todo:', result.error)
    }
  }

  const deleteTodo = async (id: number) => {
    const result = await TodoService.deleteTodo(id)
    if (result.success) {
      setTodos(todos.filter(todo => todo.id !== id))
    } else {
      console.error('Failed to delete todo:', result.error)
    }
  }

  return (
    <Card className="h-full border-4 border-black shadow-[4px_4px_0px_0px_#000] bg-white">
      <CardHeader className="border-b-4 border-black bg-yellow-300 p-3">
        <CardTitle className="text-lg font-black text-black flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Star10 size={20} color="#000" />
            TODOS
          </div>

        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 h-[calc(100%-4rem)]">
        <div className="space-y-3 h-full flex flex-col">
          {/* Network error display */}
          {networkError && (
            <div className="bg-red-100 border-2 border-red-500 text-red-700 px-2 py-1 text-xs font-mono rounded">
              ⚠️ {networkError}
            </div>
          )}
          
          {/* Add new todo */}
          <div className="flex gap-2">
            <Input
              value={newTodo}
              onChange={(e) => setNewTodo(e.target.value)}
              placeholder="Add brutal todo..."
              className="flex-1 border-2 border-black font-mono text-sm"
              onKeyPress={(e) => e.key === 'Enter' && addTodo()}
            />
            <Button
              onClick={addTodo}
              size="sm"
              className="border-2 border-black shadow-[2px_2px_0px_0px_#000] bg-green-400 hover:bg-green-500 text-black font-black"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {/* Todo list */}
          <ScrollArea className="flex-1">
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
                    key={todo.id}
                    className="flex items-center gap-2 p-2 border-2 border-black hover:bg-gray-50 bg-white"
                  >
                    <Checkbox
                      checked={todo.completed}
                      onCheckedChange={() => {
                        if (todo.id) toggleTodo(todo.id)
                      }}
                      className="border-2 border-black"
                    />
                    <span
                      className={`flex-1 text-sm font-mono ${
                        todo.completed
                          ? "line-through text-gray-500"
                          : "text-black"
                      }`}
                    >
                      {todo.text}
                    </span>
                    
                    {/* Sync status indicator - only show red dot for actual errors */}
                    <div className="flex items-center gap-1">
                      {todo.syncStatus === 'error' && (
                        <div className="w-2 h-2 bg-red-500 rounded-full" title="Sync failed - will retry automatically" />
                      )}
                      
                      <Button
                        onClick={() => {
                          if (todo.id) deleteTodo(todo.id)
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
