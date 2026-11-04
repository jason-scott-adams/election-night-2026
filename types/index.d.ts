export type Party = 'D' | 'R' | 'O'

export type Chamber = {
  /** Seats already held or called, by party (holdovers included). */
  won: Record<Party, number>
  /** Uncalled races where the party leads with votes counted. */
  leading: Record<Party, number>
  /** Uncalled races with no votes counted yet. */
  untouched: number
  /** Seats in the body. */
  total: number
}

export type KsCandidate = {
  name: string
  party: string
  pct: number
  winner: boolean
}

export type KsRace = {
  key: string
  label: string
  featured: boolean
  pctIn: number
  called: boolean
  candidates: KsCandidate[]
}

export type Snapshot = {
  house: Chamber
  senate: Chamber
  gov: Chamber
  ks: KsRace[]
  fetchedAt: number
}

export type Problem = { at: number; message: string }

declare module 'claude-code' {
  interface PluginState {
    'election-night': {
      snapshot: Shaped<Snapshot | null>
      problem: Shaped<Problem | null>
      seen: Shaped<string[]>
      ended: Shaped<boolean>
    }
  }
}
