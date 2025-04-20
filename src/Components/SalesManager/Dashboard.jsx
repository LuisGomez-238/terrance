import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../AuthContext';
import { useLoading } from '../../contexts/LoadingContext';
import './Dashboard.scss';

function SalesManagerDashboard() {
  const { currentUser } = useAuth();
  const { showLoading, hideLoading } = useLoading();
  const [storeData, setStoreData] = useState({
    totalDeals: 0,
    totalProfit: 0,
    averageProfit: 0
  });
  const [financeManagers, setFinanceManagers] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState('mtd'); // 'mtd', 'last90', 'today', 'custom'
  
  // Function to get date range based on selected period
  const getDateRange = (period) => {
    const now = new Date();
    let startDate;
    
    switch(period) {
      case 'mtd':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'last90':
        startDate = new Date();
        startDate.setDate(now.getDate() - 90);
        break;
      case 'today':
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    
    return {
      start: startDate,
      end: now
    };
  };
  
  // Fetch all finance managers
  const fetchFinanceManagers = async () => {
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('role', '==', 'finance_manager'));
      const querySnapshot = await getDocs(q);
      
      const managers = [];
      querySnapshot.forEach(doc => {
        managers.push({
          id: doc.id,
          name: doc.data().name || doc.data().email,
          ...doc.data()
        });
      });
      
      setFinanceManagers(managers);
    } catch (error) {
      console.error("Error fetching finance managers:", error);
    }
  };
  
  // Fetch all deals within the date range
  const fetchDealsData = async () => {
    showLoading("Loading dashboard data...");
    
    try {
      const dateRange = getDateRange(selectedPeriod);
      
      const dealsRef = collection(db, 'deals');
      const q = query(
        dealsRef,
        where('dateSold', '>=', Timestamp.fromDate(dateRange.start)),
        where('dateSold', '<=', Timestamp.fromDate(dateRange.end))
      );
      
      const querySnapshot = await getDocs(q);
      
      let totalDeals = 0;
      let totalProfit = 0;
      
      querySnapshot.forEach(doc => {
        const deal = doc.data();
        totalDeals++;
        
        // Calculate profit using your existing logic
        const profit = deal.totalProfit || deal.backEndProfit || deal.profit || 0;
        totalProfit += parseFloat(profit);
      });
      
      setStoreData({
        totalDeals,
        totalProfit,
        averageProfit: totalDeals > 0 ? totalProfit / totalDeals : 0
      });
    } catch (error) {
      console.error("Error fetching deals data:", error);
    } finally {
      hideLoading();
    }
  };
  
  useEffect(() => {
    fetchFinanceManagers();
  }, []);
  
  useEffect(() => {
    fetchDealsData();
  }, [selectedPeriod]);
  
  return (
    <div className="sales-dashboard-container">
      <div className="dashboard-header">
        <h1>Sales Manager Dashboard</h1>
        <div className="period-selector">
          <button 
            className={selectedPeriod === 'mtd' ? 'active' : ''} 
            onClick={() => setSelectedPeriod('mtd')}
          >
            Month to Date
          </button>
          <button 
            className={selectedPeriod === 'last90' ? 'active' : ''} 
            onClick={() => setSelectedPeriod('last90')}
          >
            Last 90 Days
          </button>
          <button 
            className={selectedPeriod === 'today' ? 'active' : ''} 
            onClick={() => setSelectedPeriod('today')}
          >
            Today
          </button>
        </div>
      </div>
      
      <div className="dashboard-content">
        <div className="metrics-summary">
          <h2>Summary - {selectedPeriod === 'mtd' ? 'Month to Date' : selectedPeriod === 'last90' ? 'Last 90 Days' : 'Today'}</h2>
          <div className="metrics-cards">
            <div className="metric-card">
              <h3>Total Deals</h3>
              <div className="metric-value">{storeData.totalDeals}</div>
            </div>
            <div className="metric-card">
              <h3>Total Profit</h3>
              <div className="metric-value">${storeData.totalProfit.toFixed(2)}</div>
            </div>
            <div className="metric-card">
              <h3>Average Profit</h3>
              <div className="metric-value">${storeData.averageProfit.toFixed(2)}</div>
            </div>
          </div>
        </div>
        
        <div className="data-section">
          <h2>Finance Manager Performance</h2>
          <div className="manager-list">
            {financeManagers.map(manager => (
              <div key={manager.id} className="manager-card">
                <h3>{manager.name}</h3>
                <p>Coming soon: Performance metrics for individual finance managers</p>
              </div>
            ))}
            {financeManagers.length === 0 && (
              <p>No finance managers found.</p>
            )}
          </div>
        </div>
        
        <div className="data-section">
          <h2>Funding Status</h2>
          <p>Funding tracking and alerts will be added in the next phase</p>
        </div>
      </div>
    </div>
  );
}

export default SalesManagerDashboard;
