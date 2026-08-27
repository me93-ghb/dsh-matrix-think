const assert = require('node:assert/strict')
const fs = require('node:fs')
const test = require('node:test')
const { JSDOM } = require('jsdom')

const source = fs.readFileSync('lib/client.js', 'utf8')

function createHarness({ reasoning = 'first streamed tokens', width = 450, random } = {}) {
  const dom = new JSDOM(`<!doctype html><html><body>
    <div data-variant="think" data-state="running" style="
      --dsw-alias-bg-base: rgb(20, 20, 20);
      --dsw-alias-label-caption: rgb(90, 90, 90);
      --dsw-alias-label-tertiary: rgb(130, 130, 130);
      --dsw-alias-label-secondary: rgb(190, 190, 190);
      --dsw-static-deepseek-500: rgb(65, 118, 230);
      --dsw-static-deepseek-200: rgb(211, 226, 255);
    ">
      <div>
        <div data-disclosure-row aria-expanded="true">Think</div>
        <div id="reasoning" style="font: 400 14px/24px DSHSans">${reasoning}</div>
      </div>
    </div>
  </body></html>`, { pretendToBeVisual: true, runScripts: 'outside-only', url: 'http://localhost' })
  const { window } = dom
  if (random) window.Math.random = random
  const frames = new Map()
  const fills = []
  const draws = []
  let nextFrame = 1
  let now = 0
  let registration
  let settingsComponent

  window.__ModuleLoader__ = { load(value) { registration = value } }
  window.requestAnimationFrame = callback => {
    const id = nextFrame++
    frames.set(id, callback)
    return id
  }
  window.cancelAnimationFrame = id => frames.delete(id)
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
  window.ResizeObserver = class {
    observe() {}
    disconnect() {}
  }
  Object.defineProperties(window.HTMLElement.prototype, {
    clientWidth: { configurable: true, get() { return width } },
    clientHeight: { configurable: true, get() { return 184 } },
  })
  window.HTMLElement.prototype.getBoundingClientRect = () => ({ left: 20, top: 40, width, height: 184 })
  const context = {
    setTransform() {},
    fillRect() {},
    fillText(text, x, y) {
      fills.push(this.fillStyle)
      draws.push({ text, x, y, fill: this.fillStyle })
    },
    set fillStyle(value) { this._fillStyle = value },
    get fillStyle() { return this._fillStyle },
    font: '',
    textAlign: '',
    shadowColor: '',
    shadowBlur: 0,
  }
  window.HTMLCanvasElement.prototype.getContext = () => context
  window.eval(source)

  let hookState
  const React = {
    createElement(type, props, ...children) {
      return { type, props: { ...props, children } }
    },
    useState(initial) {
      hookState ??= typeof initial === 'function' ? initial() : initial
      return [hookState, value => { hookState = value }]
    },
  }
  const disposers = []
  const plugin = registration.factory(id => {
    assert.equal(id, 'react')
    return React
  })
  plugin.apply({
    effect(start) { disposers.push(start()) },
    slots: {
      inject(name, register) {
        assert.equal(name, 'settings.plugins.tab')
        return register()
      },
      register(options, component) {
        if (options.name === 'settings.plugin.item' && !options.key) {
          throw new Error('keyed slot "settings.plugin.item" requires options.key')
        }
        assert.equal(options.name, 'settings.plugins.tab')
        assert.equal(options.id, 'matrix-think')
        assert.equal(options.label, 'Matrix Think')
        settingsComponent = component
        return () => {}
      },
    },
  })

  return {
    window,
    fills,
    draws,
    plugin,
    get settingsComponent() { return settingsComponent },
    dispose() {
      for (const dispose of disposers.reverse()) dispose?.()
    },
    async settle() { await new Promise(resolve => setImmediate(resolve)) },
    flush(count = 1) {
      for (let iteration = 0; iteration < count; iteration += 1) {
        now += 40
        const callbacks = [...frames.values()]
        frames.clear()
        for (const callback of callbacks) callback(now)
      }
    },
  }
}

