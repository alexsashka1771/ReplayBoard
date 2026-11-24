import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function openDemo(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Смотреть «Почему заказ создался дважды?»', exact: true }).click()
  await expect(page.getByRole('slider', { name: 'Позиция воспроизведения' })).toBeVisible()
}

async function seek(page: Page, position: number) {
  await page.getByRole('slider', { name: 'Позиция воспроизведения' }).evaluate((element, next) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(element, String(next))
    element.dispatchEvent(new Event('input', { bubbles: true }))
  }, position)
  await expect(page.getByRole('slider', { name: 'Позиция воспроизведения' })).toHaveValue(String(position))
}

test('draws an arrow at the story position and restores it after seeking backwards', async ({ page }) => {
  await openDemo(page)
  await seek(page, 1200)
  const arrow = page.locator('[data-connection-id="request"]')
  await expect(arrow).toBeVisible()
  const progress = Number(await arrow.getAttribute('data-draw-progress'))
  expect(progress).toBeGreaterThan(0)
  expect(progress).toBeLessThan(1)
  const partialPath = await arrow.locator('.connection-line').getAttribute('d')
  await seek(page, 2100)
  await expect(arrow).toHaveAttribute('data-draw-progress', '1')
  expect(await arrow.locator('.connection-line').getAttribute('d')).not.toBe(partialPath)
  await seek(page, 1200)
  await expect(arrow.locator('.connection-line')).toHaveAttribute('d', partialPath!)
  await seek(page, 999)
  await expect(arrow).toHaveCount(0)
})

test('types a pasted explanation in place and finishes it by the end of the recording', async ({ page }) => {
  await openDemo(page)
  await seek(page, 7800)
  const note = page.locator('[data-object-id="duplicate"] .object-copy')
  await expect(note).toBeInViewport()
  const visible = await note.innerText()
  expect(visible.replace(/\s+/g, ' ')).toMatch(/^Два /)
  expect(visible.replace(/\s+/g, ' ')).not.toBe('Два заказа вместо одного')
  await expect(note.locator('.typing-caret')).toBeVisible()
  const height = await note.locator('.object-copy-content').evaluate(element => (element as HTMLElement).offsetHeight)
  await seek(page, 13000)
  await expect(note).toHaveText('Два заказа\nвместо одного', { useInnerText: true })
  expect(await note.locator('.object-copy-content').evaluate(element => (element as HTMLElement).offsetHeight)).toBe(height)
  await expect(note.locator('.typing-caret')).toHaveCount(0)
  await seek(page, 7800)
  await expect(note).toHaveText(visible, { useInnerText: true })
})

test('freezes a drawing on pause and follows the current reduced-motion preference', async ({ page }) => {
  await openDemo(page)
  await seek(page, 1200)
  await page.getByRole('button', { name: 'Воспроизвести', exact: true }).click()
  await page.getByRole('button', { name: 'Пауза', exact: true }).click()
  const arrow = page.locator('[data-connection-id="request"]')
  const frozen = await arrow.locator('.connection-line').getAttribute('d')
  await page.waitForTimeout(250)
  await expect(arrow.locator('.connection-line')).toHaveAttribute('d', frozen!)
  await seek(page, 1200)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(arrow).toHaveAttribute('data-draw-progress', '1')
  await seek(page, 7800)
  const note = page.locator('[data-object-id="duplicate"] .object-copy')
  await expect(note).toHaveText('Два заказа\nвместо одного', { useInnerText: true })
  await expect(note.locator('.typing-caret')).toHaveCount(0)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect(note.locator('.text-pending')).toBeAttached()
})

test('fits objects clear of tools when the canvas is narrower than the window', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'Authoring layout is verified on desktop')
  await openDemo(page)
  await page.getByRole('button', { name: 'Создать свою версию', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Название истории', exact: true })).toBeVisible()
  for (const width of [1000, 800]) {
    await page.setViewportSize({ width, height: 768 })
    await page.getByRole('button', { name: 'Вписать доску', exact: true }).click()
    const tools = await page.getByRole('toolbar', { name: 'Инструменты доски' }).boundingBox()
    const node = await page.getByRole('button', { name: 'Блок: Пользователь', exact: true }).boundingBox()
    if (!tools || !node) throw new Error('The tools or fitted node was not rendered')
    const overlap = node.x < tools.x + tools.width && node.x + node.width > tools.x &&
      node.y < tools.y + tools.height && node.y + node.height > tools.y
    expect(overlap, 'Tools must not cover a fitted node at window width ' + width).toBe(false)
  }
})

test('keeps keyboard focus visible against the dark transport', async ({ page }) => {
  await openDemo(page)
  await page.getByRole('slider', { name: 'Позиция воспроизведения' }).focus()
  await page.keyboard.press('Tab')
  const restart = page.getByRole('button', { name: 'К началу', exact: true })
  await expect(restart).toBeFocused()
  const ratio = await restart.evaluate(element => {
    function luminance(color: string) {
      const [red, green, blue] = color.match(/[\d.]+/g)!.slice(0, 3).map(value => {
        const channel = Number(value) / 255
        return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4
      })
      return .2126 * red + .7152 * green + .0722 * blue
    }
    const focus = luminance(getComputedStyle(element).outlineColor)
    const background = luminance(getComputedStyle(element.closest('.player-transport')!).backgroundColor)
    return (Math.max(focus, background) + .05) / (Math.min(focus, background) + .05)
  })
  expect(ratio).toBeGreaterThanOrEqual(3)
})
