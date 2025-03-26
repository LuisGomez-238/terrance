import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy, limit, Timestamp, doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../AuthContext';
import { Link } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, ReferenceLine } from 'recharts';
import './Dashboard.scss';
import { useProfile } from '../../contexts/ProfileContext';
import { useLoading } from '../../contexts/LoadingContext';

function Dashboard() {
  const { currentUser } = useAuth();
  
  // Get profile data and handle potential undefined values
  const profileContext = useProfile();
  const userProfile = profileContext?.userProfile || { monthlyTarget: 10000 };
  const profileLoading = profileContext?.loading || false;
  
  // Get loading functions from context
  const { showLoading, hideLoading } = useLoading();
  
  // Initialize state for tracking whether the first data load has completed
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  
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
  const [monthlyProfitData, setMonthlyProfitData] = useState([]);
  const [productDistribution, setProductDistribution] = useState([]);
  const [debugInfo, setDebugInfo] = useState(null);
  const [monthlyGoal, setMonthlyGoal] = useState(userProfile.monthlyTarget || 10000);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  
  // Colors for pie chart
  const COLORS = ['#e51b23', '#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#a855f7', '#3b82f6', '#10b981', '#f97316'];
  
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
  const calculateGoalProgress = (totalProfit, userGoal = monthlyGoal) => {
    console.log(`Calculating goal progress: profit=${totalProfit}, goal=${userGoal}`);
    const progress = (totalProfit / userGoal) * 100;
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

  // Generate profit trend data for the past 6 months
  const generateProfitTrendData = (allDeals, goalValue = monthlyGoal) => {
    const trendData = [];
    const currentDate = new Date();
    
    console.log("Generating profit trend with goal:", goalValue);
    
    // If there are no deals, still create the chart data with zero profits
    const hasDeals = allDeals.length > 0;
    
    // Create data for the past 6 months
    for (let i = 5; i >= 0; i--) {
      const month = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
      const monthName = month.toLocaleDateString('en-US', { month: 'short' });
      const year = month.getFullYear();
      const monthStart = new Date(year, month.getMonth(), 1);
      const monthEnd = new Date(year, month.getMonth() + 1, 0, 23, 59, 59);
      
      // If no deals, set totalProfit to 0
      let totalProfit = 0;
      
      if (hasDeals) {
        // Filter deals for this month
        const monthDeals = allDeals.filter(deal => {
          let dealDate;
          try {
            if (deal.date) {
              if (deal.date.toDate) {
                dealDate = deal.date.toDate();
              } else if (deal.date.seconds) {
                dealDate = new Date(deal.date.seconds * 1000);
              } else if (deal.date instanceof Date) {
                dealDate = deal.date;
              } else if (typeof deal.date === 'string') {
                dealDate = new Date(deal.date);
              } else {
                return false;
              }
              
              return dealDate >= monthStart && dealDate <= monthEnd;
            } else if (deal.createdAt) {
              // Fallback to createdAt if date is not available
              if (deal.createdAt.toDate) {
                dealDate = deal.createdAt.toDate();
              } else if (deal.createdAt.seconds) {
                dealDate = new Date(deal.createdAt.seconds * 1000);
              } else if (deal.createdAt instanceof Date) {
                dealDate = deal.createdAt;
              } else if (typeof deal.createdAt === 'string') {
                dealDate = new Date(deal.createdAt);
              } else {
                return false;
              }
              
              return dealDate >= monthStart && dealDate <= monthEnd;
            }
            return false;
          } catch (e) {
            console.error("Error filtering deal by date for chart:", e, deal);
            return false;
          }
        });
        
        // Calculate total profit for the month - check multiple possible profit fields
        totalProfit = monthDeals.reduce((sum, deal) => {
          const profit = 
            parseFloat(deal.profit) || 
            parseFloat(deal.backEndProfit) || 
            parseFloat(deal.totalProfit) || 
            parseFloat(deal.backend) || 
            0;
          
          return sum + profit;
        }, 0);
      }
      
      // Add to trend data with the provided goal
      trendData.push({
        name: `${monthName} ${year}`,
        profit: totalProfit,
        goal: goalValue, // Use the provided goal value
      });
    }
    
    return trendData;
  };

  // Generate product distribution data
  const generateProductDistribution = (allDeals) => {
    const productCounts = {};
    let productTotal = 0;
    
    console.log("Generating product distribution from deals:", allDeals.length);
    
    // Count occurrences of each product
    allDeals.forEach(deal => {
      if (Array.isArray(deal.products)) {
        deal.products.forEach(product => {
          let productName;
          
          if (typeof product === 'object') {
            // Check if product has name property
            if (product.name) {
              productName = product.name;
            } 
            // Check if product has type property
            else if (product.type) {
              productName = product.type.charAt(0).toUpperCase() + 
                           product.type.slice(1).replace(/([A-Z])/g, ' $1');
            } 
            // If neither, use a default
            else {
              productName = 'Unknown Product';
            }
          } else if (typeof product === 'string') {
            productName = product;
          } else {
            productName = 'Unknown Product';
          }
          
          productCounts[productName] = (productCounts[productName] || 0) + 1;
          productTotal++;
        });
      } else if (typeof deal.products === 'string' && deal.products.trim() !== '') {
        // Handle comma-separated string of products
        const productNames = deal.products.split(',').map(p => p.trim());
        productNames.forEach(name => {
          if (name) {
            productCounts[name] = (productCounts[name] || 0) + 1;
            productTotal++;
          }
        });
      }
    });
    
    console.log("Product counts:", productCounts, "Total products:", productTotal);
    
    // Convert to array format for PieChart
    const distributionData = Object.keys(productCounts).map(name => ({
      name,
      value: productCounts[name]
    }));
    
    // Sort by count (descending) and take top 8
    return distributionData
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  };

  // Add this function to fetch the user's monthly target
  const fetchUserMonthlyTarget = async () => {
    if (!currentUser) return;
    
    try {
      const userDocRef = doc(db, 'users', currentUser.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        if (userData.monthlyTarget) {
          console.log("Using user's monthly target:", userData.monthlyTarget);
          const targetValue = Number(userData.monthlyTarget);
          setMonthlyGoal(targetValue || 10000);
          return targetValue;
        }
      } else {
        console.log("No user document found, using default target");
      }
    } catch (error) {
      console.error("Error fetching user's monthly target:", error);
    }
    
    return monthlyGoal; // Return current value as fallback
  };

  const fetchDashboardData = async () => {
    if (!currentUser) {
      setLoading(false);
      return;
    }

    showLoading();
    
    try {
      setError(null);
      
      // First fetch the monthly target to ensure we have the latest
      await fetchUserMonthlyTarget();
      
      // Get user deals
      const dealsRef = collection(db, 'deals');
      const userDealsQuery = query(
        dealsRef,
        where('userId', '==', currentUser.uid)
      );
      
      console.log('Fetching dashboard data for user ID:', currentUser.uid);
      
      const userDealsSnapshot = await getDocs(userDealsQuery);
      const userDeals = [];
      
      userDealsSnapshot.forEach(doc => {
        const dealData = doc.data();
        
        // Only include deals that actually belong to this user
        if (dealData.userId === currentUser.uid) {
          // Normalize profit value from various possible fields
          const profit = 
            parseFloat(dealData.profit) || 
            parseFloat(dealData.backEndProfit) || 
            parseFloat(dealData.totalProfit) || 
            parseFloat(dealData.backend) || 
            0;
          
          userDeals.push({ 
            id: doc.id, 
            ...dealData,
            // Ensure profit is always a number and properly formatted 
            profit: profit
          });
        } else {
          console.warn('Found deal with mismatched userId:', dealData.userId, 'Current user:', currentUser.uid);
        }
      });
      
      console.log("User deals loaded:", userDeals.length);
      
      // Remove the sample deal code - we don't want to show fake data
      // Instead, just show empty state if there are no deals
      if (userDeals.length === 0) {
        console.log("No deals found for this user");
        
        // Set empty data states instead of fake data
        setStats({
          totalDeals: 0,
          avgProfit: 0,
          productsPerDeal: 0,
          goalProgress: 0
        });
        
        setRecentDeals([]);
        setMonthlyProfitData([]);
        setProductDistribution([]);
        
        // Set initialLoadComplete to true even if no deals
        if (!initialLoadComplete) {
          setInitialLoadComplete(true);
        }
        
        // Hide loading and finish early
        hideLoading();
        setLoading(false);
        setLastRefresh(new Date());
        return;
      }
      
      // Process all user deals
      let totalProfit = 0;
      let totalProducts = 0;
      
      userDeals.forEach(deal => {
        // Calculate profit total (profit is already normalized above)
        totalProfit += deal.profit;
        
        // Count products
        if (Array.isArray(deal.products)) {
          totalProducts += deal.products.length;
        } else if (typeof deal.products === 'string') {
          totalProducts += deal.products.split(',').filter(p => p.trim()).length;
        }
      });
      
      // Sort deals by date
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
      
      // Filter deals by selected month/year
      const dateRange = getMonthDateRange(selectedYear, selectedMonth);
      const monthlyDeals = userDeals.filter(deal => {
        if (!deal.date && !deal.createdAt) return false;
        
        try {
          let dealDate;
          // First try to use date field
          if (deal.date) {
            if (deal.date.toDate) {
              dealDate = deal.date.toDate();
            } else if (deal.date.seconds) {
              dealDate = new Date(deal.date.seconds * 1000);
            } else if (deal.date instanceof Date) {
              dealDate = deal.date;
            } else if (typeof deal.date === 'string') {
              dealDate = new Date(deal.date);
            }
          } 
          // Fallback to createdAt
          else if (deal.createdAt) {
            if (deal.createdAt.toDate) {
              dealDate = deal.createdAt.toDate();
            } else if (deal.createdAt.seconds) {
              dealDate = new Date(deal.createdAt.seconds * 1000);
            } else if (deal.createdAt instanceof Date) {
              dealDate = deal.createdAt;
            } else if (typeof deal.createdAt === 'string') {
              dealDate = new Date(deal.createdAt);
            }
          }
          
          if (!dealDate) return false;
          
          const dealTime = dealDate.getTime();
          const startTime = dateRange.start.toDate().getTime();
          const endTime = dateRange.end.toDate().getTime();
          
          return dealTime >= startTime && dealTime <= endTime;
        } catch (e) {
          console.error("Error filtering deal by date:", e, deal);
          return false;
        }
      });
      
      console.log(`Monthly deals for ${months[selectedMonth]} ${selectedYear}:`, monthlyDeals.length);
      
      // Calculate stats based on monthly deals with the latest goal
      const monthlyProfit = monthlyDeals.reduce((sum, deal) => sum + (Number(deal.profit) || 0), 0);
      const avgProfit = monthlyDeals.length > 0 ? monthlyProfit / monthlyDeals.length : 0;
      
      let monthlyProducts = 0;
      monthlyDeals.forEach(deal => {
        if (Array.isArray(deal.products)) {
          monthlyProducts += deal.products.length;
        } else if (typeof deal.products === 'string') {
          monthlyProducts += deal.products.split(',').filter(p => p.trim()).length;
        }
      });
      
      const avgProductsPerDeal = monthlyDeals.length > 0 ? monthlyProducts / monthlyDeals.length : 0;
      const goalProgress = calculateGoalProgress(monthlyProfit, monthlyGoal);
      console.log(`Monthly profit: ${monthlyProfit}, Goal: ${monthlyGoal}, Progress: ${goalProgress}%`);
      
      // Set statistics
      setStats({
        totalDeals: monthlyDeals.length,
        avgProfit: Math.round(avgProfit),
        productsPerDeal: parseFloat(avgProductsPerDeal.toFixed(1)),
        goalProgress: goalProgress
      });
      
      // Generate chart data with the latest goal
      const trendData = generateProfitTrendData(userDeals, monthlyGoal);
      const distributionData = generateProductDistribution(userDeals);
      
      console.log("Chart data generated:", { 
        trendData: trendData.length, 
        distributionData: distributionData.length 
      });
      
      setMonthlyProfitData(trendData);
      setProductDistribution(distributionData);
      
      // Set recent deals
      setRecentDeals(userDeals.slice(0, 5));
      
      // Mark initial load as complete
      if (!initialLoadComplete) {
        setInitialLoadComplete(true);
      }
      
    } catch (error) {
      console.error('Error in dashboard data fetching:', error);
      setError('An error occurred while loading dashboard data: ' + error.message);
      
      // Set default values
      setStats({
        totalDeals: 0,
        avgProfit: 0,
        productsPerDeal: 0,
        goalProgress: 0
      });
      setRecentDeals([]);
      setMonthlyProfitData([]);
      setProductDistribution([]);
    } finally {
      hideLoading();
      setLoading(false);
      setLastRefresh(new Date());
    }
  };

  useEffect(() => {
    if (currentUser && !profileLoading) {
      console.log("Initial data load with monthly goal:", userProfile.monthlyTarget);
      fetchDashboardData();
    }
  }, [currentUser, profileLoading]);

  // Update the profile change effect to force a refresh when the target changes
  useEffect(() => {
    // Update the monthly goal when the profile changes
    if (userProfile && userProfile.monthlyTarget && initialLoadComplete) {
      console.log("Monthly target updated from profile:", userProfile.monthlyTarget);
      setMonthlyGoal(userProfile.monthlyTarget);
      
      // Trigger a full refresh to ensure all calculations use the new goal
      fetchDashboardData();
    }
  }, [userProfile.monthlyTarget, initialLoadComplete]);

  const formatProductsList = (products) => {
    if (!products) return 'None';
    
    if (Array.isArray(products)) {
      if (products.length === 0) return 'None';
      
      // If products are objects with name property
      if (typeof products[0] === 'object' && products[0].name) {
        return products.map(p => p.name).join(', ');
      }
      
      // If products are objects with type property
      if (typeof products[0] === 'object' && products[0].type) {
        return products.map(p => p.type).join(', ');
      }
      
      // If products are strings
      return products.join(', ');
    }
    
    // If products is a string
    return products;
  };
  
  // Custom tooltip for the line chart
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="custom-tooltip">
          <p className="tooltip-label">{label}</p>
          <p className="tooltip-profit">Profit: ${payload[0].value.toFixed(2)}</p>
          <p className="tooltip-goal">Goal: ${payload[1].value.toFixed(2)}</p>
          <p className="tooltip-percent">
            {((payload[0].value / payload[1].value) * 100).toFixed(1)}% of goal
          </p>
        </div>
      );
    }
    return null;
  };

  // Format currency for display
  const formatCurrency = (amount) => {
    if (amount === undefined || amount === null) return '$0';
    return '$' + parseFloat(amount).toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,').replace(/\.00$/, '');
  };

  // Replace the simple loading check with a condition that doesn't show anything
  // (since the loading screen will be shown via context)
  if (loading || profileLoading) {
    return null; // The global loading screen will be visible
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
          <div className="refresh-container">
            <button 
              className="refresh-btn" 
              onClick={handleRefresh}
              title="Last refreshed: ${lastRefresh.toLocaleTimeString()}"
            >
              <span className="material-icons">refresh</span>
              <span className="refresh-text">Refresh Data</span>
            </button>
            <div className="last-refresh">
              Last updated: {lastRefresh.toLocaleTimeString()}
            </div>
          </div>
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
          <div className="stat-detail">
            ${monthlyGoal.toLocaleString()} monthly target
          </div>
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
            {stats.totalDeals > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart
                  data={monthlyProfitData}
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="profit"
                    name="Actual Profit"
                    stroke="#e51b23"
                    activeDot={{ r: 8 }}
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="goal"
                    name="Monthly Target"
                    stroke="#aaaaaa"
                    strokeDasharray="5 5"
                    strokeWidth={2}
                  />
                  
                  <ReferenceLine 
                    y={monthlyGoal} 
                    label="Monthly Target" 
                    stroke="#aaaaaa" 
                    strokeDasharray="3 3" 
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="no-data-message">
                <span className="material-icons">info</span>
                <p>No deals found for this period. Create your first deal to see profit trends.</p>
                <Link to="/deals/new" className="create-deal-btn">Create New Deal</Link>
              </div>
            )}
          </div>
          <div className="chart-legend">
            <div className="legend-item">
              <div className="legend-color" style={{ backgroundColor: '#e51b23' }}></div>
              <span>Actual</span>
            </div>
            <div className="legend-item">
              <div className="legend-color" style={{ backgroundColor: '#aaaaaa' }}></div>
              <span>Goal</span>
            </div>
          </div>
        </div>
        
        <div className="chart-card">
          <h2>
            <span className="material-icons chart-icon">pie_chart</span>
            Product Distribution
          </h2>
          <div className="chart-container">
            {stats.totalDeals > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={productDistribution}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                    nameKey="name"
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  >
                    {productDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value, name, props) => [`${value} units`, props.payload.name]} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="no-data-message">
                <span className="material-icons">info</span>
                <p>No deals found. Add some deals with products to see distribution.</p>
                <Link to="/deals/new" className="create-deal-btn">Create New Deal</Link>
              </div>
            )}
          </div>
          <div className="chart-legend">
            {productDistribution.slice(0, 5).map((product, index) => (
              <div className="legend-item" key={index}>
                <div className="legend-color" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                <span>{product.name}</span>
              </div>
            ))}
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
                    {formatCurrency(deal.profit)}
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