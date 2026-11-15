// Offline-замеры звукового движка: node scripts/audio-lab.mjs [seconds=60] [url] [--build] [--json] [--profile]
//   --profile  огибающая RMS по 0.5 с для каждого сценария (нарастание/спад, провалы на переходах)
//   --build  собрать изолированный снимок аудиомодулей (scripts/vite.audiolab.config.mjs) и замерить его
//            (без dev-сервера и HMR — воспроизводимо). Без --build нужен dev-сервер: url/audio-lab.html.
// Рендерит сценарии в OfflineAudioContext и печатает пик / RMS / клиппинг / NaN / щелчки / паузы /
// опоздания планировщика / отброшенные ноты / нагрузку (время рендера ÷ длительность звука).
// ONLY=<regex> — только подходящие сценарии. REPEAT=<n> — рендерить каждый сценарий n раз и печатать
// медиану нагрузки (graph/js) — одиночный замер нагрузки шумит на ±5 пп; артефакты берутся худшие из n.
import { spawn, spawnSync } from 'node:child_process'
import { chromium } from '@playwright/test'

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const secs = Number(args[0] ?? 60)
const asJson = process.argv.includes('--json')
const showProfile = process.argv.includes('--profile')
const isWin = process.platform === 'win32'
let url = args[1] ?? 'http://localhost:5173'
let server = null
if (process.argv.includes('--build')) {
  const b = spawnSync('npx', ['vite', 'build', '-c', 'scripts/vite.audiolab.config.mjs'], { shell: isWin, encoding: 'utf8' })
  if (b.status !== 0) {
    console.error(b.stdout, b.stderr)
    process.exit(1)
  }
  server = spawn('npx', ['vite', 'preview', '-c', 'scripts/vite.audiolab.config.mjs'], { shell: isWin, stdio: 'ignore' })
  url = 'http://localhost:5192/audio-lab.html'
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch(url)).ok) break
    } catch {}
    await new Promise((r) => setTimeout(r, 250))
  }
}
const stopServer = () => {
  if (!server) return
  if (isWin) spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'])
  else server.kill()
}

const amb = (o) => ({ traffic: 0, crowd: 0, birds: 0, water: 0, metro: 0, cafe: 0, office: 0, wind: 0, indoor: 0, ...o })

