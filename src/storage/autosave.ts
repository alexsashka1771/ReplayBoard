import type { Project } from '../domain/types'
import { DraftConflictError } from './drafts'

export type SaveState = 'dirty' | 'saving' | 'saved' | 'error'
export class Autosave {
  private pending: Project | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private inFlight: Promise<boolean> | null = null

  constructor(
    private writer: (project: Project) => Promise<void>,
    private notify: (state: SaveState, error: string | null) => void,
    private delayMs = 250,
  ) {}

  schedule(project: Project) {
    this.pending = project
    this.notify('dirty', null)
    if (this.timer === null) this.timer = setTimeout(() => { void this.flush() }, this.delayMs)
  }

  flush(): Promise<boolean> {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    if (this.inFlight) return this.inFlight
    if (!this.pending) return Promise.resolve(true)
    this.inFlight = this.commit().finally(() => { this.inFlight = null })
    return this.inFlight
  }

  private async commit(): Promise<boolean> {
    while (this.pending) {
      const project = this.pending
      this.pending = null
      this.notify('saving', null)
      try {
        await this.writer(project)
      } catch (error) {
        this.pending ??= project
        const message = error instanceof DraftConflictError ? error.message :
          error instanceof DOMException && error.name === 'QuotaExceededError'
            ? 'Не хватает места в хранилище браузера. Изменения пока не сохранены.'
            : 'Не удалось сохранить изменения в браузере. Попробуйте ещё раз.'
        this.notify('error', message)
        return false
      }
    }
    this.notify('saved', null)
    return true
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }
}
