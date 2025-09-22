import React, { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { LoginForm } from './LoginForm'
import { SignUpForm } from './SignUpForm'
import { Button } from '../ui/button'
import Star11 from '@/components/stars/s11'

export const AuthContainer: React.FC = () => {
  const [isSignUp, setIsSignUp] = useState(false)

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-200 via-red-200 to-pink-200 flex items-center justify-center p-4">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-10 left-10 w-20 h-20 bg-blue-400 rotate-45 opacity-70"></div>
        <div className="absolute top-32 right-20 w-16 h-16 bg-green-400 rotate-12 opacity-60"></div>
        <div className="absolute bottom-20 left-32 w-24 h-24 bg-purple-400 -rotate-12 opacity-50"></div>
        <div className="absolute bottom-40 right-10 w-14 h-14 bg-yellow-400 rotate-45 opacity-80"></div>
      </div>

      <Card className="w-full max-w-md relative z-10 bg-white border-4 border-black shadow-[8px_8px_0px_0px_#000]">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-black text-black mb-2 flex items-center justify-center gap-2">
            <Star11 size={32} color="#000" />
            BRUTAL NOTE
          </CardTitle>
          <CardDescription className="text-lg font-bold text-gray-700">
            {isSignUp ? 'CREATE YOUR ACCOUNT' : 'WELCOME BACK'}
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {isSignUp ? <SignUpForm /> : <LoginForm />}
          
          <div className="text-center">
            <div className="text-sm font-bold text-gray-600 mb-2">
              {isSignUp ? 'Already have an account?' : "Don't have an account?"}
            </div>
            <Button
              variant="outline"
              onClick={() => setIsSignUp(!isSignUp)}
              className="font-bold border-2 border-black shadow-[4px_4px_0px_0px_#000] hover:shadow-[2px_2px_0px_0px_#000] hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
            >
              {isSignUp ? 'SIGN IN INSTEAD' : 'CREATE ACCOUNT'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
