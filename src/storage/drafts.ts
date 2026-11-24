import Dexie from 'dexie'
import type { Table } from 'dexie'
import type { Project } from '../domain/types'
import { parseProject } from '../domain/project'

export class DraftConflictError extends Error {
  constructor() {
    super('Проект обновлён в другой вкладке. Откройте его заново, чтобы продолжить.')
    this.name = 'DraftConflictError'
  }
}

export class DraftRepository {
  private db: Dexie
  private projects: Table<Project, string>

  constructor(name = 'ReplayBoard') {
    this.db = new Dexie(name)
    this.db.version(1).stores({ projects: '&projectId,updatedAt' })
    this.projects = this.db.table('projects')
  }

  async save(project: Project, expectedRevision: number | null): Promise<void> {
    const snapshot = structuredClone(project)
    await this.db.transaction('rw', this.projects, async () => {
      const existing = await this.projects.get(snapshot.projectId)
      if (expectedRevision === null) {
        if (existing) throw new DraftConflictError()
      } else if (!existing || existing.revision !== expectedRevision) {
        throw new DraftConflictError()
      }
      if (existing && (existing.revision > snapshot.revision ||
          (existing.revision === snapshot.revision && JSON.stringify(existing) !== JSON.stringify(snapshot)))) {
        throw new DraftConflictError()
      }
      await this.projects.put(snapshot)
    })
  }

  async load(projectId: string): Promise<Project | null> {
    const project = await this.projects.get(projectId)
    return project ? parseProject(project) : null
  }

  async list(): Promise<Project[]> {
    const projects = await this.projects.toArray()
    return projects.map(parseProject).sort((a, b) => b.updatedAt - a.updatedAt)
  }

  close() { this.db.close() }
}
