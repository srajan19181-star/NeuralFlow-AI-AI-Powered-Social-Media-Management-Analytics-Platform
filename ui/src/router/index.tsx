import React, { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import App from '../App'

const Dashboard = lazy(() => import('../views/Dashboard'))
const Compose = lazy(() => import('../views/Compose'))
const Scheduler = lazy(() => import('../views/Scheduler'))
const Media = lazy(() => import('../views/Media'))
const Analytics = lazy(() => import('../views/Analytics'))
const Competitors = lazy(() => import('../views/Competitors'))
const CalendarPlan = lazy(() => import('../views/CalendarPlan'))
const Settings = lazy(() => import('../views/Settings'))
const GlobalSettings = lazy(() => import('../views/GlobalSettings'))
const LocalAssistant = lazy(() => import('../views/LocalAssistant'))

function SuspenseWrapper({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<div className="p-6 text-gray-500">Loading...</div>}>{children}</Suspense>
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      {
        index: true,
        element: <Navigate to="/dashboard" replace />,
      },
      {
        path: 'dashboard',
        element: <SuspenseWrapper><Dashboard /></SuspenseWrapper>,
      },
      {
        path: 'compose',
        element: <SuspenseWrapper><Compose /></SuspenseWrapper>,
      },
      {
        path: 'scheduler',
        element: <SuspenseWrapper><Scheduler /></SuspenseWrapper>,
      },
      {
        path: 'media',
        element: <SuspenseWrapper><Media /></SuspenseWrapper>,
      },
      {
        path: 'analytics',
        element: <SuspenseWrapper><Analytics /></SuspenseWrapper>,
      },
      {
        path: 'competitors',
        element: <SuspenseWrapper><Competitors /></SuspenseWrapper>,
      },
      {
        path: 'calendar-plan',
        element: <SuspenseWrapper><CalendarPlan /></SuspenseWrapper>,
      },
      {
        path: 'settings',
        element: <SuspenseWrapper><Settings /></SuspenseWrapper>,
      },
      {
        path: 'global-settings',
        element: <SuspenseWrapper><GlobalSettings /></SuspenseWrapper>,
      },
      {
        path: 'local-assistant',
        element: <SuspenseWrapper><LocalAssistant /></SuspenseWrapper>,
      },
    ],
  },
])

export default router
