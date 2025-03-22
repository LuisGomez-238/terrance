import React from 'react';
import { Outlet } from 'react-router-dom';
import Header from './Components/Header.jsx/Header';
import Sidebar from './Components/Sidebar/Sidebar';
import Footer from './Components/Footer/Footer';
import './AppLayout.scss';

function AppLayout() {
  return (
    <div className="app-layout">
      <Header />
      <div className="app-container">
        <Sidebar />
        <div className="app-content">
          <Outlet />
        </div>
      </div>
      <Footer />
    </div>
  );
}

export default AppLayout;