import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import NavBar from './components/NavBar'

function ScrollHandler() {
  const { pathname, hash } = useLocation()

  useEffect(() => {
    if (hash) {
      const el = document.querySelector(hash)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' })
        return
      }
    }
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [pathname, hash])

  return null
}

export default function App() {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      <ScrollHandler />
      <NavBar />
      <div className="flex-1">
        <Outlet />
      </div>
    </div>
  )
}
