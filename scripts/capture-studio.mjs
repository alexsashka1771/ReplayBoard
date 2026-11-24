import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const round = process.argv[2] ?? 'initial'
if (!['initial', 'confirm'].includes(round)) throw new Error('Use initial or confirm')
const output = resolve('artifacts', 'visual', 'live-' + round)
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const results = []
const errors = []

async function settle(page) {
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => document.fonts.ready)
}

async function capture(page, name) {
  await settle(page)
  await page.screenshot({ path: resolve(output, name + '.png'), fullPage: true, animations: 'disabled' })
  results.push(await page.evaluate(name => ({
    name,
    viewport: [innerWidth, innerHeight],
    overflow: document.documentElement.scrollWidth > innerWidth,
    board: (() => {
      const bounds = document.querySelector('.player-board-shell')?.getBoundingClientRect()
      return bounds ? [Math.round(bounds.width), Math.round(bounds.height)] : null
    })(),
    visibleText: document.querySelector('[data-object-id="duplicate"] .object-copy')?.innerText,
    textInBoard: (() => {
      const text = document.querySelector('[data-object-id="duplicate"] .object-copy')?.getBoundingClientRect()
      const board = document.querySelector('.player-board-shell')?.getBoundingClientRect()
      return text && board ? text.right > board.left && text.left < board.right && text.bottom > board.top && text.top < board.bottom : null
    })(),
  }), name))
}

async function seek(page, position) {
  await page.getByRole('slider', { name: 'Позиция воспроизведения' }).evaluate((element, next) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, String(next))
    element.dispatchEvent(new Event('input', { bubbles: true }))
  }, position)
}

try {
  for (const device of [
    { name: 'desktop', viewport: { width: 1440, height: 1000 } },
    { name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  ]) {
    const context = await browser.newContext({ ...device, deviceScaleFactor: 1, reducedMotion: 'no-preference' })
    const page = await context.newPage()
    page.on('pageerror', error => errors.push({ device: device.name, message: error.message }))
    await page.goto('http://127.0.0.1:5173/')
    await page.getByRole('heading', { name: 'Место для вашей первой истории' }).waitFor()
    await capture(page, 'home-' + device.name)
    await page.getByRole('button', { name: 'Открыть пример объяснения' }).click()
    await page.getByRole('slider', { name: 'Позиция воспроизведения' }).waitFor()
    await seek(page, 1200)
    await capture(page, 'player-draw-' + device.name)
    await seek(page, 7800)
    await capture(page, 'player-type-' + device.name)
    await seek(page, 13000)
    await capture(page, 'player-end-' + device.name)
    if (device.name === 'desktop') {
      await page.getByRole('button', { name: 'Создать свою версию', exact: true }).click()
      await page.getByRole('textbox', { name: 'Название истории', exact: true }).waitFor()
      await page.getByRole('button', { name: 'Вписать доску', exact: true }).click()
      await page.getByRole('button', { name: 'Блок: Сервер', exact: true }).click()
      await page.getByLabel('Состояние сохранения').filter({ hasText: 'Сохранено' }).waitFor()
      await capture(page, 'editor-desktop')
      await page.setViewportSize({ width: 1024, height: 768 })
      await page.getByRole('button', { name: 'Вписать доску', exact: true }).click()
      await page.getByLabel('Состояние сохранения').filter({ hasText: 'Сохранено' }).waitFor()
      await capture(page, 'editor-medium')
    }
    await context.close()
  }
  await writeFile(resolve(output, 'metrics.json'), JSON.stringify({ results, errors }, null, 2))
  console.log(JSON.stringify({ output, results, errors }, null, 2))
  if (errors.length || results.some(result => result.overflow)) process.exitCode = 1
} finally {
  await browser.close()
}
