import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Chamber, KsRace, Party } from '../types'
import {
  EXPIRES_AT,
  MAJORITY,
  type FeedRace,
  clockCT,
  milestones,
  summarize,
} from './summarize'

const PANE = 'election-night'
const TITLE = 'Election night'
const POLL_MS = 3 * 60_000
const STALE_MS = 10 * 60_000
const FEED = 'https://politics.api.cnn.io/results/national-races/2026-'

const snapshot = atom({ plugin: 'election-night', key: 'snapshot' } as const, null, {
  shape: 'snap-1',
})
const problem = atom({ plugin: 'election-night', key: 'problem' } as const, null, {
  shape: 'problem-1',
})
const seen = atom({ plugin: 'election-night', key: 'seen' } as const, [], {
  shape: 'seen-1',
})
const ended = atom({ plugin: 'election-night', key: 'ended' } as const, false, {
  shape: 'ended-1',
})

const COLOR: Record<Party, string> = { D: '#3b82f6', R: '#ef4444', O: '#a855f7' }

let busy = false
let timer: { cancel: () => void } | undefined

async function getFeed($: EngineInterface, kind: 'HG' | 'SG' | 'GG'): Promise<FeedRace[]> {
  const res = await $.http.fetch(`${FEED}${kind}.json`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (election-night pane)' },
  })
  if (!res.ok) throw new Error(`${kind} feed answered ${res.status}`)
  const data: unknown = JSON.parse(res.text)
  if (!Array.isArray(data)) throw new Error(`${kind} feed was not a list`)

  return data as FeedRace[]
}

async function finish($: EngineInterface) {
  timer?.cancel()
  timer = undefined
  await update($, ended, () => true)
}

