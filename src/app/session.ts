import { createContext, useContext } from 'react'
import type { AuthenticatedUser, Capability } from './api'

export type Session = {
  user: AuthenticatedUser
  capabilities: ReadonlySet<Capability>
  can: (capability: Capability) => boolean
}

export function createSession(user: AuthenticatedUser, capabilities: readonly Capability[]): Session {
  const granted = new Set(capabilities)
  return { user, capabilities: granted, can: (capability) => granted.has(capability) }
}

export const SessionContext = createContext<Session | null>(null)

/** The signed-in session. Views are only rendered inside the authenticated shell, so it is always present there. */
export function useSession(): Session {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useSession must be used inside SessionContext.Provider')
  return session
}

/** Convenience hook for hiding actions the server would refuse. */
export function useCan(): Session['can'] {
  return useSession().can
}
