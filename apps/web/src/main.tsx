import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './app/App'
import { registerServiceWorker } from './lib/pwa'
import './index.css'

const container = document.getElementById('root')
if (!container) throw new Error('#root fehlt in index.html')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

registerServiceWorker()
