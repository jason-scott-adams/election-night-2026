import type { Chamber, KsRace, Party, Snapshot } from '../types'

// Seats not on the ballot on 2026-11-03, by the party that holds them.
// Senate: 65 seats not up (Democrats count King and Sanders, who caucus with them).
// Governors: DE KY NJ NC VA WA (D) and IN LA MS MO MT ND UT WV (R).
export const HOLDOVER = {
  senate: { D: 34, R: 31, O: 0 },
  gov: { D: 6, R: 8, O: 0 },
} as const

export const MAJORITY = { house: 218, senateD: 51, senateR: 50 } as const

type FeedCandidate = {
  lastName?: string
  fullName?: string
  candidatePartyCode?: string
  votePercentNum?: number
  voteNum?: number
  winner?: boolean
}

export type FeedRace = {
  ecKey?: string
  contestType?: string
  stateAbbreviation?: string
  percentReporting?: number
  totalVote?: number
  candidates?: FeedCandidate[]
}

const KS_ORDER: { key: string; label: string; featured: boolean }[] = [
  { key: '2026-GG-KS', label: 'Governor', featured: true },
  { key: '2026-HG-KS-3', label: 'KS-3 (KC metro)', featured: true },
  { key: '2026-SG-KS', label: 'US Senate', featured: false },
  { key: '2026-HG-KS-1', label: 'KS-1', featured: false },
  { key: '2026-HG-KS-2', label: 'KS-2', featured: false },
  { key: '2026-HG-KS-4', label: 'KS-4', featured: false },
]

export function partyOf(code: string | undefined): Party {
  return code === 'D' ? 'D' : code === 'R' ? 'R' : 'O'
}

function tally(
  races: FeedRace[],
  base: { D: number; R: number; O: number },
  total: number,
): Chamber {
  const won = { D: base.D, R: base.R, O: base.O }
  const leading = { D: 0, R: 0, O: 0 }
  let untouched = 0
  for (const race of races) {
    const cands = race.candidates ?? []
    const winner = cands.find(c => c.winner === true)
    if (winner) {
      won[partyOf(winner.candidatePartyCode)] += 1
      continue
    }
    const counted = (race.totalVote ?? 0) > 0
    if (!counted || cands.length === 0) {
      untouched += 1
      continue
    }
    const top = [...cands].sort((a, b) => (b.voteNum ?? 0) - (a.voteNum ?? 0))[0]
    leading[partyOf(top?.candidatePartyCode)] += 1
  }

  return { won, leading, untouched, total }
}

function kansas(all: FeedRace[]): KsRace[] {
  const byKey = new Map(all.map(r => [r.ecKey, r]))
  const out: KsRace[] = []
  for (const slot of KS_ORDER) {
    const race = byKey.get(slot.key)
    if (!race) continue
    const candidates = (race.candidates ?? [])
      .map(c => ({
        name: c.lastName || c.fullName || '?',
        party: c.candidatePartyCode ?? '?',
        pct: c.votePercentNum ?? 0,
        winner: c.winner === true,
      }))
      .sort((a, b) => b.pct - a.pct)
    out.push({
      key: slot.key,
      label: slot.label,
      featured: slot.featured,
      pctIn: race.percentReporting ?? 0,
      called: candidates.some(c => c.winner),
      candidates,
    })
  }

  return out
}

export function summarize(
  house: FeedRace[],
  senate: FeedRace[],
  gov: FeedRace[],
  fetchedAt: number,
): Snapshot {
  // Regular House seats only: a special (contestType HQ) fills a seat until January.
  const regularHouse = house.filter(r => r.contestType === 'HG')

  return {
    house: tally(regularHouse, { D: 0, R: 0, O: 0 }, 435),
    senate: tally(senate, HOLDOVER.senate, 100),
    gov: tally(gov, HOLDOVER.gov, 50),
    ks: kansas([...house, ...senate, ...gov]),
    fetchedAt,
  }
}

/** Keys of events worth a toast: Kansas calls and chamber control clinched. */
export function milestones(s: Snapshot): Map<string, string> {
  const out = new Map<string, string>()
  for (const race of s.ks) {
    const w = race.candidates.find(c => c.winner)
    if (w) out.set(`ks:${race.key}`, `Kansas ${race.label}: ${w.name} (${w.party}) wins`)
  }
  if (s.house.won.D >= MAJORITY.house) out.set('ctl:house:D', 'Democrats clinch the House')
  if (s.house.won.R >= MAJORITY.house) out.set('ctl:house:R', 'Republicans clinch the House')
  if (s.senate.won.D >= MAJORITY.senateD) out.set('ctl:senate:D', 'Democrats clinch the Senate')
  if (s.senate.won.R >= MAJORITY.senateR) out.set('ctl:senate:R', 'Republicans clinch the Senate')

  return out
}

// Kansas City is on CST (UTC-6) for the whole window this mod runs.
export function clockCT(ms: number): string {
  const d = new Date(ms - 6 * 3600_000)
  const h24 = d.getUTCHours()
  const h = h24 % 12 === 0 ? 12 : h24 % 12
  const m = String(d.getUTCMinutes()).padStart(2, '0')

  return `${h}:${m} ${h24 < 12 ? 'am' : 'pm'}`
}

/** 2026-11-04 7:00 pm CST. */
export const EXPIRES_AT = Date.UTC(2026, 10, 5, 1, 0, 0)
