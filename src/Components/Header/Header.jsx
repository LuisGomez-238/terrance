import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../AuthContext';
import './Header.scss';
import { useLoading } from '../../contexts/LoadingContext';

function Header() {
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const { showLoading, hideLoading } = useLoading();
  
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
          <h1><span>F&I</span> Manager</h1>
        </div>
        
        {/* Optional: Quick nav items */}
        <div className="quick-nav">
          <a href="/deals/new" className="nav-item">
            <span className="item-text">New Deal</span>
          </a>
          <a href="/lenders" className="nav-item">
            <span className="item-text">Lenders</span>
          </a>
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
            </div>
            <span className="material-icons chevron-icon">
              expand_more
            </span>
          </button>
          
          <div className={`profile-dropdown ${showProfileMenu ? 'open' : ''}`}>
            <ul>
              <li>
                <button onClick={() => navigate('/profile')}>
                  <span className="material-icons item-icon">person</span>
                  Profile
                </button>
              </li>
              <li>
                <button onClick={() => navigate('/reports')}>
                  <span className="material-icons item-icon">bar_chart</span>
                  Reports
                </button>
              </li>
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