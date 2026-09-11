import { createContext, useContext } from 'react'
import type { RelayState } from './useRelayState'

export const RelayContext = createContext<RelayState | null>(null)

export function useRelay(): RelayState {
  const value = useContext(RelayContext)

  if (!value) {
    throw new Error('useRelay must be called inside a RelayContext provider.')
  }

  return value
}
