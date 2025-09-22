/**
 * Debug utility to test Supabase note creation
 * Run this in the browser console to diagnose the 406 error
 */

import { NoteService } from '../lib/database-service'

export async function debugNoteCreation() {
  console.log('🔍 Testing note creation...')
  
  try {
    // Test 1: Simple note creation (no parent)
    console.log('Test 1: Creating note without parent...')
    const result1 = await NoteService.createNote(
      'Debug Test Note',
      'Test content',
      'debug-test-note.lexical',
      false, // not a folder
      undefined // no parent
    )
    
    console.log('Test 1 result:', result1)
    
    if (result1.success) {
      console.log('✅ Basic note creation works!')
      
      // Test 2: Create a folder first, then a note inside it
      console.log('Test 2: Creating folder...')
      const folderResult = await NoteService.createNote(
        'Debug Test Folder',
        '',
        'debug-test-folder',
        true, // is a folder
        undefined // no parent
      )
      
      console.log('Test 2 folder result:', folderResult)
      
      if (folderResult.success && folderResult.data) {
        console.log('Test 3: Creating note inside folder...')
        const result3 = await NoteService.createNote(
          'Debug Child Note',
          'Child content',
          'debug-test-folder/child-note.lexical',
          false, // not a folder
          folderResult.data.clientId // parent client ID
        )
        
        console.log('Test 3 result:', result3)
        
        if (result3.success) {
          console.log('✅ All tests passed! Note creation is working.')
        } else {
          console.error('❌ Test 3 failed (child note creation):', result3.error)
        }
      } else {
        console.error('❌ Test 2 failed (folder creation):', folderResult.error)
      }
    } else {
      console.error('❌ Test 1 failed (basic note creation):', result1.error)
    }
  } catch (error) {
    console.error('❌ Debug test threw exception:', error)
  }
}

// Also test authentication
export async function debugAuth() {
  try {
    const { supabase } = await import('../lib/supabase')
    const { data: user, error } = await supabase.auth.getUser()
    
    console.log('🔍 Authentication status:', { user: user?.user, error })
    
    if (user?.user) {
      console.log('✅ User is authenticated:', user.user.email)
      return true
    } else {
      console.error('❌ User is not authenticated:', error)
      return false
    }
  } catch (error) {
    console.error('❌ Auth check failed:', error)
    return false
  }
}

// Test database permissions
export async function debugDatabaseAccess() {
  try {
    const { supabase } = await import('../lib/supabase')
    
    // Test if we can read from notes table
    console.log('🔍 Testing read access to notes table...')
    const { data, error } = await supabase
      .from('notes')
      .select('id, title')
      .limit(1)
    
    console.log('Read test result:', { data, error })
    
    if (error) {
      console.error('❌ Cannot read from notes table:', error)
      return false
    } else {
      console.log('✅ Can read from notes table')
      return true
    }
  } catch (error) {
    console.error('❌ Database access test failed:', error)
    return false
  }
}

// Run all debug tests
export async function runAllDebugTests() {
  console.log('🚀 Running all debug tests...')
  
  const authOk = await debugAuth()
  if (!authOk) {
    console.error('❌ Authentication failed, stopping tests')
    return
  }
  
  const dbOk = await debugDatabaseAccess()
  if (!dbOk) {
    console.error('❌ Database access failed, stopping tests')
    return
  }
  
  await debugNoteCreation()
}

// For console usage
if (typeof window !== 'undefined') {
  ;(window as any).debugBrutalNotes = {
    debugAuth,
    debugDatabaseAccess,
    debugNoteCreation,
    runAllDebugTests
  }
  
  console.log('🔧 Debug tools available: window.debugBrutalNotes')
}
