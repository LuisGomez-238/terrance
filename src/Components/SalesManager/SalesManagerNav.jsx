import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../AuthContext';
import './SalesManagerNav.scss';

function SalesManagerNav({ collapsed, setCollapsed }) {
  const { currentUser } = useAuth();
  const location = useLocation();
  
  const isActive = (path) => {
    return location.pathname === path ? 'active' : '';
  };
  
  return (
    <nav className={`sales-manager-nav ${collapsed ? 'collapsed' : ''}`}>
      <ul className="nav-links">
        <li className={isActive('/sales-dashboard')}>
          <Link to="/sales-dashboard">
            <span className="material-icons">dashboard</span>
            <span className="link-text">Dashboard</span>
          </Link>
        </li>
        <li className={isActive('/sales-reports')}>
          <Link to="/sales-reports">
            <span className="material-icons">bar_chart</span>
            <span className="link-text">Reports</span>
          </Link>
        </li>
        <li className={isActive('/funding-status')}>
          <Link to="/funding-status">
            <span className="material-icons">account_balance</span>
            <span className="link-text">Funding</span>
          </Link>
        </li>
        <li className={isActive('/sales-targets')}>
          <Link to="/sales-targets">
            <span className="material-icons">track_changes</span>
            <span className="link-text">Targets</span>
          </Link>
        </li>
        
        {/* Collapse toggle as a nav item */}
        <li className="collapse-toggle-item">
          <button onClick={setCollapsed}>
            <span className="material-icons">
              {collapsed ? 'chevron_right' : 'chevron_left'}
            </span>
            <span className="link-text">Collapse</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}

export default SalesManagerNav;
