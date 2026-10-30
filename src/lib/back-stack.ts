'use client'

// Qalb — View-level Back Handlers (v0.3.1)
// ─────────────────────────────────────────────────────────────────
// User rule: "har screen par back kaam kare, aur home tak le aaye."
//
// Shell ka native back chain (qalb-shell.tsx) modals/sheets handle karta
// hai — par views ke ANDAR ke drill-in screens (home search results,
// calendar ke sub-tabs, profile name-editing) ka apna state hota hai jo
// chain se door tha. Ab har view apna back-handler yahan register karta
// hai; shell back dabne par SIRF active tab ke handlers chalata hai.
//
// Handler true return kare = back handle ho gaya (chain ruk jaye).
// false = is view me kuch back karne ko nahi (chain aage badhegi).

import { useEffect, useRef } from 'react'
import { create } from 'zustand'

export type BackTab = 'home' | 'player' | 'reels' | 'calendar' | 'profile'

type BackHandler = () => boolean

interface BackStackState {
  /** id → { tab, fn } — views apne handlers yahan rakhte hain */
  handlers: Map<string, { tab: BackTab; fn: BackHandler }>
  register: (id: string, tab: BackTab, fn: BackHandler | null) => void
  /** active tab ke handlers chalao — kisi ne handle kiya to true */
  handleBack: (tab: BackTab) => boolean
}

export const useBackStack = create<BackStackState>((set, get) => ({
  handlers: new Map(),
  register: (id, tab, fn) => {
    const next = new Map(get().handlers)
    if (fn) next.set(id, { tab, fn })
    else next.delete(id)
    set({ handlers: next })
  },
  handleBack: (tab) => {
    for (const { tab: hTab, fn } of get().handlers.values()) {
      if (hTab !== tab) continue
      try {
        if (fn()) return true
      } catch {
        /* handler me koi gadbad → chain aage badhe */
      }
    }
    return false
  },
}))

/**
 * React hook — mount par handler register, unmount par hatao.
 * fn ka LATEST closure har call par use hota hai (ref se), isliye
 * dependencies ki chinta nahi — hook ko sirf ek dafa lagana hai.
 */
export function useViewBackHandler(id: string, tab: BackTab, fn: BackHandler) {
  const fnRef = useRef(fn)
  fnRef.current = fn
  useEffect(() => {
    useBackStack.getState().register(id, tab, () => fnRef.current())
    return () => {
      useBackStack.getState().register(id, tab, null)
    }
  }, [id, tab])
}
