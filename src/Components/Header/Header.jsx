import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../AuthContext';
import './Header.scss';
import { useLoading } from '../../contexts/LoadingContext';

function Header() {
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const { currentUser, logout, isSalesManager } = useAuth();
  const navigate = useNavigate();
  const { showLoading, hideLoading } = useLoading();
  
  // Use the isSalesManager function to determine if user is a Sales Manager
  const userIsSalesManager = isSalesManager();
  
  async function handleLogout() {
    try {
      showLoading("Logging out...");
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Failed to log out', error);
    } finally {
      hideLoading();
    } 
  }
  
  return (
    <header className="app-header">
      <div className="header-left">
        <div className="logo">
          <h1>
            {userIsSalesManager ? (
              <><span>Sales</span> Manager</>
            ) : (
              <><span>F&I</span> Manager</>
            )}
          </h1>
        </div>
        
        {/* Quick nav items - different for each role */}
        <div className="quick-nav">
          {userIsSalesManager ? (
            // Sales Manager quick links
            <>
              <a href="/sales-dashboard" className="nav-item">
                <span className="item-text">Dashboard</span>
              </a>
              <a href="/funding-status" className="nav-item">
                <span className="item-text">Funding</span>
              </a>
            </>
          ) : (
            // Finance Manager quick links
            <>
              <a href="/deals/new" className="nav-item">
                <span className="item-text">New Deal</span>
              </a>
              <a href="/lenders" className="nav-item">
                <span className="item-text">Lenders</span>
              </a>
            </>
          )}
        </div>
      </div>
      
      <div className="header-right">
        {/* Optional: Notification bell */}
        <div className="notifications">
          <button className="notification-btn has-notifications">
            <span className="material-icons">notifications</span>
          </button>
        </div>
        
        <div className="user-profile">
          <button 
            className={`profile-button ${showProfileMenu ? 'open' : ''}`}
            onClick={() => setShowProfileMenu(!showProfileMenu)}
          >
            <div className="avatar">
              {currentUser?.displayName?.charAt(0) || 'U'}
            </div>
            <div className="user-info">
              <span className="user-name">{currentUser?.displayName || 'User'}</span>
              {userIsSalesManager && <span className="user-role">Sales Manager</span>}
            </div>
            <span className="material-icons chevron-icon">
              expand_more
            </span>
          </button>
          
          <div className={`profile-dropdown ${showProfileMenu ? 'open' : ''}`}>
            <ul>
              <li>
                <button onClick={() => navigate(userIsSalesManager ? '/sales-dashboard' : '/profile')}>
                  <span className="material-icons item-icon">person</span>
                  {userIsSalesManager ? 'Dashboard' : 'Profile'}
                </button>
              </li>
              <li>
                <button onClick={() => navigate(userIsSalesManager ? '/sales-reports' : '/reports')}>
                  <span className="material-icons item-icon">bar_chart</span>
                  Reports
                </button>
              </li>
              {userIsSalesManager && (
                <li>
                  <button onClick={() => navigate('/sales-targets')}>
                    <span className="material-icons item-icon">track_changes</span>
                    Targets
                  </button>
                </li>
              )}
              <li className="logout">
                <button onClick={handleLogout}>
                  <span className="material-icons item-icon">logout</span>
                  Sign Out
                </button>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </header>
  );
}

export default Header;