import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../AuthContext';
import './Unauthorized.scss';

function Unauthorized() {
  const { currentUser, userRole } = useAuth();

  return (
    <div className="unauthorized-container">
      <div className="unauthorized-content">
        <div className="icon-container">
          <span className="material-icons">gpp_bad</span>
        </div>
        <h1>Access Denied</h1>
        <p>
          You don't have permission to access this page. 
          {userRole && (
            <span> Your current role is <strong>{userRole}</strong>.</span>
          )}
        </p>
        <div className="action-buttons">
          <Link to={userRole === 'sales_manager' ? '/sales-dashboard' : '/deals'} className="primary-button">
            Go to Dashboard
          </Link>
          <Link to="/" className="secondary-button">
            Go Home
          </Link>
        </div>
      </div>
    </div>
  );
}

export default Unauthorized;
