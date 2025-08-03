import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, Timestamp, doc, getDoc } from 'firebase/firestore';
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
    averageProfit: 0,
    pendingFunding: 0,
    completedFunding: 0
  });
  const [financeManagers, setFinanceManagers] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState('mtd'); // 'mtd', 'last90', 'today', 'custom'
  const [managerStats, setManagerStats] = useState({});
  const [loading, setLoading] = useState(false);
  
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
          email: doc.data().email,
          ...doc.data()
        });
      });
      
      const managersWithDefaults = managers.map(manager => ({
        name: manager.name || 'Unknown',
        totalDeals: manager.totalDeals || 0,
        totalProfit: manager.totalProfit || 0,
        averageProfit: manager.averageProfit || 0,
        pendingFunding: manager.pendingFunding || 0,
        completedFunding: manager.completedFunding || 0,
        productsPenetration: manager.productsPenetration || 0,
        totalProducts: manager.totalProducts || 0,
        houseDeals: manager.houseDeals || 0,
        ...manager
      }));
      
      setFinanceManagers(managersWithDefaults);
      return managersWithDefaults;
    } catch (error) {
      console.error("Error fetching finance managers:", error);
      return [];
    }
  };
  
  // Calculate finance manager performance metrics
  const calculateManagerStats = async (managers, dateRange) => {
    const stats = {};
    let pendingFunding = 0;
    let completedFunding = 0;
    
    try {
      // Get all deals within the date range
      const dealsRef = collection(db, 'deals');
      const q = query(
        dealsRef,
        where('dateSold', '>=', Timestamp.fromDate(dateRange.start)),
        where('dateSold', '<=', Timestamp.fromDate(dateRange.end))
      );
      
      const querySnapshot = await getDocs(q);
      
      // Initialize manager stats objects
      managers.forEach(manager => {
        stats[manager.id] = {
          totalDeals: 0,
          totalProfit: 0,
          averageProfit: 0,
          pendingFunding: 0,
          completedFunding: 0,
          productsPenetration: 0,
          totalProducts: 0,
          houseDeals: 0
        };
      });
      
      // Process each deal
      querySnapshot.forEach(doc => {
        const deal = doc.data();
        const managerId = deal.userId;
        
        // Skip if the deal doesn't belong to a finance manager we're tracking
        if (!stats[managerId]) return;
        
        // Count deals
        stats[managerId].totalDeals++;
        
        // Calculate profit
        const profit = parseFloat(deal.totalProfit || deal.backEndProfit || deal.profit || 0);
        stats[managerId].totalProfit += profit;
        
        // Check funding status
        if (deal.fundedDate) {
          stats[managerId].completedFunding++;
          completedFunding++;
        } else {
          stats[managerId].pendingFunding++;
          pendingFunding++;
        }
        
        // Count products
        if (Array.isArray(deal.products) && deal.products.length > 0) {
          stats[managerId].totalProducts += deal.products.length;
        }
        
        if (deal.houseDeal) {
          stats[managerId].houseDeals++;
        }
      });
      
      // Calculate averages and percentages
      Object.keys(stats).forEach(managerId => {
        const managerStat = stats[managerId];
        if (managerStat.totalDeals > 0) {
          managerStat.averageProfit = managerStat.totalProfit / managerStat.totalDeals;
          managerStat.productsPenetration = managerStat.totalProducts / managerStat.totalDeals;
          managerStat.fundingRate = managerStat.completedFunding / managerStat.totalDeals * 100;
        }
      });
      
      setManagerStats(stats);
      
      return {
        pendingFunding,
        completedFunding
      };
    } catch (error) {
      console.error("Error calculating manager stats:", error);
      return {
        pendingFunding: 0,
        completedFunding: 0
      };
    }
  };
  
  // Fetch all deals within the date range
  const fetchDealsData = async () => {
    setLoading(true);
    showLoading("Loading dashboard data...");
    
    try {
      const dateRange = getDateRange(selectedPeriod);
      
      // Fetch or ensure we have the finance managers loaded
      let managers = financeManagers;
      if (managers.length === 0) {
        managers = await fetchFinanceManagers();
      }
      
      // Calculate manager stats
      const fundingStats = await calculateManagerStats(managers, dateRange);
      
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
        averageProfit: totalDeals > 0 ? totalProfit / totalDeals : 0,
        pendingFunding: fundingStats.pendingFunding,
        completedFunding: fundingStats.completedFunding
      });
    } catch (error) {
      console.error("Error fetching deals data:", error);
    } finally {
      hideLoading();
      setLoading(false);
    }
  };
  
  useEffect(() => {
    fetchFinanceManagers();
  }, []);
  
  useEffect(() => {
    fetchDealsData();
  }, [selectedPeriod, financeManagers.length]);
  
  // Format currency helper function
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };
  
  // Render performance metrics for a finance manager
  const renderManagerPerformance = (manager) => {
    const stats = managerStats[manager.id] || {
      totalDeals: 0,
      totalProfit: 0,
      averageProfit: 0,
      pendingFunding: 0,
      completedFunding: 0,
      productsPenetration: 0,
      fundingRate: 0,
      houseDeals: 0
    };
    
    // Example fix for different possible scenarios:
    
    // If it's dealing with averageProfit
    const formattedAvgProfit = stats.averageProfit !== undefined ? 
      stats.averageProfit.toFixed(2) : 
      '0.00';
      
    // If it's dealing with totalProfit  
    const formattedTotalProfit = stats.totalProfit !== undefined ? 
      stats.totalProfit.toFixed(2) : 
      '0.00';
      
    // If it's a percentage calculation
    const formattedPercentage = stats.fundingRate !== undefined ? 
      stats.fundingRate.toFixed(2) : 
      '0.00';
      
    // Apply similar fixes to all number formatting in this function
    
    return (
      <div key={manager.id} className="manager-card">
        <div className="manager-header">
          <h3>{manager.name}</h3>
          <span className="manager-email">{manager.email}</span>
        </div>
        
        <div className="manager-stats">
          <div className="stat-group">
            <div className="stat">
              <span className="stat-label">Deals</span>
              <span className="stat-value">{stats.totalDeals}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Total Profit</span>
              <span className="stat-value">{formatCurrency(stats.totalProfit)}</span>
            </div>
          </div>
          
          <div className="stat-group">
            <div className="stat">
              <span className="stat-label">Avg. Profit</span>
              <span className="stat-value">{formatCurrency(stats.averageProfit)}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Products/Deal</span>
              <span className="stat-value">{stats.productsPenetration.toFixed(1)}</span>
            </div>
          </div>
          
          <div className="stat-group">
            <div className="stat">
              <span className="stat-label">Funding Rate</span>
              <span className="stat-value">{formattedPercentage}%</span>
            </div>
            <div className="stat">
              <span className="stat-label">Pending</span>
              <span className="stat-value">{stats.pendingFunding}</span>
            </div>
          </div>
          
          <div className="stat-group">
            <div className="stat">
              <span className="stat-label">House Deals</span>
              <span className="stat-value">{stats.houseDeals}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };
  
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
              <div className="metric-value">{formatCurrency(storeData.totalProfit)}</div>
            </div>
            <div className="metric-card">
              <h3>Average Profit</h3>
              <div className="metric-value">{formatCurrency(storeData.averageProfit)}</div>
            </div>
            <div className="metric-card">
              <h3>Funding Rate</h3>
              <div className="metric-value">
                {storeData.totalDeals > 0 
                  ? `${((storeData.completedFunding / storeData.totalDeals) * 100).toFixed(0)}%` 
                  : '0%'}
              </div>
            </div>
          </div>
        </div>
        
        <div className="data-section">
          <h2>Finance Manager Performance</h2>
          {loading ? (
            <div className="loading-indicator">Loading manager data...</div>
          ) : (
            <div className="manager-list">
              {financeManagers.length > 0 ? (
                financeManagers.map(manager => renderManagerPerformance(manager))
              ) : (
                <p className="no-data">No finance managers found.</p>
              )}
            </div>
          )}
        </div>
        
        <div className="data-section">
          <h2>Funding Status</h2>
          <div className="funding-metrics">
            <div className="funding-metric">
              <h3>Pending Funding</h3>
              <div className="funding-value">{storeData.pendingFunding}</div>
            </div>
            <div className="funding-metric">
              <h3>Completed Funding</h3>
              <div className="funding-value">{storeData.completedFunding}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SalesManagerDashboard;
