import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../AuthContext';

function SalesManagerRoute({ children }) {
  const { currentUser, isSalesManager, loading } = useAuth();

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!currentUser) {
    return <Navigate to="/login" />;
  }

  if (!isSalesManager()) {
    return <Navigate to="/" />;
  }

  return children;
}

export default SalesManagerRoute;
