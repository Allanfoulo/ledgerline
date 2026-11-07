import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'
import { ConvexReactClient } from 'convex/react'
import { ConvexAuthProvider } from '@convex-dev/auth/react'
import { ConnectedBackend } from './Backend'
import { AuthGate, SetupRequired } from './AuthGate'

const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined
const app = convexUrl ? <ConvexAuthProvider client={new ConvexReactClient(convexUrl)}><AuthGate><ConnectedBackend><App /></ConnectedBackend></AuthGate></ConvexAuthProvider> : <SetupRequired />
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {app}
  </React.StrictMode>,
)