// ───────── путешествия: таймлайны фаз Travel State Machine (как worldStore.event) ─────────
const LOC = {
  street: amb({ crowd: 0.7, traffic: 0.95, birds: 0.05, wind: 0.2 }),
  park: amb({ birds: 0.8, crowd: 0.25, traffic: 0.2, water: 0.25, wind: 0.35 }),
  station: amb({ metro: 0.9, crowd: 0.55, wind: 0.05, indoor: 0.8 }),
  wagon: amb({ metro: 1, crowd: 0.3, indoor: 0.9 }),
  stop: amb({ traffic: 0.8, crowd: 0.3, wind: 0.25 }),
  cabin: amb({ traffic: 0.7, crowd: 0.15, indoor: 0.6 }),
  cafe: amb({ cafe: 1, crowd: 0.3, traffic: 0.08, indoor: 0.7 }),
}
/** [фаза, длительность, { loc, cues, steps, indoor }] → события; смена loc = занавес 0.65 с + кроссфейд */
function trip(list) {
  const out = []
  let at = 0
  let loc = null
  for (const [phase, duration, o = {}] of list) {
    if (o.loc && o.loc !== loc) {
      if (loc) out.push({ at: Math.max(0, at - 0.65), transition: 'begin' })
      out.push({ at, ambience: LOC[o.loc], transition: loc ? 'end' : undefined })
      loc = o.loc
    }
    const indoor = o.indoor ?? ['station', 'wagon', 'cabin', 'cafe'].includes(loc)
    out.push({ at, phase, duration, indoor, sounds: o.cues ?? [], mode: o.mode ?? null })
    if (o.steps) out.push({ at, steps: { surface: o.steps, until: at + duration } })
    at += duration
  }
  return out
}
const ALL_PHASES = [
  ['walk-street', ['footsteps']],
  ['walk-crossing', ['crosswalk-signal']],
  ['building-enter', ['building-door']],
  ['metro-vestibule', ['building-door']],
  ['metro-turnstile', ['turnstile']],
  ['metro-escalator-down', ['escalator']],
  ['metro-platform-wait', ['platform-ambience']],
  ['metro-train-arrival', ['train-arrive', 'doors-open']],
  ['metro-boarding', []],
  ['metro-departure', ['doors-close', 'train-depart']],
  ['metro-ride', ['tunnel']],
  ['metro-arriving', ['station-announcement', 'train-brake']],
  ['metro-alighting', ['doors-open']],
  ['metro-escalator-up', ['escalator']],
  ['bus-arrival', ['bus-arrive', 'bus-doors']],
  ['bus-validate', ['validator-beep']],
  ['bus-ride', ['bus-engine']],
  ['bus-traffic-light', ['bus-brake']],
  ['bus-alighting', ['bus-doors']],
  ['taxi-order', ['phone-tap']],
  ['taxi-arrival', ['car-arrive']],
  ['taxi-boarding', ['car-door']],
  ['taxi-ride', ['car-engine']],
  ['taxi-alighting', ['car-door']],
  ['activity', ['cup']],
  ['activity', ['keyboard']],
  ['activity', ['page-turn']],
]
/** n случайных смен фаз через every секунд + смены эмбиента, затем тихая фаза */
function stress(n, every) {
  let seed = 7
  const rnd = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  const locs = Object.keys(LOC)
  const out = []
  for (let i = 0; i < n; i++) {
    const [phase, sounds] = ALL_PHASES[Math.floor(rnd() * ALL_PHASES.length)]
    const at = i * every
    if (i % 8 === 0) out.push({ at, ambience: LOC[locs[Math.floor(rnd() * locs.length)]], transition: 'end' })
    out.push({ at, phase, duration: every, indoor: rnd() < 0.5, sounds })
    if (rnd() < 0.3) out.push({ at, steps: { surface: ['asphalt', 'grass', 'floor', 'snow'][Math.floor(rnd() * 4)], until: at + every } })
  }
  out.push({ at: n * every + 0.2, phase: 'activity', duration: 10, indoor: true, sounds: [], ambience: LOC.cafe, transition: 'end' })
  return out
}
const METRO_TRIP = trip([
  ['walk-street', 3.5, { loc: 'street', steps: 'asphalt', cues: ['footsteps'] }],
  ['metro-vestibule', 1, { loc: 'station', cues: ['building-door'] }],
  ['metro-turnstile', 1, { cues: ['turnstile'] }],
  ['metro-escalator-down', 4, { cues: ['escalator'] }],
  ['metro-platform-wait', 3, { cues: ['platform-ambience'] }],
  ['metro-train-arrival', 2, { cues: ['train-arrive', 'doors-open'] }],
  ['metro-boarding', 1],
  ['metro-departure', 1.5, { loc: 'wagon', cues: ['doors-close', 'train-depart'] }],
  ['metro-ride', 7, { cues: ['tunnel'] }],
  ['metro-arriving', 1.5, { cues: ['station-announcement', 'train-brake'] }],
  ['metro-alighting', 1.5, { loc: 'station', cues: ['doors-open'] }],
  ['metro-escalator-up', 3, { cues: ['escalator'] }],
])
const TRAVEL = {
  'travel · metro trip': { music: false, travel: METRO_TRIP },
  'travel · bus trip': {
    music: false,
    travel: trip([
      ['walk-street', 3, { loc: 'street', steps: 'asphalt' }],
      ['bus-stop-wait', 3, { loc: 'stop' }],
      ['bus-arrival', 2, { cues: ['bus-arrive', 'bus-doors'] }],
      ['bus-boarding', 1],
      ['bus-validate', 1, { loc: 'cabin', cues: ['validator-beep'] }],
      ['bus-ride', 7, { cues: ['bus-engine'] }],
      ['bus-traffic-light', 2, { cues: ['bus-brake'] }],
      ['bus-ride', 5, { cues: ['bus-engine'] }],
      ['bus-alighting', 1.5, { loc: 'stop', cues: ['bus-doors'] }],
      ['walk-crossing', 2.5, { cues: ['crosswalk-signal'] }],
      ['walk-street', 2, { steps: 'asphalt' }],
    ]),
  },
  'travel · taxi trip': {
    music: false,
    travel: trip([
      ['taxi-order', 1.5, { loc: 'street', cues: ['phone-tap'] }],
      ['taxi-wait', 3],
      ['taxi-arrival', 2, { cues: ['car-arrive'] }],
      ['taxi-boarding', 1.5, { cues: ['car-door'] }],
      ['taxi-ride', 14, { loc: 'cabin', cues: ['car-engine'] }],
      ['taxi-alighting', 1.5, { loc: 'park', cues: ['car-door'] }],
      ['walk-street', 4, { steps: 'grass' }],
      ['building-enter', 1, { cues: ['building-door'] }],
      ['activity', 3, { loc: 'cafe', cues: ['cup'] }],
    ]),
  },
  // 100 смен фаз (каждые 0.24 с) + смены эмбиента, затем тишина: узлов не прибавилось, выходы отключены
  'travel · stress 100 phases': { music: false, travel: stress(100, 0.24) },
  'full mix · metro trip': { music: true, weather: { rain: 0.3, cloud: 0.7 }, travel: METRO_TRIP },
}
export const SCENARIOS = {
  // только микшер (компрессор, LP, soft-clip, анализаторы) — «пол» нагрузки
  'idle · mixer': { music: false },
  'music · day': { music: true, minutes: 14 * 60 },
  'music · night': { music: true, minutes: 23 * 60 + 30 },
  'music · rain': { music: true, minutes: 19 * 60, weather: { rain: 0.6, cloud: 0.9 } },
  'music solo · rhodes': { music: true, solo: ['rhodes'] },
  'music solo · pad': { music: true, solo: ['pad'] },
  'music solo · bass': { music: true, solo: ['bass'] },
  'music solo · lead': { music: true, solo: ['lead'] },
  'music solo · drums': { music: true, solo: ['drums'] },
  'city · street': { music: false, city: amb({ traffic: 0.7, crowd: 0.6, wind: 0.2 }) },
  'city · metro': { music: false, city: amb({ metro: 0.9, crowd: 0.4, indoor: 0.5 }) },
  'city · cafe': { music: false, city: amb({ cafe: 0.9, crowd: 0.3, indoor: 0.6 }) },
  'city · office': { music: false, city: amb({ office: 0.9, indoor: 0.7 }) },
  'weather · rain': { music: false, weather: { rain: 0.5, cloud: 0.8, wind: 0.3 } },
  'weather · snow': { music: false, weather: { snow: 0.8, wind: 0.3, cloud: 0.7 } },
  ...TRAVEL,
  'full mix · street rain': { music: true, city: amb({ traffic: 0.6, crowd: 0.5 }), weather: { rain: 0.5, cloud: 0.8 } },
}

