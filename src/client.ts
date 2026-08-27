interface ClientContext {
  effect(start: () => () => void, label: string): void
  slots: {
    inject(name: string, register: () => () => void): () => void
    register(options: { name: string; id: string; order: number }, component: () => unknown): () => void
  }
}

interface ClientPlugin {
  name: string
  inject: string[]
  apply(ctx: ClientContext): void
}

interface ReactLike {
  createElement(type: string, props?: Record<string, unknown> | null, ...children: unknown[]): unknown
}

interface Window {
  __ModuleLoader__: {
    load(module: { id: string; factory: (require: (id: string) => unknown) => ClientPlugin }): void
  }
}

interface RainTheme {
  background: string
  caption: string
  tertiary: string
  secondary: string
  blue: string
  blueHead: string
  font: string
  fontSize: number
  fontWeight: string
}

window.__ModuleLoader__.load({
  id: 'dsh-matrix-think',
  factory: require => {
    const React = require('react') as ReactLike
    const FALLBACK = ['DEEPSEEK', 'HARNESS']
    const ENABLED_KEY = 'dsh-matrix-think.enabled'
    const FALLBACK_FONT_SIZE = 14
    const FRAME_MS = 32
    const ENTRY_NOISE_ROWS = 18
    const GREY_SPEED_MIN = 0.32
    const GREY_SPEED_RANGE = 0.5
    const BLUE_SPEED = 0.22
    const STYLE = `
      .dsh-matrix-think-source {
        box-sizing: border-box !important;
        width: calc(100% - 22px) !important;
        height: 184px !important;
        margin-left: 22px !important;
        padding: 0 !important;
        overflow: hidden !important;
        color: transparent !important;
        background: var(--dsw-alias-bg-base) !important;
      }
      .dsh-matrix-think-overlay {
        position: fixed;
        top: 0;
        left: 0;
        z-index: 10;
        overflow: hidden;
        pointer-events: none;
      }
      .dsh-matrix-think-canvas {
        display: block;
        width: 100%;
        height: 100%;
      }
      .dsh-matrix-think-settings {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 24px;
        padding: 16px;
        list-style: none;
        color: var(--dsw-alias-label-primary, inherit);
        background: var(--dsw-alias-bg-surface, transparent);
        border: 1px solid var(--dsw-alias-border-subtle, rgba(127, 127, 127, 0.24));
        border-radius: 12px;
      }
      .dsh-matrix-think-settings-copy { min-width: 0; }
      .dsh-matrix-think-settings-title { font-weight: 500; }
      .dsh-matrix-think-settings-description {
        margin-top: 4px;
        color: var(--dsw-alias-label-tertiary, currentColor);
        font-size: 13px;
      }
      .dsh-matrix-think-settings-toggle {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        flex: none;
        cursor: pointer;
      }
      .dsh-matrix-think-settings-toggle input {
        width: 34px;
        height: 20px;
        margin: 0;
        appearance: none;
        cursor: pointer;
        border-radius: 999px;
        background: var(--dsw-alias-fill-tertiary, #555);
        box-shadow: inset 0 0 0 1px var(--dsw-alias-border-subtle, transparent);
        transition: background 120ms ease;
      }
      .dsh-matrix-think-settings-toggle input::after {
        display: block;
        width: 16px;
        height: 16px;
        margin: 2px;
        content: '';
        border-radius: 50%;
        background: var(--dsw-alias-label-primary, #fff);
        transition: transform 120ms ease;
      }
      .dsh-matrix-think-settings-toggle input:checked {
        background: var(--dsw-static-deepseek-500, #4d7cff);
      }
      .dsh-matrix-think-settings-toggle input:checked::after { transform: translateX(14px); }
      .dsh-matrix-think-settings-toggle input:focus-visible {
        outline: 2px solid var(--dsw-static-deepseek-500, #4d7cff);
        outline-offset: 2px;
      }
      @media (prefers-reduced-motion: reduce) {
        .dsh-matrix-think-canvas { opacity: 0.82; }
      }
    `

    const controllers = new Set<(enabled: boolean) => void>()

    function isEnabled() {
      try {
        return localStorage.getItem(ENABLED_KEY) !== '0'
      } catch {
        return true
      }
    }

    function setEnabled(enabled: boolean) {
      try {
        localStorage.setItem(ENABLED_KEY, enabled ? '1' : '0')
      } catch {}
      for (const controller of controllers) controller(enabled)
    }

    function SettingsCard() {
      return React.createElement(
        'li',
        { className: 'dsh-matrix-think-settings' },
        React.createElement(
          'div',
          { className: 'dsh-matrix-think-settings-copy' },
          React.createElement('div', { className: 'dsh-matrix-think-settings-title' }, 'Matrix Think'),
          React.createElement(
            'div',
            { className: 'dsh-matrix-think-settings-description' },
            'Turn expanded reasoning into text rain in this browser.',
          ),
        ),
        React.createElement(
          'label',
          { className: 'dsh-matrix-think-settings-toggle' },
          React.createElement('span', null, 'Enabled'),
          React.createElement('input', {
            type: 'checkbox',
            role: 'switch',
            'aria-label': 'Enable Matrix Think',
            defaultChecked: isEnabled(),
            onChange: (event: { currentTarget: HTMLInputElement }) => setEnabled(event.currentTarget.checked),
          }),
        ),
      )
    }

    function words(text: string) {
      const visible = text.normalize('NFKC').replaceAll('—', '🐋').trim().split(/\s+/u).filter(Boolean)
      return visible.length === 0 ? FALLBACK : visible
    }

    function apply(ctx: ClientContext) {
      ctx.effect(() => ctx.slots.inject(
        'settings.plugin.item',
        () => ctx.slots.register(
          { name: 'settings.plugin.item', id: 'matrix-think', order: 100 },
          SettingsCard,
        ),
      ), 'matrix-think: settings card')

      ctx.effect(() => {
        const style = document.createElement('style')
        style.dataset.dshMatrixThink = ''
        style.textContent = STYLE
        document.head.append(style)

        const active = new Set<MatrixRain>()
        const rains = new WeakMap<HTMLElement, MatrixRain>()
        let scanFrame: number | undefined
        let featureEnabled = isEnabled()

        class MatrixRain {
          root: HTMLElement
          source: HTMLElement
          overlay: HTMLDivElement
          canvas: HTMLCanvasElement
          context: CanvasRenderingContext2D | null
          columns: number[]
          speeds: number[]
          reveals: number[]
          streamWords: Array<string | undefined>
          pendingWords: string[][]
          syncedWords: string[]
          blueColumn: number | undefined
          lastFrame: number
          running: boolean
          reducedMotion: MediaQueryList
          onMotionChange: () => void
          resizeObserver: ResizeObserver
          words: string[] = []
          theme!: RainTheme
          width = 1
          height = 1
          cellSize = FALLBACK_FONT_SIZE
          letterStep = FALLBACK_FONT_SIZE - 2
          frame: number | undefined

          constructor(root: HTMLElement, source: HTMLElement) {
            this.root = root
            this.source = source
            this.overlay = document.createElement('div')
            this.overlay.className = 'dsh-matrix-think-overlay'
            this.canvas = document.createElement('canvas')
            this.canvas.className = 'dsh-matrix-think-canvas'
            this.canvas.setAttribute('aria-hidden', 'true')
            this.overlay.append(this.canvas)
            document.body.append(this.overlay)
            this.context = this.canvas.getContext('2d')
            this.columns = []
            this.speeds = []
            this.reveals = []
            this.streamWords = []
            this.pendingWords = []
            this.syncedWords = []
            this.blueColumn = undefined
            this.lastFrame = 0
            this.running = false
            this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
            this.onMotionChange = () => this.restart()
            this.reducedMotion.addEventListener('change', this.onMotionChange)
            this.resizeObserver = new ResizeObserver(() => this.resize())
            this.resizeObserver.observe(source)
            source.classList.add('dsh-matrix-think-source')
            active.add(this)
            this.update()
          }

          update() {
            this.words = words(this.source.textContent ?? '')
            this.readTheme()
            this.resize()
            this.syncStreams()
            this.setRunning(this.root.dataset.state === 'running')
          }

          readTheme() {
            const rootStyle = getComputedStyle(this.root)
            const sourceStyle = getComputedStyle(this.source)
            const token = (name: string, fallback: string) => rootStyle.getPropertyValue(name).trim() || fallback
            this.theme = {
              background: token('--dsw-alias-bg-base', sourceStyle.backgroundColor),
              caption: token('--dsw-alias-label-caption', sourceStyle.color),
              tertiary: token('--dsw-alias-label-tertiary', sourceStyle.color),
              secondary: token('--dsw-alias-label-secondary', sourceStyle.color),
              blue: token('--dsw-static-deepseek-500', sourceStyle.color),
              blueHead: token('--dsw-static-deepseek-200', sourceStyle.color),
              font: sourceStyle.fontFamily || token('--dsw-font-family', 'sans-serif'),
              fontSize: Number.parseFloat(sourceStyle.fontSize) || FALLBACK_FONT_SIZE,
              fontWeight: sourceStyle.fontWeight || '400',
            }
          }

          syncBounds() {
            const rect = this.source.getBoundingClientRect()
            this.overlay.style.width = `${rect.width}px`
            this.overlay.style.height = `${rect.height}px`
            this.overlay.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`
          }

          resize() {
            this.syncBounds()
            const width = Math.max(1, this.source.clientWidth)
            const height = Math.max(1, this.source.clientHeight)
            const ratio = Math.min(devicePixelRatio || 1, 2)
            const pixelWidth = Math.round(width * ratio)
            const pixelHeight = Math.round(height * ratio)
            if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
              this.canvas.width = pixelWidth
              this.canvas.height = pixelHeight
              this.context?.setTransform(ratio, 0, 0, ratio, 0, 0)
            }
            this.width = width
            this.height = height
            this.cellSize = this.theme.fontSize
            this.letterStep = Math.max(1, this.theme.fontSize - 2)
            const count = Math.max(1, Math.floor(width / this.cellSize))
            const countChanged = count !== this.columns.length
            this.columns = Array.from({ length: count }, (_, index) => this.columns[index] ?? this.randomStartRow())
            this.speeds = Array.from({ length: count }, (_, index) => this.speeds[index] ?? GREY_SPEED_MIN + Math.random() * GREY_SPEED_RANGE)
            if (countChanged) this.rebuildStreams()
            if (!this.running || this.reducedMotion.matches) this.drawStill()
          }

          rebuildStreams() {
            this.streamWords = Array(this.columns.length)
            this.pendingWords = Array.from({ length: this.columns.length }, () => [])
            this.reveals = Array(this.columns.length).fill(1)
            const start = Math.max(0, this.words.length - this.columns.length)
            for (let index = start; index < this.words.length; index += 1) {
              this.streamWords[index % this.columns.length] = this.words[index]
            }
            this.syncedWords = this.words.slice()
          }

          syncStreams() {
            const stableLength = Math.max(0, this.syncedWords.length - 1)
            const appended = this.words.length >= this.syncedWords.length
              && this.syncedWords.slice(0, stableLength).every((word, index) => word === this.words[index])
            if (!appended) return this.rebuildStreams()

            for (let index = stableLength; index < this.words.length; index += 1) {
              const column = index % this.columns.length
              const word = this.words[index]
              if (index < this.syncedWords.length) {
                const pending = this.pendingWords[column]
                if (pending.length > 0) pending[pending.length - 1] = word
                else {
                  const previousLength = Array.from(this.streamWords[column] ?? '').length
                  const nextLength = Array.from(word).length
                  this.streamWords[column] = word
                  this.reveals[column] = Math.min(nextLength, this.reveals[column] + Math.max(0, nextLength - previousLength))
                }
              } else if (this.streamWords[column] === undefined) {
                this.streamWords[column] = word
                this.columns[column] = this.randomStartRow()
                this.reveals[column] = 1
                this.speeds[column] = GREY_SPEED_MIN + Math.random() * GREY_SPEED_RANGE
              } else this.pendingWords[column].push(word)
            }
            this.syncedWords = this.words.slice()
          }

          advanceStream(column: number) {
            this.streamWords[column] = this.pendingWords[column].shift()
            this.columns[column] = this.randomStartRow()
            this.reveals[column] = 1
            this.speeds[column] = GREY_SPEED_MIN + Math.random() * GREY_SPEED_RANGE
          }

          randomStartRow() {
            return Math.random() < 0.5
              ? Math.random() * (this.height / this.letterStep)
              : -1 - Math.random() * ENTRY_NOISE_ROWS
          }

          setRunning(running: boolean) {
            if (running === this.running) return
            this.running = running
            this.restart()
          }

          restart() {
            if (this.frame !== undefined) cancelAnimationFrame(this.frame)
            if (this.running && !this.reducedMotion.matches) {
              this.lastFrame = 0
              this.frame = requestAnimationFrame(time => this.draw(time))
            } else {
              this.drawStill()
            }
          }

          prepare() {
            const context = this.context
            if (!context) return false
            context.globalAlpha = 1
            context.fillStyle = this.theme.background
            context.fillRect(0, 0, this.width, this.height)
            context.font = `${this.theme.fontWeight} ${this.theme.fontSize}px ${this.theme.font}`
            context.textAlign = 'center'
            return true
          }

          visibleWords() {
            return this.words.slice(-this.columns.length)
          }

          drawWord(word: string, x: number, headY: number, isBlue: boolean, still = false, revealed = Infinity) {
            const context = this.context
            if (!context) return
            const letters = Array.from(word)
            const last = letters.length - 1
            const first = still ? 0 : Math.max(0, letters.length - Math.ceil(revealed))
            for (let index = first; index < letters.length; index += 1) {
              const y = headY - (last - index) * this.letterStep
              if (y < 0 || y > this.height) continue
              const head = index === last
              context.globalAlpha = head ? 1 : still ? 0.72 : 0.28 + 0.5 * (index / Math.max(1, last))
              context.fillStyle = isBlue
                ? head ? this.theme.blueHead : this.theme.blue
                : head ? this.theme.secondary : index < letters.length / 2 ? this.theme.caption : this.theme.tertiary
              if (head) {
                context.shadowColor = isBlue ? this.theme.blueHead : this.theme.secondary
                context.shadowBlur = 2
              }
              context.fillText(letters[index], x, y)
              context.shadowBlur = 0
            }
          }

          ensureBlueRain() {
            const visible: number[] = []
            for (let column = 0; column < this.streamWords.length; column += 1) {
              const word = this.streamWords[column]
              if (word === undefined) continue
              const headY = this.columns[column] * this.letterStep
              const shown = Math.min(Array.from(word).length, Math.ceil(this.reveals[column]))
              const tailY = headY - (shown - 1) * this.letterStep
              if (headY >= 0 && tailY <= this.height) visible.push(column)
            }
            if (this.blueColumn !== undefined && visible.includes(this.blueColumn)) return
            if (this.blueColumn !== undefined && this.streamWords[this.blueColumn] !== undefined) {
              this.speeds[this.blueColumn] = GREY_SPEED_MIN + Math.random() * GREY_SPEED_RANGE
            }
            this.blueColumn = visible.length === 0
              ? undefined
              : visible[Math.floor(Math.random() * visible.length)]
            if (this.blueColumn !== undefined) this.speeds[this.blueColumn] = BLUE_SPEED
          }

          draw(time: number) {
            if (!this.source.isConnected || !this.running) return this.destroyIfDisconnected()
            this.frame = requestAnimationFrame(next => this.draw(next))
            if (time - this.lastFrame < FRAME_MS || !this.prepare()) return
            this.lastFrame = time

            this.ensureBlueRain()

            for (let column = 0; column < this.columns.length; column += 1) {
              const word = this.streamWords[column]
              if (word === undefined) continue
              const row = this.columns[column]
              const isBlue = column === this.blueColumn
              const x = column * this.cellSize + this.cellSize / 2
              const y = row * this.letterStep
              this.drawWord(word, x, y, isBlue, false, this.reveals[column])

              this.columns[column] += this.speeds[column]
              this.reveals[column] = Math.min(Array.from(word).length, this.reveals[column] + this.speeds[column])
              const wordHeight = Math.max(1, Array.from(word).length) * this.letterStep
              const finished = y - wordHeight > this.height + this.letterStep * 3
              if (finished && (isBlue || this.pendingWords[column].length > 0 || Math.random() > 0.94)) {
                if (isBlue) this.blueColumn = undefined
                this.advanceStream(column)
              }
            }
            if (this.context) this.context.globalAlpha = 1
          }

          drawStill() {
            if (!this.theme || !this.prepare()) return
            const visibleWords = this.visibleWords()
            const blueColumn = Math.floor(visibleWords.length / 2)
            for (let column = 0; column < visibleWords.length; column += 1) {
              const letters = Array.from(visibleWords[column])
              const step = Math.min(this.letterStep, (this.height - this.cellSize * 2) / Math.max(1, letters.length - 1))
              const previousStep = this.letterStep
              this.letterStep = Math.max(1, step)
              this.drawWord(visibleWords[column], column * this.cellSize + this.cellSize / 2, this.cellSize + (letters.length - 1) * this.letterStep, column === blueColumn, true)
              this.letterStep = previousStep
            }
            if (this.context) this.context.globalAlpha = 1
          }

          destroyIfDisconnected() {
            if (!this.source.isConnected) this.destroy()
          }

          destroy() {
            if (this.frame !== undefined) cancelAnimationFrame(this.frame)
            this.resizeObserver.disconnect()
            this.reducedMotion.removeEventListener('change', this.onMotionChange)
            this.overlay.remove()
            this.source.classList.remove('dsh-matrix-think-source')
            rains.delete(this.source)
            active.delete(this)
          }
        }

        function syncBounds() {
          for (const rain of active) rain.syncBounds()
        }

        function scan() {
          scanFrame = undefined
          for (const rain of active) {
            if (!rain.source.isConnected) rain.destroy()
          }
          if (!featureEnabled) return
          for (const root of document.querySelectorAll<HTMLElement>('[data-variant="think"]')) {
            const row = root.querySelector<HTMLElement>('[data-disclosure-row][aria-expanded="true"]')
            const disclosure = row?.parentElement
            const source = disclosure?.lastElementChild
            if (!(source instanceof HTMLElement) || source === row) continue
            const rain = rains.get(source)
            if (rain) rain.update()
            else rains.set(source, new MatrixRain(root, source))
          }
        }

        function scheduleScan() {
          if (scanFrame === undefined) scanFrame = requestAnimationFrame(scan)
        }

        const syncEnabled = (enabled: boolean) => {
          featureEnabled = enabled
          if (enabled) scheduleScan()
          else for (const rain of [...active]) rain.destroy()
        }
        controllers.add(syncEnabled)

        const observer = new MutationObserver(scheduleScan)
        observer.observe(document.documentElement, {
          subtree: true,
          childList: true,
          characterData: true,
          attributes: true,
          attributeFilter: ['aria-expanded', 'data-state'],
        })
        addEventListener('scroll', syncBounds, true)
        addEventListener('resize', syncBounds)
        scheduleScan()

        return () => {
          observer.disconnect()
          removeEventListener('scroll', syncBounds, true)
          removeEventListener('resize', syncBounds)
          controllers.delete(syncEnabled)
          if (scanFrame !== undefined) cancelAnimationFrame(scanFrame)
          for (const rain of [...active]) rain.destroy()
          style.remove()
        }
      }, 'matrix-think: expanded reasoning canvas')
    }

    return { name: 'dsh-matrix-think', inject: ['slots'], apply }
  },
})
