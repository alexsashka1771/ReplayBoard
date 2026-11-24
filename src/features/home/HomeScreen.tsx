import { useEffect, useState } from 'react'
import { ArrowRight, ArrowUpRight, BookOpen, Braces, CircleHelp, Clock3, FilePlus2, FolderOpen, Monitor, Play, Plus } from 'lucide-react'
import { Brand } from '../../components/ui/Brand'
import { Dialog } from '../../components/ui/Dialog'
import { BoardPreview } from '../../components/board/BoardPreview'
import { createProject } from '../../domain/project'
import type { Project } from '../../domain/types'
import type { DraftRepository } from '../../storage/drafts'
import { formatDate, formatTime } from '../../utils/format'
import { getDemos } from './demos'

interface Props {
  repository: DraftRepository
  onOpen: (projectId: string) => void
  onDemo: (demoId: string) => void
}

export function HomeScreen({ repository, onOpen, onDemo }: Props) {
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [help, setHelp] = useState(false)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const demos = getDemos()

  useEffect(() => {
    let active = true
    repository.list().then(value => { if (active) setProjects(value) }).catch(() => {
      if (active) setError('Не удалось прочитать локальные истории. Данные остаются в этом браузере.')
    })
    return () => { active = false }
  }, [repository])

  function openCreate() { setTitle(''); setCreateError(null); setCreating(true) }

  async function create() {
    setBusy(true)
    setCreateError(null)
    const project = createProject(title)
    try {
      await repository.save(project, null)
      onOpen(project.projectId)
    } catch {
      setCreateError('Не удалось создать историю в хранилище браузера. Попробуйте ещё раз.')
    } finally { setBusy(false) }
  }

  async function retry() {
    setError(null)
    setProjects(null)
    try { setProjects(await repository.list()) }
    catch { setError('Не удалось прочитать локальные истории. Попробуйте ещё раз.') }
  }

  return <div className="home">
    <header className="home-header">
      <Brand onClick={() => window.scrollTo({ top: 0, behavior: 'instant' })} />
      <nav className="home-nav"><span className="nav-current">Мои истории</span>
        <button onClick={() => setHelp(true)}>Как это работает <CircleHelp size={14} /></button></nav>
      <div className="local-label"><Monitor size={16} /><span>Локальная студия</span></div>
    </header>
    <main className="home-content">
      <section className="home-hero">
        <div className="hero-copy">
          <h1>Дайте мысли<span className="cobalt">движение.</span></h1>
          <p>Запишите, как рождается объяснение.<br className="desktop-break" /> С линиями, словами и ходом вашей мысли.</p>
          <div className="hero-actions">
            <button className="button primary large" onClick={openCreate}><Plus size={19} /> Новая история</button>
            <button className="text-button" onClick={() => onDemo('orders')}><Play size={15} /> Посмотреть пример</button>
          </div>
          <div className="hero-caption"><span className="tiny-dot" /> Ваша доска. Ваш темп.</div>
        </div>
        <button className="hero-demo" aria-label="Открыть пример объяснения" onClick={() => onDemo(demos[0].id)}>
          <div className="hero-demo-top"><span><span className="tiny-dot" /> Запись доски</span>
            <span>{formatTime(demos[0].project.segments[demos[0].project.rootSegmentId!].durationMs)}</span></div>
          <BoardPreview board={demos[0].project.workingState.board} />
          <div className="hero-demo-bottom"><div><span>Посмотрите, как это работает</span><strong>{demos[0].project.title}</strong></div>
            <span className="cover-play"><Play size={19} fill="currentColor" /></span></div>
        </button>
      </section>

      <div className="home-workbench">
      <section className="project-section" aria-labelledby="projects-heading">
        <div className="section-heading"><div className="heading-with-count"><h2 id="projects-heading">Ваши истории</h2>
          <span className="count-pill">{projects?.length ?? '…'}</span></div>
          <span className="sort-caption"><Clock3 size={13} /> Последние изменения</span>
        </div>
        {error ? <div className="empty-state error-state" role="alert"><FolderOpen size={28} /><h3>Истории пока недоступны</h3>
          <p>{error}</p><button className="button secondary" onClick={() => { void retry() }}>Повторить</button></div>
          : projects === null ? <div className="loading-state" role="status"><span className="spinner" /> Загружаем истории</div>
          : projects.length === 0 ? <div className="empty-state">
            <div className="empty-icon"><FilePlus2 size={27} strokeWidth={1.3} /></div>
            <div><h3>Место для вашей первой истории</h3><p>Начните с нескольких блоков. Дальше — просто объясняйте.</p></div>
            <button className="button secondary" onClick={openCreate}>Начать историю <ArrowUpRight size={16} /></button>
          </div>
          : <div className="project-grid">
            {projects.map(project => {
              const segment = project.rootSegmentId ? project.segments[project.rootSegmentId] : null
              return <article className="project-card" key={project.projectId}>
                <button className="project-card-link" onClick={() => onOpen(project.projectId)} aria-label={'Открыть «' + project.title + '»'}>
                  <BoardPreview board={project.workingState.board} />
                  <div className="project-card-body"><div className="project-card-title"><h3>{project.title}</h3><ArrowUpRight size={17} /></div>
                    <div className="project-card-meta"><span>{formatDate(project.updatedAt)}</span><span>{segment ? formatTime(segment.durationMs) : 'Без записи'}</span></div></div>
                </button>
              </article>
            })}
            <button className="new-project-tile" onClick={openCreate}><Plus size={24} strokeWidth={1.3} /><span>Ещё одна история</span></button>
          </div>}
      </section>

      <section className="demo-section" aria-labelledby="demos-heading">
        <div className="section-heading"><h2 id="demos-heading">Готовые объяснения</h2>
          <span className="demo-section-note">Смотреть и исследовать</span></div>
        <div className="demo-grid">
          {demos.map(demo => {
            const segment = demo.project.segments[demo.project.rootSegmentId!]
            return <article className={'demo-card demo-' + demo.kind} key={demo.id}>
              <div className="demo-card-art"><BoardPreview board={demo.project.workingState.board} />
                <span className="duration-badge"><Play size={10} fill="currentColor" /> {formatTime(segment.durationMs)}</span></div>
              <div className="demo-card-content">
                <h3>{demo.project.title}</h3>
                <div className="demo-kind">{demo.kind === 'engineering' ? <Braces size={14} /> : <BookOpen size={14} />}
                  {demo.kind === 'engineering' ? 'Инженерный разбор' : 'Короткий урок'}</div>
                <p>{demo.description}</p>
                <button className="demo-open" aria-label={'Смотреть «' + demo.project.title + '»'} onClick={() => onDemo(demo.id)}>
                  Смотреть <ArrowRight size={16} /></button>
              </div>
            </article>
          })}
        </div>
      </section>
      </div>
      <footer className="home-footer"><span>Replay Board</span><span>Хорошее объяснение оставляет место для исследования.</span></footer>
    </main>
    {creating ? <Dialog title="Новая история" onClose={() => { if (!busy) setCreating(false) }}>
      <p className="dialog-description">Название можно изменить в любой момент. Начните с того, что хотите объяснить.</p>
      <form onSubmit={event => { event.preventDefault(); void create() }}>
        <label className="field-label">Название истории<input autoFocus value={title} onChange={event => setTitle(event.target.value)}
          placeholder="Например, как устроен наш сервис" maxLength={140} /></label>
        {createError ? <p className="field-error" role="alert">{createError}</p> : null}
        <div className="dialog-actions"><button type="button" className="button secondary" onClick={() => setCreating(false)} disabled={busy}>Отмена</button>
          <button className="button primary" disabled={busy}>{busy ? <span className="spinner" /> : <Plus size={16} />} Создать историю</button></div>
      </form>
    </Dialog> : null}
    {help ? <Dialog title="От идеи к объяснению" onClose={() => setHelp(false)}>
      <ol className="help-steps"><li><span>01</span><div><h3>Постройте начало</h3><p>Добавьте блоки, текст и связи. Это отправная точка вашей истории.</p></div></li>
        <li><span>02</span><div><h3>Включите запись и объясняйте</h3><p>Создавайте и перемещайте объекты. Приложение запомнит ход действий. Голос для этого не нужен.</p></div></li>
        <li><span>03</span><div><h3>Посмотрите глазами зрителя</h3><p>Воспроизводите историю, перематывайте и исследуйте схему на паузе.</p></div></li></ol>
      <div className="help-note"><Monitor size={16} /> Черновики сохраняются в этом браузере автоматически.</div>
    </Dialog> : null}
  </div>
}
