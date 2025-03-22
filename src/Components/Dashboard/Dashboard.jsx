import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy, limit, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../AuthContext';
import { Link } from 'react-router-dom';
import './Dashboard.scss';

function Dashboard() {
  const { currentUser } = useAuth();
  const [stats, setStats] = useState({
    totalDeals: 0,
    avgProfit: 0,
    productsPerDeal: 0,
    goalProgress: 0
  });
  const [recentDeals, setRecentDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [debugInfo, setDebugInfo] = useState(null); // For debugging purposes
  
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // Function to get date range for selected month
  const getMonthDateRange = (year, month) => {
    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0, 23, 59, 59);
    return {
      start: Timestamp.fromDate(startDate),
      end: Timestamp.fromDate(endDate)
    };
  };

  // Function to calculate goal progress - adjust based on your business logic
  const calculateGoalProgress = (totalProfit, monthlyGoal = 10000) => {
    const progress = (totalProfit / monthlyGoal) * 100;
    return Math.min(Math.round(progress), 100); // Cap at 100%
  };

  // Format vehicle information as a string
  const formatVehicle = (vehicle) => {
    if (!vehicle) return '';
    if (typeof vehicle === 'string') return vehicle;
    
    // If vehicle is an object with year, model
    return `${vehicle.year || ''} ${vehicle.model || ''}`.trim();
  };

  // Format date
  const formatDate = (timestamp) => {
    if (!timestamp) return '';
    try {
      // Handle different timestamp formats
      if (timestamp.toDate) {
        // Firestore Timestamp
        return timestamp.toDate().toLocaleDateString();
      } else if (timestamp.seconds) {
        // Firestore Timestamp converted to object
        return new Date(timestamp.seconds * 1000).toLocaleDateString();
      } else if (timestamp instanceof Date) {
        // JavaScript Date object
        return timestamp.toLocaleDateString();
      } else if (typeof timestamp === 'string') {
        // ISO string or other string format
        return new Date(timestamp).toLocaleDateString();
      } else if (typeof timestamp === 'number') {
        // Unix timestamp in milliseconds
        return new Date(timestamp).toLocaleDateString();
      }
    } catch (e) {
      console.error("Error formatting date:", e, timestamp);
    }
    return 'Invalid date';
  };

  const handleRefresh = () => {
    setLoading(true);
    fetchDashboardData();
  };

  const fetchDashboardData = async () => {
    if (!currentUser) {
      setLoading(false);
      return;
    }

    try {
      setError(null);
      
      // First, let's just get ALL deals to see what we have
      const dealsRef = collection(db, 'deals');
      let allDealsQuery = query(dealsRef);
      
      try {
        const allDealsSnapshot = await getDocs(allDealsQuery);
        
        // For debugging: inspect what deals exist in Firestore
        const allDeals = [];
        allDealsSnapshot.forEach(doc => {
          allDeals.push({ id: doc.id, ...doc.data() });
        });
        
        // setDebugInfo({
        //   totalDealsInFirestore: allDeals.length,
        //   sampleDeal: allDeals.length > 0 ? allDeals[0] : null
        // });
        
        console.log("All deals in Firestore:", allDeals);
        
        // Now fetch deals for the current user without date filtering first
        const userDealsQuery = query(
          dealsRef,
          where('userId', '==', currentUser.uid)
        );
        
        const userDealsSnapshot = await getDocs(userDealsQuery);
        const userDeals = [];
        
        userDealsSnapshot.forEach(doc => {
          userDeals.push({ id: doc.id, ...doc.data() });
        });
        
        console.log("User deals:", userDeals);
        
        // Process all user deals regardless of date for now
        let totalProfit = 0;
        let totalProducts = 0;
        
        userDeals.forEach(deal => {
          // Calculate profit total
          totalProfit += Number(deal.profit) || 0;
          
          // Count products
          if (Array.isArray(deal.products)) {
            totalProducts += deal.products.length;
          } else if (typeof deal.products === 'string') {
            // If products is a comma-separated string
            totalProducts += deal.products.split(',').length;
          }
        });
        
        // Sort deals by date or createdAt (whichever is available)
        userDeals.sort((a, b) => {
          const getTimestamp = (deal) => {
            if (deal.date) return deal.date;
            if (deal.createdAt) return deal.createdAt;
            return new Date(0);
          };
          
          const dateA = getTimestamp(a);
          const dateB = getTimestamp(b);
          
          // Convert to milliseconds for comparison
          const timeA = dateA.seconds ? dateA.seconds * 1000 : dateA instanceof Date ? dateA.getTime() : 0;
          const timeB = dateB.seconds ? dateB.seconds * 1000 : dateB instanceof Date ? dateB.getTime() : 0;
          
          return timeB - timeA; // Descending order
        });
        
        // Filter deals by selected month/year (if possible)
        const dateRange = getMonthDateRange(selectedYear, selectedMonth);
        const monthlyDeals = userDeals.filter(deal => {
          // Skip date filtering if deal has no date field
          if (!deal.date) return true;
          
          try {
            let dealDate;
            if (deal.date.toDate) {
              dealDate = deal.date.toDate();
            } else if (deal.date.seconds) {
              dealDate = new Date(deal.date.seconds * 1000);
            } else if (deal.date instanceof Date) {
              dealDate = deal.date;
            } else if (typeof deal.date === 'string') {
              dealDate = new Date(deal.date);
            } else {
              // If we can't interpret the date, include the deal
              return true;
            }
            
            const dealTime = dealDate.getTime();
            const startTime = dateRange.start.toDate().getTime();
            const endTime = dateRange.end.toDate().getTime();
            
            return dealTime >= startTime && dealTime <= endTime;
          } catch (e) {
            console.error("Error filtering deal by date:", e, deal);
            // Include deals with problematic dates
            return true;
          }
        });
        
        // Calculate stats based on monthly deals
        const avgProfit = monthlyDeals.length > 0 ? totalProfit / monthlyDeals.length : 0;
        const avgProductsPerDeal = monthlyDeals.length > 0 ? totalProducts / monthlyDeals.length : 0;
        const goalProgress = calculateGoalProgress(totalProfit);
        
        // Set statistics
        setStats({
          totalDeals: monthlyDeals.length,
          avgProfit: Math.round(avgProfit),
          productsPerDeal: parseFloat(avgProductsPerDeal.toFixed(1)),
          goalProgress: goalProgress
        });
        
        // Use recent deals directly from the sorted list
        setRecentDeals(userDeals.slice(0, 5));
        
      } catch (error) {
        console.error('Error fetching deals:', error);
        setError('Failed to load dashboard data: ' + error.message);
        
        // Set default values
        setStats({
          totalDeals: 0,
          avgProfit: 0,
          productsPerDeal: 0,
          goalProgress: 0
        });
        setRecentDeals([]);
      }
    } catch (error) {
      console.error('Error in dashboard data fetching:', error);
      setError('An error occurred while loading dashboard data: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [currentUser, selectedMonth, selectedYear]);

  const formatProductsList = (products) => {
    if (!products) return 'None';
    
    if (Array.isArray(products)) {
      if (products.length === 0) return 'None';
      
      // If products are objects with type property
      if (typeof products[0] === 'object' && products[0].type) {
        return products.map(p => 
          p.type.charAt(0).toUpperCase() + p.type.slice(1).replace(/([A-Z])/g, ' $1')
        ).join(', ');
      }
      
      // If products are strings
      return products.join(', ');
    }
    
    // If products is a string
    return products;
  };

  if (loading) {
    return <div className="dashboard-loading">Loading dashboard data...</div>;
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1>Dashboard</h1>
        <div className="dashboard-actions">
          <div className="month-selector">
            <select 
              id="year-select"
              value={selectedYear} 
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="year-select"
            >
              {[...Array(5)].map((_, i) => {
                const year = new Date().getFullYear() - 2 + i;
                return <option key={year} value={year}>{year}</option>;
              })}
            </select>
            <select 
              id="month-select"
              value={selectedMonth} 
              onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
              className="month-select"
            >
              {months.map((month, index) => (
                <option key={index} value={index}>{month}</option>
              ))}
            </select>
          </div>
          <button className="refresh-btn" onClick={handleRefresh}>
            <span className="material-icons">refresh</span>
          </button>
        </div>
      </div>
      
      {/* Debug info - remove in production */}
      {debugInfo && (
        <div className="debug-info" style={{background: '#f5f5f5', padding: '10px', marginBottom: '20px', borderRadius: '4px', fontSize: '0.8rem'}}>
          <p><strong>Debug Info:</strong> Total deals in Firestore: {debugInfo.totalDealsInFirestore}</p>
          {debugInfo.sampleDeal && (
            <div>
              <p>Sample deal structure:</p>
              <pre style={{maxHeight: '150px', overflow: 'auto'}}>
                {JSON.stringify(debugInfo.sampleDeal, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
      
      {error && <div className="dashboard-error">{error}</div>}
      
      <div className="stats-grid">
        <div className="stat-card">
          <span className="material-icons stat-icon">receipt_long</span>
          <div className="stat-label">Total Deals</div>
          <div className="stat-value">{stats.totalDeals}</div>
          <div className="stat-period">
            {months[selectedMonth]} {selectedYear}
          </div>
        </div>
        
        <div className="stat-card">
          <span className="material-icons stat-icon">payments</span>
          <div className="stat-label">Avg. Profit</div>
          <div className="stat-value">${stats.avgProfit}</div>
          <div className="stat-period">
            per deal
          </div>
        </div>
        
        <div className="stat-card">
          <span className="material-icons stat-icon">inventory_2</span>
          <div className="stat-label">Products/Deal</div>
          <div className="stat-value">{stats.productsPerDeal}</div>
          <div className="stat-period">
            average
          </div>
        </div>
        
        <div className="stat-card">
          <span className="material-icons stat-icon">flag</span>
          <div className="stat-label">Goal Progress</div>
          <div className="stat-value">{stats.goalProgress}%</div>
          <div className="progress-bar">
            <div 
              className="progress-fill"
              style={{ width: `${stats.goalProgress}%` }}
            ></div>
          </div>
        </div>
      </div>
      
      <div className="dashboard-charts">
        <div className="chart-card">
          <h2>
            <span className="material-icons chart-icon">show_chart</span>
            Monthly Profit Trend
          </h2>
          <div className="chart-container">
            <div className="chart-placeholder">
              Chart will be implemented with recharts
            </div>
          </div>
          <div className="chart-legend">
            <div className="legend-item">
              <div className="legend-color" style={{ backgroundColor: '#e51b23' }}></div>
              <span>Actual</span>
            </div>
            <div className="legend-item">
              <div className="legend-color" style={{ backgroundColor: '#aaaaaa' }}></div>
              <span>Projected</span>
            </div>
          </div>
        </div>
        
        <div className="chart-card">
          <h2>
            <span className="material-icons chart-icon">pie_chart</span>
            Product Distribution
          </h2>
          <div className="chart-container">
            <div className="chart-placeholder">
              Chart will be implemented with recharts
            </div>
          </div>
        </div>
      </div>
      
      <div className="recent-deals">
        <div className="recent-deals-header">
          <h2>Recent Deals</h2>
          <Link to="/deals" className="view-all">
            View all deals
            <span className="material-icons arrow-icon">arrow_forward</span>
          </Link>
        </div>
        
        {recentDeals.length > 0 ? (
          <table className="deals-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Vehicle</th>
                <th>Date</th>
                <th>Products</th>
                <th>Profit</th>
              </tr>
            </thead>
            <tbody>
              {recentDeals.map(deal => (
                <tr key={deal.id}>
                  <td>{deal.customer}</td>
                  <td>{formatVehicle(deal.vehicle)}</td>
                  <td>{formatDate(deal.date)}</td>
                  <td>{formatProductsList(deal.products)}</td>
                  <td className={`deal-profit ${deal.profit > 1200 ? 'high' : deal.profit > 800 ? 'medium' : 'low'}`}>
                    ${deal.profit || 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="no-deals">
            <span className="material-icons">info</span>
            <p>No deals found for this period</p>
            <Link to="/deals/new" className="create-deal-btn">Create New Deal</Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;