function findElement(node, type) {
  if (!node || typeof node !== 'object') return undefined
  if (node.type === type) return node
  for (const child of node.props?.children ?? []) {
    const match = findElement(child, type)
    if (match) return match
  }
}

test('registers a persistent native Settings switch that controls the rain', async () => {
  const harness = createHarness()
  await harness.settle()
  harness.flush(3)
  assert.equal(harness.plugin.inject.join(','), 'slots')
  assert.equal(typeof harness.settingsComponent, 'function')
  assert.ok(harness.window.document.querySelector('.dsh-matrix-think-overlay'))

  let settings = harness.settingsComponent()
  let input = findElement(settings, 'input')
  let status = findElement(settings, 'span')
  assert.equal(input.props.role, 'switch')
  assert.equal(input.props.checked, true)
  assert.deepEqual(status.props.children, ['Enabled'])
  input.props.onChange({ currentTarget: { checked: false } })
  settings = harness.settingsComponent()
  input = findElement(settings, 'input')
  status = findElement(settings, 'span')
  assert.equal(harness.window.localStorage.getItem('dsh-matrix-think.enabled'), '0')
  assert.equal(input.props.checked, false)
  assert.deepEqual(status.props.children, ['Disabled'])
  assert.equal(harness.window.document.querySelector('.dsh-matrix-think-overlay'), null)

  input.props.onChange({ currentTarget: { checked: true } })
  harness.flush(2)
  assert.ok(harness.window.document.querySelector('.dsh-matrix-think-overlay'))
  harness.dispose()
})

test('keeps its canvas outside the React-owned reasoning body during streaming', async () => {
  const harness = createHarness()
  await harness.settle()
  harness.flush(3)
  assert.equal(harness.window.document.querySelector('#reasoning canvas'), null)
  assert.ok(harness.window.document.querySelector('body > .dsh-matrix-think-overlay canvas'))
  harness.dispose()
})

test('stops drawing when DSH leaves the running state', async () => {
  const harness = createHarness()
  await harness.settle()
  harness.flush(3)
  harness.window.document.querySelector('[data-variant="think"]').dataset.state = 'ok'
  await harness.settle()
  harness.flush(2)
  const stoppedAt = harness.fills.length
  harness.flush(5)
  assert.equal(harness.fills.length, stoppedAt)
  harness.dispose()
})

test('uses DSH greys and the original thinking font', async () => {
  const harness = createHarness()
  await harness.settle()
  harness.flush(3)
  assert.ok(harness.fills.includes('rgb(190, 190, 190)'))
  assert.equal(harness.window.document.querySelector('canvas').getContext('2d').font, '400 14px DSHSans')
  harness.dispose()
})

test('renders each whitespace-delimited word as one ordered rain stream', async () => {
  const harness = createHarness()
  await harness.settle()
  harness.flush(3)
  harness.draws.length = 0
  harness.window.document.querySelector('[data-variant="think"]').dataset.state = 'ok'
  await harness.settle()
  harness.flush(2)
  const columns = Map.groupBy(harness.draws, draw => draw.x)
  const [first, second, third] = [...columns].sort(([left], [right]) => left - right).map(([, draws]) => draws)
  const staticFirst = first.slice(-5)
  assert.equal(staticFirst.map(draw => draw.text).join(''), 'first')
  assert.equal(second.slice(-8).map(draw => draw.text).join(''), 'streamed')
  assert.equal(third.slice(-6).map(draw => draw.text).join(''), 'tokens')
  assert.ok(staticFirst[1].y - staticFirst[0].y < 14)
  harness.dispose()
})

