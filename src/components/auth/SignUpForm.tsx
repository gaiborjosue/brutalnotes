import React, { useState } from 'react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { useAuth } from '../../contexts/AuthContext'

export const SignUpForm: React.FC = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  
  const { signUp } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess(false)

    if (password.length < 6) {
      setError('Password must be at least 6 characters long')
      setLoading(false)
      return
    }

    const { error } = await signUp(email, password, fullName)
    
    if (error) {
      setError(error.message)
    } else {
      setSuccess(true)
    }
    
    setLoading(false)
  }

  if (success) {
    return (
      <div className="text-center space-y-4">
        <div className="bg-green-100 border-4 border-green-500 p-4 rounded-none">
          <div className="text-4xl mb-2">🎉</div>
          <h3 className="font-black text-green-800 text-lg mb-2">ACCOUNT CREATED!</h3>
          <p className="text-green-700 font-bold text-sm">
            Check your email for a confirmation link to complete your registration.
          </p>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="fullName" className="text-sm font-black text-black">
          FULL NAME
        </Label>
        <Input
          id="fullName"
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          className="border-4 border-black shadow-[4px_4px_0px_0px_#000] font-bold"
          placeholder="John Doe"
        />
      </div>

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
          minLength={6}
        />
        <p className="text-xs font-bold text-gray-600">
          Must be at least 6 characters long
        </p>
      </div>

      {error && (
        <div className="bg-red-100 border-4 border-red-500 p-3 rounded-none">
          <p className="text-red-800 font-bold text-sm">{error}</p>
        </div>
      )}

      <Button
        type="submit"
        disabled={loading}
        className="w-full bg-green-400 hover:bg-green-500 text-black font-black text-lg py-3 border-4 border-black shadow-[6px_6px_0px_0px_#000] hover:shadow-[3px_3px_0px_0px_#000] hover:translate-x-[3px] hover:translate-y-[3px] transition-all disabled:opacity-50"
      >
        {loading ? 'CREATING ACCOUNT...' : 'CREATE ACCOUNT 🔥'}
      </Button>
    </form>
  )
}