const repeat = Math.max(1, Number(process.env.REPEAT ?? 1))
const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null
const browser = await chromium.launch()
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.goto(url.includes('.html') || url.includes('?') ? url : `${url}/audio-lab.html`)
await page.waitForFunction(() => window.__audioLab, null, { timeout: 30000 })
const rows = []
for (const [name, sc] of Object.entries(SCENARIOS)) {
  if (only && !only.test(name)) continue
  const runs = []
  for (let k = 0; k < repeat; k++) runs.push(await page.evaluate((s) => window.__audioLab.renderOffline(s), { seconds: secs, seed: 4242, ...sc }))
  const med = (key) => runs.map((x) => x[key]).sort((a, b) => a - b)[Math.floor(runs.length / 2)]
  const worst = (key) => Math.max(...runs.map((x) => x[key]))
  const r = { ...runs.reduce((a, b) => (b.clicks > a.clicks ? b : a)), graphLoad: med('graphLoad'), jsLoad: med('jsLoad'), clicks: worst('clicks'), clipped: worst('clipped'), nonFinite: worst('nonFinite'), peakDb: worst('peakDb') }
  rows.push({ name, ...r })
  if (!asJson) {
    const f = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : String(v))
    console.log(
      `${name.padEnd(26)} peak ${f(r.peakDb).padStart(6)} dB @${f(r.peakTime).padStart(4)}s  rms ${f(r.rmsDb).padStart(6)} dB  clip ${String(r.clipped).padStart(5)}  nan ${r.nonFinite}  clicks ${String(r.clicks).padStart(4)}  silence ${f(r.maxSilence, 2)}s` +
        (r.lateSteps !== undefined ? `  late ${r.lateSteps}  dropped ${r.droppedNotes}` : '') +
        `  graph ${Math.round(r.graphLoad * 100)}%  js ${Math.round(r.jsLoad * 100)}%` +
        (r.nodesStart !== undefined ? `  nodes ${r.nodesStart}→${r.nodesEnd}` : '') +
        (r.travelActiveEnd !== undefined ? `  travel-out ${r.travelActiveEnd} phases ${r.travelPhases}` : '') +
        (r.clicks ? `  @ ${r.clickTimes.slice(0, 6).map((t) => t.toFixed(2)).join(',')}` : ''),
    )
  }
}
if (showProfile) for (const r of rows) console.log(`${r.name}
  rms/0.5s: ${r.profile?.map((v) => Math.round(v)).join(' ')}`)
if (asJson) console.log(JSON.stringify(rows, null, 2))
if (errors.length) console.log('PAGE ERRORS:', errors.slice(0, 5))
await browser.close()
stopServer()
