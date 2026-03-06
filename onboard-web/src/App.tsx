import { Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'motion/react'
import Welcome from './pages/Welcome'
import Callback from './pages/Callback'
import Dashboard from './pages/Dashboard'
import AddAccountCallback from './pages/AddAccountCallback'
import Privacy from './pages/Privacy'
import Terms from './pages/Terms'
import DebugDashboard from './pages/DebugDashboard'
import DeleteAccount from './pages/DeleteAccount'
import Support from './pages/Support'
import HirafuCallback from './pages/HirafuCallback'
import { Navigate } from 'react-router-dom'

export default function App() {
  const location = useLocation()

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<Welcome />} />
        <Route path="/callback" element={<Callback />} />
        <Route path="/hirafu/callback" element={<HirafuCallback />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/automations" element={<Navigate to="/dashboard?automations=open" replace />} />
        <Route path="/add-account-callback" element={<AddAccountCallback />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/debug" element={<DebugDashboard />} />
        <Route path="/support" element={<Support />} />
        <Route path="/delete-account" element={<DeleteAccount />} />
      </Routes>
    </AnimatePresence>
  )
}
