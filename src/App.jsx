import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import React from 'react';

// Layouts
import AppLayout from './AppLayout';

// Pages
import Login from './Pages/Login/Login';
import Dashboard from './Components/Dashboard/Dashboard';
import Deals from './Pages/Deals/Deals';
import NewDeal from './Pages/NewDeal/NewDeal';
import DealDetails from './Pages/DealDetails/DealDetails';
import Lenders from './Pages/Lenders/Lenders';
import LenderDetails from './Pages/LenderDetails/LenderDetails';
import Reports from './Pages/Reports/Reports';
import AiAssistant from './Pages/AiAssistant/AiAssistant';
import Profile from './Pages/Profile/Profile';

// Context
import { AuthProvider } from './AuthContext';
import { ProfileProvider } from './contexts/ProfileContext';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return <div className="loading-screen">Loading...</div>;
  }

  return (
    <AuthProvider>
      <ProfileProvider>
        <Router>
          <Routes>
            <Route path="/login" element={!user ? <Login /> : <Navigate to="/" />} />
            
            <Route path="/" element={user ? <AppLayout /> : <Navigate to="/login" />}>
              <Route index element={<Dashboard />} />
              <Route path="deals" element={<Deals />} />
              <Route path="deals/new" element={<NewDeal />} />
              <Route path="deals/:dealId" element={<DealDetails />} />
              <Route path="lenders" element={<Lenders />} />
              <Route path="lenders/:lenderId" element={<LenderDetails />} />
              <Route path="reports" element={<Reports />} />
              <Route path="ai-assistant" element={<AiAssistant />} />
              <Route path="profile" element={<Profile />} />
            </Route>
          </Routes>
        </Router>
      </ProfileProvider>
    </AuthProvider>
  );
}

export default App;