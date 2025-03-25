import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import './Sidebar.scss'; // Make sure this import is present

function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  
  // Group navigation items into sections
  const navigationSections = [
    {
      title: "Main",
      items: [
        { path: '/', label: 'Dashboard', icon: 'dashboard' },
        { path: '/deals', label: 'Deal Management', icon: 'assignment' },
        { path: '/lenders', label: 'Lender Database', icon: 'account_balance' },
        { path: '/lender-documents', label: 'Lender Documents', icon: 'description' },
      ]
    },
    {
      title: "Analysis",
      items: [
        { path: '/reports', label: 'Reports & Analytics', icon: 'bar_chart' },
        { path: '/ai-assistant', label: 'Terrance', icon: 'smart_toy', badge: 'New' },
      ]
    }
  ];

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      {/* Sidebar Header */}
      <div className="sidebar-header">
        <h3 className="sidebar-title">Finance Manager</h3>
      </div>
      
      {/* Navigation Sections */}
      <nav className="sidebar-nav">
        {navigationSections.map((section, index) => (
          <div key={index} className="nav-section">
            <div className="section-title">{section.title}</div>
            <ul>
              {section.items.map((item) => (
                <li key={item.path}>
                  <NavLink 
                    to={item.path} 
                    className={({ isActive }) => isActive ? 'active' : ''}
                  >
                    <span className="material-icons">{item.icon}</span>
                    <span className="nav-text">{item.label}</span>
                    {item.badge && <span className="badge">{item.badge}</span>}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      
      {/* Sidebar Footer */}
      <div className="sidebar-footer">
        <button 
          className={`sidebar-collapse ${collapsed ? 'collapsed' : ''}`}
          onClick={() => setCollapsed(!collapsed)}
        >
          <span className="material-icons">
            {collapsed ? 'chevron_right' : 'chevron_left'}
          </span>
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;