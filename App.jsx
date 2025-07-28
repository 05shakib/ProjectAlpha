import { useState } from 'react'
import Dashboard from './pages/Dashboard'
import DeveloperShowcase from './pages/DeveloperShowcase'

function App() {
  const [showDashboard, setShowDashboard] = useState(true)

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="flex justify-center mb-4 space-x-4">
        <button className="px-4 py-2 bg-blue-600 text-white rounded" onClick={() => setShowDashboard(true)}>Dashboard</button>
        <button className="px-4 py-2 bg-gray-600 text-white rounded" onClick={() => setShowDashboard(false)}>Developer</button>
      </div>
      {showDashboard ? <Dashboard /> : <DeveloperShowcase />}
    </div>
  )
}

export default App
