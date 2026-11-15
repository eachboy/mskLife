import type * as ToneNS from 'tone'

/** Без импорта из audioUtils (там NoiseBurst использует OutputGate — избегаем цикла модулей). */
function safe(fn: () => void): void {
  try {
    fn()
  } catch {
    /* ignore */
  }
}

/** Узел, который можно подключать/отключать (Tone-нода). */
interface Connectable {
  connect: (dest: ToneNS.InputNode) => unknown
  disconnect: (dest?: ToneNS.InputNode) => unknown
}

/** Минимум контекста, нужный гейтам (удобно подменять в unit-тестах). */
export interface GateClock {
  /** время аудиоконтекста БЕЗ lookAhead (в offline — внутренние часы) */
  readonly currentTime: number
  /** время планирования: currentTime + lookAhead */
  now: () => number
  setTimeout: (fn: () => void, sec: number) => number
  clearTimeout: (id: number) => unknown
}

/** запас после окончания рампы/хвоста перед отключением, с */
const OFF_MARGIN = 0.1

/**
 * Подключение выхода к шине «по требованию». Пока выход отключён, Chrome не опрашивает
 * всю цепочку перед ним (фильтры, огибающие, LFO) — нагрузка аудиопотока падает.
 *
 * Отключение — только когда текущее время контекста (без lookAhead!) прошло момент
 * `until` + запас: к этому времени рампа/хвост гарантированно в нуле → без щелчка.
 * Почему так: события планируются от ctx.now() = currentTime + lookAhead (0.3 с в
 * приложении), а таймеры контекста срабатывают по now(). Отключение «через fade после
 * рампы», посчитанное по таймеру, приходило на ~lookAhead раньше конца рампы и обрезало
 * хвост на ненулевом уровне (в offline-рендере lookAhead = 0, поэтому замеры этого не видели).
 */
export class OutputGate {
  private connected = false
  private timer: number | null = null
  private until = 0

  constructor(
    private clock: GateClock,
    private node: Connectable,
    private dest: ToneNS.InputNode,
  ) {}

  get active(): boolean {
    return this.connected
  }

  /** Подключить и держать подключённым бессрочно (до close). */
  open(): void {
    this.connect()
    this.until = Number.POSITIVE_INFINITY
    this.cancelTimer()
  }

  /** Подключить и держать до момента `until` (время контекста, в той же шкале, что now()). */
  hold(until: number): void {
    this.connect()
    if (until > this.until) this.until = until
    this.arm()
  }

  /** Разрешить отключение после момента `until` (время планирования, обычно конец рампы к нулю). */
  close(until: number): void {
    if (!this.connected) return
    this.until = until
    this.arm()
  }

  private connect(): void {
    if (this.connected) return
    this.node.connect(this.dest)
    this.connected = true
  }

  private cancelTimer(): void {
    if (this.timer === null) return
    const id = this.timer
    this.timer = null
    safe(() => this.clock.clearTimeout(id))
  }

  private arm(): void {
    if (this.timer !== null || !Number.isFinite(this.until)) return
    // Все времена планирования — в шкале аудиовремени (currentTime). Рампа, кончающаяся в
    // `until`, гарантированно в нуле, когда currentTime ≥ until. Таймер контекста отсчитывает
    // ту же разницу (now() и currentTime идут с одной скоростью), поэтому ждём от currentTime.
    const wait = Math.max(0.05, this.until + OFF_MARGIN - this.clock.currentTime)
    this.timer = this.clock.setTimeout(() => {
      this.timer = null
      if (!this.connected || !Number.isFinite(this.until)) return
      if (this.clock.currentTime >= this.until + OFF_MARGIN) {
        safe(() => this.node.disconnect(this.dest))
        this.connected = false
      } else this.arm()
    }, wait)
  }

  dispose(): void {
    this.cancelTimer()
  }
}

/**
 * Слой окружения с «умным» подключением: при нулевой громкости после затухания слой
 * отсоединяется от шины. Подключение происходит при гейне 0, затем рампа — без щелчка.
 */
export class GatedLayer {
  private target = 0
  private out: OutputGate

  constructor(
    private ctx: GateClock,
    readonly gain: ToneNS.Gain,
    dest: ToneNS.InputNode,
  ) {
    this.out = new OutputGate(ctx, gain, dest)
  }

  /** Плавно к уровню level за fade секунд (линейная рампа от текущего значения). */
  set(level: number, fade: number): void {
    const v = Number.isFinite(level) ? Math.max(0, level) : 0
    // та же цель — ничего не делаем. Важно для слоёв, которые обновляются каждые 0.2 с: повторная
    // рампа к нулю отодвигала бы момент отключения бесконечно (слой никогда не отключался).
    if (Math.abs(v - this.target) < 1e-4) return
    this.target = v
    const at = this.ctx.now()
    if (v > 1e-4) {
      if (!this.out.active) safe(() => this.gain.gain.setValueAtTime(0, at))
      this.out.open()
      safe(() => this.gain.gain.linearRampTo(v, Math.max(0.02, fade), at))
    } else if (this.out.active) {
      safe(() => this.gain.gain.linearRampTo(0, Math.max(0.02, fade), at))
      this.out.close(at + Math.max(0.02, fade))
    }
  }

  get level(): number {
    return this.target
  }

  get active(): boolean {
    return this.out.active
  }

  dispose(): void {
    this.out.dispose()
  }
}
