import React from 'react';
import { Toaster } from 'react-hot-toast';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

// Components
import Sidebar from './components/Sidebar';

// Pages
import Dashboard from './pages/Dashboard';
import Reports from './pages/Reports';
import Users from './pages/Users';
import Management from './pages/Management';

const App = () => {
  return (
    <Router>
      <div className="min-h-screen bg-bgDark flex">
        <Toaster position="top-right" reverseOrder={false} />
        
        {/* Sidebar */}
        <Sidebar />

        {/* Main Content Area */}
        <main className="flex-1 ml-64 p-8 min-h-screen">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/users" element={<Users />} />
            <Route path="/management" element={<Management />} />
            <Route path="/logs" element={<div className="p-20 text-center glass text-slate-500 italic">Admin Audit Logs coming soon...</div>} />
            <Route path="/settings" element={<div className="p-20 text-center glass text-slate-500 italic">Platform Settings coming soon...</div>} />
          </Routes>
        </main>
      </div>
    </Router>
  );
};

export default App;
