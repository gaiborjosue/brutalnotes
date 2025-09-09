import React, { useState } from 'react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { useAuth } from '../../contexts/AuthContext'

export const LoginForm: React.FC = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  
  const { signIn } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await signIn(email, password)
    
    if (error) {
      setError(error.message)
    }
    
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email" className="text-sm font-black text-black">
          EMAIL ADDRESS
        </Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="border-4 border-black shadow-[4px_4px_0px_0px_#000] font-bold"
          placeholder="your.email@example.com"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password" className="text-sm font-black text-black">
          PASSWORD
        </Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="border-4 border-black shadow-[4px_4px_0px_0px_#000] font-bold"
          placeholder="••••••••"
        />
      </div>

      {error && (
        <div className="bg-red-100 border-4 border-red-500 p-3 rounded-none">
          <p className="text-red-800 font-bold text-sm">{error}</p>
        </div>
      )}

      <Button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-400 hover:bg-blue-500 text-black font-black text-lg py-3 border-4 border-black shadow-[6px_6px_0px_0px_#000] hover:shadow-[3px_3px_0px_0px_#000] hover:translate-x-[3px] hover:translate-y-[3px] transition-all disabled:opacity-50"
      >
        {loading ? 'SIGNING IN...' : 'SIGN IN 🚀'}
      </Button>
    </form>
  )
}