async function poll($: EngineInterface) {
  if (busy) return
  busy = true
  try {
    const now = await $.clock.now()
    if (now >= EXPIRES_AT) {
      await finish($)
      return
    }
    const [house, senate, gov] = await Promise.all([
      getFeed($, 'HG'),
      getFeed($, 'SG'),
      getFeed($, 'GG'),
    ])
    const snap = summarize(house, senate, gov, now)
    const before = await read($, snapshot)
    const already = new Set(await read($, seen))
    const events = milestones(snap)
    // The first load of the night seeds what is already true, quietly.
    const fresh = before ? [...events].filter(([k]) => !already.has(k)) : []
    await update($, seen, () => [...new Set([...already, ...events.keys()])])
    await update($, snapshot, () => snap)
    await update($, problem, () => null)
    for (const [, text] of fresh.slice(0, 3)) $.ui.toast(text, { timeoutMs: 10_000 })
    if (fresh.length > 3) $.ui.toast(`and ${fresh.length - 3} more`, { timeoutMs: 10_000 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const at = await $.clock.now()
    await update($, problem, () => ({ at, message }))
  } finally {
    busy = false
  }
}

function start($: EngineInterface) {
  timer?.cancel()
  timer = $.clock.every(POLL_MS, () => void poll($))
  void poll($)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'election',
      description: 'Open the election night pane and refresh the results now',
    })
    const now = await $.clock.now()
    if (now < EXPIRES_AT && !(await read($, ended))) {
      void $.ui.open({ id: PANE, title: TITLE })
      start($)
    }

    return next(e)
  })

  on('command.run', { command: 'election' }, async $ => {
    const now = await $.clock.now()
    if (now >= EXPIRES_AT) {
      await finish($)
      await $.ui.open({ id: PANE, title: TITLE })
      return { text: 'Election night is over, so the pane has stopped updating.' }
    }
    await $.ui.open({ id: PANE, title: TITLE })
    start($)

    return { text: 'Election pane open. Refreshing results now.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const snap = await read($, snapshot)
    const trouble = await read($, problem)
    const isOver = await read($, ended)
    const width = Math.max(24, Math.min(60, (e.props.bodyColumns ?? 40) - 2))

    const bar = (c: Chamber) => {
      const scale = (n: number) => Math.round((n / c.total) * width)
      const parts: [string, string, number][] = [
        ['█', COLOR.D, scale(c.won.D)],
        ['▒', COLOR.D, scale(c.leading.D)],
        ['█', COLOR.O, scale(c.won.O)],
        ['▒', COLOR.O, scale(c.leading.O)],
        ['·', 'subtle', 0],
        ['▒', COLOR.R, scale(c.leading.R)],
        ['█', COLOR.R, scale(c.won.R)],
      ]
      const used = parts.reduce((s, p) => s + p[2], 0)
      const gap = parts[4]
      if (gap) gap[2] = Math.max(0, width - used)

      return (
        <Text wrap="truncate">
          {parts
            .filter(p => p[2] > 0)
            .map(([ch, color, n]) => (
              <Text color={color}>{ch.repeat(n)}</Text>
            ))}
        </Text>
      )
    }

    const counts = (c: Chamber) => {
      const lead = (p: Party) => (c.leading[p] ? ` +${c.leading[p]} ahead` : '')
      const left = c.total - c.won.D - c.won.R - c.won.O

      return (
        <Text>
          <Text color={COLOR.D} weight="bold">D {c.won.D}</Text>
          <Text dimColor>{lead('D')}</Text>
          {c.won.O + c.leading.O > 0 && (
            <Text>
              {'  '}
              <Text color={COLOR.O} weight="bold">Ind {c.won.O}</Text>
              <Text dimColor>{lead('O')}</Text>
            </Text>
          )}
          {'  '}
          <Text color={COLOR.R} weight="bold">R {c.won.R}</Text>
          <Text dimColor>{lead('R')}</Text>
          <Text dimColor>{`  · ${left} uncalled`}</Text>
        </Text>
      )
    }

    const chamber = (name: string, rule: string, c: Chamber) => (
      <Box flexDirection="column" marginBottom={1}>
        <Text>
          <Text weight="bold">{name}</Text>
          <Text dimColor>{`  ${rule}`}</Text>
        </Text>
        {bar(c)}
        {counts(c)}
      </Box>
    )

    const pctIn = (r: KsRace) => (r.called ? 'CALLED' : `${Math.round(r.pctIn)}% in`)
    const partyColor = (p: string) => COLOR[p === 'D' || p === 'R' ? p : 'O']

    const featured = (r: KsRace) => (
      <Box flexDirection="column" marginBottom={1}>
        <Text>
          <Text weight="bold">{r.label}</Text>
          <Text dimColor={!r.called} color={r.called ? 'success' : undefined}>
            {`  ${pctIn(r)}`}
          </Text>
        </Text>
        {r.candidates.map(c => (
          <Text>
            {c.winner ? '✓ ' : '  '}
            <Text color={partyColor(c.party)}>{`${c.name} (${c.party})`.padEnd(22)}</Text>
            <Text weight={c.winner ? 'bold' : 'regular'}>{`${c.pct.toFixed(1)}%`.padStart(6)}</Text>
          </Text>
        ))}
      </Box>
    )

    const compact = (r: KsRace) => {
      const top = r.candidates.slice(0, 2)

      return (
        <Text wrap="truncate">
          <Text weight="bold">{r.label.padEnd(10)}</Text>
          {top.map((c, i) => (
            <Text>
              {i > 0 ? ' · ' : ''}
              {c.winner ? '✓' : ''}
              <Text color={partyColor(c.party)}>{`${c.name} ${c.party}`}</Text>
              {` ${Math.round(c.pct)}`}
            </Text>
          ))}
          <Text dimColor={!r.called} color={r.called ? 'success' : undefined}>
            {`  ${pctIn(r)}`}
          </Text>
        </Text>
      )
    }

    const now = await $.clock.now()
    const isStale = !!snap && now - snap.fetchedAt > STALE_MS

    return (
      <Box flexDirection="column">
        {isOver && (
          <Box marginBottom={1}>
            <Text color="warning">
              Election night is over. This pane has stopped updating, and the numbers below are final as of the last check.
            </Text>
          </Box>
        )}
        {!snap && !trouble && <Text dimColor>Loading results from CNN…</Text>}
        {snap && chamber('HOUSE', `${MAJORITY.house} to win`, snap.house)}
        {snap &&
          chamber(
            'SENATE',
            `D needs ${MAJORITY.senateD} · R needs ${MAJORITY.senateR} (VP tiebreak)`,
            snap.senate,
          )}
        {snap && chamber('GOVERNORS', 'all 50 states', snap.gov)}
        {snap && (
          <Box flexDirection="column" marginBottom={1}>
            <Text weight="bold" color="claude">
              {'━━ KANSAS ' + '━'.repeat(Math.max(0, width - 10))}
            </Text>
            {snap.ks.filter(r => r.featured).map(featured)}
            {snap.ks.filter(r => !r.featured).map(compact)}
          </Box>
        )}
        {trouble && (
          <Text color="warning">
            {`⚠ Feed check failed at ${clockCT(trouble.at)} CT (${trouble.message}).`}
            {snap ? ` Showing ${clockCT(snap.fetchedAt)} numbers.` : ' Retrying in 3 min.'}
          </Text>
        )}
        {isStale && !trouble && (
          <Text color="warning">{`⚠ No fresh data since ${clockCT(snap.fetchedAt)} CT.`}</Text>
        )}
        {snap && (
          <Text dimColor>
            {`Source: CNN · updated ${clockCT(snap.fetchedAt)} CT · every 3 min · ▒ = ahead, not called`}
          </Text>
        )}
      </Box>
    )
  })
}
