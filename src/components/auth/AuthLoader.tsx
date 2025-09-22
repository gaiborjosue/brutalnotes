import React from 'react'

export const AuthLoader: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-200 via-red-200 to-pink-200 flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block w-20 h-20 bg-black border-4 border-black shadow-[8px_8px_0px_0px_#fff] animate-bounce mb-4">
          <div className="w-full h-full bg-white border-2 border-black flex items-center justify-center">
            <span className="text-2xl font-black">🔥</span>
          </div>
        </div>
        <h2 className="text-2xl font-black text-black">BRUTAL NOTE</h2>
        <p className="text-lg font-bold text-gray-700 mt-2">Loading...</p>
      </div>
    </div>
  )
}