test('reveals a new word from its head one letter at a time', async () => {
  const values = [0, 0.5]
  const harness = createHarness({ reasoning: 'abcd', width: 14, random: () => values.shift() ?? 0 })
  await harness.settle()
  harness.flush()
  harness.draws.length = 0
  harness.flush()
  assert.equal(harness.draws.map(draw => draw.text).join(''), 'd')
  assert.ok(harness.draws[0].y > 24)
  harness.draws.length = 0
  harness.flush()
  assert.equal(harness.draws.map(draw => draw.text).join(''), 'cd')
  harness.dispose()
})

test('a new word waits for the current stream to leave the bottom', async () => {
  const harness = createHarness({ reasoning: 'a0 b1 c2 d3 e4 f5', width: 70, random: () => 0.5 })
  await harness.settle()
  harness.flush(30)
  const before = Map.groupBy(harness.draws, draw => draw.x)
  harness.draws.length = 0
  harness.window.document.querySelector('#reasoning').textContent += ' g6'
  await harness.settle()
  harness.flush(2)
  const after = Map.groupBy(harness.draws, draw => draw.x)
  const targetX = 21
  assert.equal(before.get(targetX).at(-1)?.text, '1')
  assert.equal(after.get(targetX).at(-1)?.text, '1')
  let sawQueuedWord = false
  for (let frame = 0; frame < 200; frame += 1) {
    harness.draws.length = 0
    harness.flush()
    if (harness.draws.some(draw => draw.text === '6')) sawQueuedWord = true
  }
  assert.ok(sawQueuedWord)
  harness.dispose()
})

test('a batch of new streams enters at noisy phases instead of as a wave', async () => {
  const harness = createHarness({ reasoning: 'a0 b1 c2 d3 e4', width: 70, random: () => 0.5 })
  await harness.settle()
  harness.flush(3)
  let seed = 7
  harness.window.Math.random = () => 0.1 + 0.8 * (((seed = seed * 16807 % 2147483647) - 1) / 2147483646)
  harness.window.document.querySelector('#reasoning').textContent += ' f5 g6 h7 i8 j9'
  await harness.settle()
  const targets = new Set(['5', '6', '7', '8', '9'])
  const firstSeen = new Map()
  for (let frame = 0; frame < 260; frame += 1) {
    harness.draws.length = 0
    harness.flush()
    for (const draw of harness.draws) {
      if (targets.has(draw.text) && !firstSeen.has(draw.text)) firstSeen.set(draw.text, frame)
    }
  }
  assert.equal(firstSeen.size, targets.size)
  assert.ok(Math.max(...firstSeen.values()) - Math.min(...firstSeen.values()) >= 12)
  harness.dispose()
})

test('keeps one blue stream whenever rain is visible', async () => {
  const harness = createHarness({ reasoning: 'one two three four', width: 70, random: () => 0.5 })
  await harness.settle()
  let paintedFrames = 0
  let sawBlueTrail = false
  let sawBlueHead = false
  for (let frame = 0; frame < 120; frame += 1) {
    harness.draws.length = 0
    harness.flush()
    if (harness.draws.length === 0) continue
    paintedFrames += 1
    const blueTrail = harness.draws.some(draw => draw.fill === 'rgb(65, 118, 230)')
    const blueHead = harness.draws.some(draw => draw.fill === 'rgb(211, 226, 255)')
    sawBlueTrail ||= blueTrail
    sawBlueHead ||= blueHead
    assert.ok(blueTrail || blueHead)
  }
  assert.ok(paintedFrames > 0)
  assert.ok(sawBlueTrail && sawBlueHead)
  harness.dispose()
})

test('renders em dashes as whale emoji', async () => {
  const harness = createHarness({ reasoning: 'alpha — omega' })
  await harness.settle()
  harness.flush(3)
  harness.draws.length = 0
  harness.window.document.querySelector('[data-variant="think"]').dataset.state = 'ok'
  await harness.settle()
  harness.flush(2)
  assert.ok(harness.draws.some(draw => draw.text === '🐋'))
  assert.ok(!harness.draws.some(draw => draw.text === '—'))
  harness.dispose()
})
