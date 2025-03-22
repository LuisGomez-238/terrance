import { Outlet } from 'react-router-dom';
import Header from './Components/Header.jsx/Header';
import Sidebar from './Components/Sidebar/Sidebar';
import './AppLayout.scss';

function AppLayout() {
  return (
    <div className="app-container">
      <Header />
      <div className="main-content">
        <Sidebar />
        <main className="content-area">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default AppLayout;