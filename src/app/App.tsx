import { useEffect, useState } from 'react'
import { AlertCircle, ArrowLeft } from 'lucide-react'
import { Brand } from '../components/ui/Brand'
import { DraftRepository } from '../storage/drafts'
import { ProjectFormatError } from '../domain/project'
import { HomeScreen } from '../features/home/HomeScreen'
import { EditorController } from '../features/editor/controller'
import { EditorScreen } from '../features/editor/EditorScreen'
import { PlayerScreen } from '../features/player/PlayerScreen'
import { getDemos } from '../features/home/demos'

const repository = new DraftRepository()
type Route = { kind: 'home' } | { kind: 'project'; id: string } | { kind: 'sample'; id: string }

function currentRoute(): Route {
  const path = window.location.hash.slice(1)
  const project = path.match(/^\/project\/([a-zA-Z0-9-]+)$/)
  if (project) return { kind: 'project', id: project[1] }
  const sample = path.match(/^\/sample\/([a-zA-Z0-9-]+)$/)
  if (sample) return { kind: 'sample', id: sample[1] }
  return { kind: 'home' }
}

function navigate(path: string) { window.location.hash = path }
function home() { navigate('/') }

function RouteStatus({ error }: { error?: string }) {
  return <div className="route-status"><Brand onClick={home} />
    <div>{error ? <><AlertCircle size={28} /><h1>История пока недоступна</h1><p>{error}</p>
      <button className="button secondary" onClick={home}><ArrowLeft size={15} /> К историям</button></>
      : <><span className="spinner" /><p>Открываем вашу историю</p></>}</div></div>
}

function ProjectRoute({ id }: { id: string }) {
  const [controller, setController] = useState<EditorController | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    let editor: EditorController | null = null
    repository.load(id).then(project => {
      if (!active) return
      if (!project) { setError('В этом браузере не найден такой черновик.'); return }
      editor = new EditorController(project, (value, expectedRevision) => repository.save(value, expectedRevision))
      setController(editor)
    }).catch(error => {
      if (active) setError(error instanceof ProjectFormatError ? error.message : 'Не удалось прочитать данные проекта в этом браузере.')
    })
    return () => { active = false; editor?.dispose() }
  }, [id])

  if (error) return <RouteStatus error={error} />
  if (!controller) return <RouteStatus />
  const back = async () => {
    controller.stopRecording()
    if (await controller.flush()) home()
  }
  return <EditorScreen controller={controller} onHome={back} />
}

function SampleRoute({ id }: { id: string }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const demo = getDemos().find(demo => demo.id === id)
  if (!demo) return <RouteStatus error="Такой пример не найден." />
  const segment = demo.project.segments[demo.project.rootSegmentId!]
  async function copy() {
    if (busy || !demo) return
    setBusy(true)
    setError(null)
    const now = Date.now()
    const project = {
      ...structuredClone(demo.project), projectId: crypto.randomUUID(), title: demo.project.title + ' — моя версия',
      createdAt: now, updatedAt: now, revision: 0,
    }
    try {
      await repository.save(project, null)
      navigate('/project/' + project.projectId)
    } catch { setError('Не удалось сохранить копию истории в этом браузере. Попробуйте ещё раз.') }
    finally { setBusy(false) }
  }
  return <>
    <PlayerScreen title={demo.project.title} segment={segment} description={demo.description}
      onHome={home} onCopy={busy ? undefined : () => { void copy() }} />
    {error ? <div className="global-error" role="alert">{error}</div> : null}
  </>
}

export function App() {
  const [route, setRoute] = useState<Route>(currentRoute)
  useEffect(() => {
    const change = () => { setRoute(currentRoute()); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', change)
    return () => window.removeEventListener('hashchange', change)
  }, [])
  if (route.kind === 'project') return <ProjectRoute key={route.id} id={route.id} />
  if (route.kind === 'sample') return <SampleRoute key={route.id} id={route.id} />
  return <HomeScreen repository={repository} onOpen={id => navigate('/project/' + id)} onDemo={id => navigate('/sample/' + id)} />
}
