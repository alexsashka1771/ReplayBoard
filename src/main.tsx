import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import '@fontsource-variable/golos-text'
import '@fontsource-variable/manrope'
import './styles/tokens.css'
import './styles/home.css'
import './styles/studio.css'
import './styles/player.css'

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
