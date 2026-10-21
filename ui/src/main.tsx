import React from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import './style.css'
import router from './router'
import { useWorkspaceStore } from './stores/workspace'
import { library } from '@fortawesome/fontawesome-svg-core'
import {
  faGithub,
  faXTwitter,
  faLinkedin,
  faMastodon,
  faInstagram,
  faReddit,
  faYoutube,
  faFacebook,
  faPinterest,
  faTiktok,
  faBluesky,
} from '@fortawesome/free-brands-svg-icons'
import { faCloud } from '@fortawesome/free-solid-svg-icons'

library.add(
  faGithub,
  faXTwitter,
  faLinkedin,
  faMastodon,
  faInstagram,
  faReddit,
  faYoutube,
  faFacebook,
  faPinterest,
  faTiktok,
  faBluesky,
  faCloud
)

async function bootstrap() {
  const workspace = useWorkspaceStore()
  await workspace.init()
  const callbackWorkspace = new URLSearchParams(window.location.search).get('workspace')
  if (callbackWorkspace && workspace.workspaces.some((w) => w._id === callbackWorkspace)) {
    await workspace.setActive(callbackWorkspace)
  }

  const container = document.getElementById('app')
  if (container) {
    const root = createRoot(container)
    root.render(
      <React.StrictMode>
        <RouterProvider router={router} />
      </React.StrictMode>
    )
  }
}

bootstrap()
