import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import SalesManagerNav from '../Components/SalesManager/SalesManagerNav';
import './SalesManagerLayout.scss';
import Header from '../Components/Header/Header';
import Footer from '../Components/Footer/Footer';

function SalesManagerLayout() {
  const [collapsed, setCollapsed] = useState(false);

  // Function to toggle collapsed state
  const toggleSidebar = () => {
    setCollapsed(prev => !prev);
  };

  return (
    <div className={`sales-manager-layout ${collapsed ? 'nav-collapsed' : ''}`}>
      <Header />
      <div className="main-content-wrapper">
        <SalesManagerNav 
          collapsed={collapsed} 
          setCollapsed={toggleSidebar} 
        />
        <div className="sales-manager-container">
          <div className="sales-manager-content">
            <Outlet />
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}

export default SalesManagerLayout;
