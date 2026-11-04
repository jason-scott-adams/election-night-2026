import { expect, test } from 'claude-code/testing'

import { clockCT, milestones, summarize, type FeedRace } from '../hooks/summarize'

const cand = (lastName: string, party: string, pct: number, votes: number, winner = false) => ({
  lastName,
  candidatePartyCode: party,
  votePercentNum: pct,
  voteNum: votes,
  winner,
})

const house: FeedRace[] = [
  { ecKey: '2026-HG-KS-3', contestType: 'HG', percentReporting: 40, totalVote: 100,
    candidates: [cand('Davids', 'D', 55, 55), cand('Jenkins', 'R', 43, 43), cand('Hohe', 'L', 2, 2)] },
  { ecKey: '2026-HG-KS-1', contestType: 'HG', percentReporting: 99, totalVote: 100,
    candidates: [cand('Reinhold', 'D', 30, 30), cand('Mann', 'R', 70, 70, true)] },
  { ecKey: '2026-HG-XX-1', contestType: 'HG', percentReporting: 0, totalVote: 0,
    candidates: [cand('A', 'D', 0, 0), cand('B', 'R', 0, 0)] },
  { ecKey: '2026-HQ-TX-18', contestType: 'HQ', percentReporting: 0, totalVote: 0,
    candidates: [cand('C', 'D', 0, 0, true)] },
]
const senate: FeedRace[] = [
  { ecKey: '2026-SG-KS', contestType: 'SG', percentReporting: 10, totalVote: 10,
    candidates: [cand('Hamilton', 'D', 40, 4), cand('Marshall', 'R', 60, 6)] },
]
const gov: FeedRace[] = [
  { ecKey: '2026-GG-KS', contestType: 'GG', percentReporting: 100, totalVote: 10,
    candidates: [cand('Holscher', 'D', 50.4, 504, true), cand('Masterson', 'R', 49.6, 496)] },
]

test('called, leading and uncounted races are kept apart', async () => {
  const s = summarize(house, senate, gov, 0)

  // The House special (HQ) is left out of the 435.
  expect(s.house.won).toEqual({ D: 0, R: 1, O: 0 })
  expect(s.house.leading).toEqual({ D: 1, R: 0, O: 0 })
  expect(s.house.untouched).toBe(1)
  // Holdovers are added to what is decided tonight; a lead is not a win.
  expect(s.senate.won).toEqual({ D: 34, R: 31, O: 0 })
  expect(s.senate.leading.R).toBe(1)
  expect(s.gov.won).toEqual({ D: 7, R: 8, O: 0 })
})

test('Kansas races come in spotlight order with winners marked', async () => {
  const s = summarize(house, senate, gov, 0)

  expect(s.ks.map(r => r.label)).toEqual(['Governor', 'KS-3 (KC metro)', 'US Senate', 'KS-1'])
  expect(s.ks[0]?.called).toBe(true)
  expect(s.ks[1]?.called).toBe(false)
  expect(s.ks[1]?.candidates[0]?.name).toBe('Davids')
})

test('toasts fire for Kansas calls and clinched control only', async () => {
  const m = milestones(summarize(house, senate, gov, 0))

  expect([...m.keys()].sort()).toEqual(['ks:2026-GG-KS', 'ks:2026-HG-KS-1'])
  expect(m.get('ks:2026-GG-KS')).toBe('Kansas Governor: Holscher (D) wins')
})

test('times read in Central time', async () => {
  // 2026-11-04 02:05 UTC is 8:05 pm CST on Nov 3.
  expect(clockCT(Date.UTC(2026, 10, 4, 2, 5))).toBe('8:05 pm')
})

test('the pane draws the chambers and Kansas from a stored snapshot', async ($, on) => {
  const snap = summarize(house, senate, gov, Date.UTC(2026, 10, 4, 2, 5))
  const stored: Record<string, unknown> = {
    snapshot: snap,
    problem: null,
    seen: [],
    ended: false,
  }
  const tags: Record<string, string> = {
    snapshot: 'snap-1',
    problem: 'problem-1',
    seen: 'seen-1',
    ended: 'ended-1',
  }
  on('state.get', (_, e) => {
    const key = (e as { key: string }).key

    return { value: { value: { shape: tags[key], value: stored[key] }, version: 1 } }
  })
  on('clock.now', () => ({ value: Date.UTC(2026, 10, 4, 2, 6) }))

  const ui = await $.ui.mount({
    plugin: 'election-night',
    component: 'Pane',
    requestId: 'election-night',
    surface: 'terminal',
    props: {
      title: 'Election night',
      isFocused: false,
      bodyColumns: 50,
      placement: 'dock',
      scroll: { offset: 0, bodyRows: 40 },
      view: {},
    },
  })

  expect(await ui.find({ type: 'Text', text: /HOUSE/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /KANSAS/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /Holscher/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /updated 8:05 pm CT/ })).toBeTruthy()
  await ui.unmount()
})
