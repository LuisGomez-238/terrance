import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy, limit, doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../AuthContext';
import { format, subMonths, startOfMonth, endOfMonth, parseISO, isWithinInterval } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import './Reports.scss';
import { useProfile } from '../../contexts/ProfileContext';

function Reports() {
  const { currentUser } = useAuth();
  
  // Get profile data and handle potential undefined values
  const profileContext = useProfile();
  const userProfile = profileContext?.userProfile || { monthlyTarget: 10000 };
  const profileLoading = profileContext?.loading || false;
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reportType, setReportType] = useState('monthly');
  const [timeRange, setTimeRange] = useState('6');
  const [monthlyData, setMonthlyData] = useState([]);
  const [productData, setProductData] = useState([]);
  const [lenderData, setLenderData] = useState([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [monthlyGoal, setMonthlyGoal] = useState(userProfile.monthlyTarget || 10000);
  
  // Colors for pie chart
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#A4DE6C', '#8884D8', '#FF6B6B'];
  
  // Function to fetch the user's monthly target
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
  
  // Update useEffect to react to profile changes
  useEffect(() => {
    if (userProfile && userProfile.monthlyTarget) {
      console.log("Monthly target updated from profile:", userProfile.monthlyTarget);
      setMonthlyGoal(userProfile.monthlyTarget);
    }
  }, [userProfile.monthlyTarget]);
  
  useEffect(() => {
    const fetchReportData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // First, ensure we have the latest monthly target
        await fetchUserMonthlyTarget();
        
        const months = parseInt(timeRange);
        const today = new Date();
        
        // Fetch all deals within the time range
        const startDate = startOfMonth(subMonths(today, months - 1));
        
        const dealsRef = collection(db, 'deals');
        let dealsQuery;
        
        try {
          // Try to query with both where and orderBy (requires an index)
          dealsQuery = query(
            dealsRef,
            where('userId', '==', currentUser.uid),
            where('createdAt', '>=', startDate),
            orderBy('createdAt', 'desc')
          );
        } catch (e) {
          // Fallback if index doesn't exist
          console.log("Using fallback query without ordering due to:", e);
          dealsQuery = query(
            dealsRef,
            where('userId', '==', currentUser.uid),
            where('createdAt', '>=', startDate)
          );
        }
        
        const dealsSnapshot = await getDocs(dealsQuery);
        const deals = [];
        
        console.log('Fetched deals:', dealsSnapshot.size);
        dealsSnapshot.forEach(doc => {
          console.log('Deal data:', doc.id, doc.data());
          const dealData = doc.data();
          
          // Skip deals without required data
          if (!dealData.createdAt || !dealData.products) {
            console.warn(`Deal ${doc.id} missing required data, skipping...`);
            return;
          }
          
          // Convert Firestore timestamp to Date
          const createdAt = dealData.createdAt.toDate ? 
            dealData.createdAt.toDate() : 
            (typeof dealData.createdAt === 'string' ? parseISO(dealData.createdAt) : new Date(dealData.createdAt));
          
          // Calculate deal profit from products
          let dealProfit = 0;
          let productCount = 0;
          
          if (Array.isArray(dealData.products)) {
            productCount = dealData.products.length;
            dealData.products.forEach(product => {
              if (product.profit && !isNaN(product.profit)) {
                dealProfit += parseFloat(product.profit);
              }
            });
          }
          
          deals.push({
            id: doc.id,
            createdAt,
            profit: dealProfit,
            products: dealData.products || [],
            productCount,
            lender: dealData.lender || 'Unknown',
            customer: dealData.customer || { name: 'Unknown' },
            vehicle: dealData.vehicle || { model: 'Unknown' }
          });
        });
        
        // Process the data for monthly report
        const monthlyProfitData = [];
        const productCounts = {};
        const lenderCounts = {};
        const lenderProfits = {};
        
        // Generate month data structure for the past months
        for (let i = months - 1; i >= 0; i--) {
          const date = subMonths(today, i);
          const monthStart = startOfMonth(date);
          const monthEnd = endOfMonth(date);
          const monthName = format(date, 'MMM yyyy');
          
          // Filter deals for this month
          const monthDeals = deals.filter(deal => 
            isWithinInterval(deal.createdAt, { start: monthStart, end: monthEnd })
          );
          
          const backEndProfit = monthDeals.reduce((sum, deal) => sum + deal.profit, 0);
          const avgProfit = monthDeals.length > 0 ? backEndProfit / monthDeals.length : 0;
          const totalProducts = monthDeals.reduce((sum, deal) => sum + deal.productCount, 0);
          const productsPerDeal = monthDeals.length > 0 ? totalProducts / monthDeals.length : 0;
          
          monthlyProfitData.push({
            month: monthName,
            deals: monthDeals.length,
            backEndProfit,
            avgProfit,
            productsPerDeal,
            goal: monthlyGoal
          });
          
          // Process product data
          monthDeals.forEach(deal => {
            if (Array.isArray(deal.products)) {
              deal.products.forEach(product => {
                if (product.name) {
                  productCounts[product.name] = (productCounts[product.name] || 0) + 1;
                }
              });
            }
            
            // Process lender data
            if (deal.lender) {
              lenderCounts[deal.lender] = (lenderCounts[deal.lender] || 0) + 1;
              lenderProfits[deal.lender] = (lenderProfits[deal.lender] || 0) + deal.profit;
            }
          });
        }
        
        // Format product data for chart
        const productChartData = Object.keys(productCounts).map(name => ({
          name,
          value: productCounts[name]
        })).sort((a, b) => b.value - a.value);
        
        // Format lender data for chart
        const lenderChartData = Object.keys(lenderCounts).map(name => ({
          name,
          deals: lenderCounts[name],
          profit: lenderProfits[name],
          avgProfit: lenderProfits[name] / lenderCounts[name]
        })).sort((a, b) => b.deals - a.deals);
        
        setMonthlyData(monthlyProfitData);
        setProductData(productChartData);
        setLenderData(lenderChartData);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching report data:', error);
        setError('Failed to load report data. Please try again.');
        setLoading(false);
      }
    };
    
    fetchReportData();
  }, [timeRange, reportType, currentUser, selectedYear]);
  
  const exportToCsv = () => {
    let csvContent = "";
    
    // Add headers row
    if (reportType === 'monthly') {
      csvContent = "Month,Deals,Back-End Profit,Average Profit,Products Per Deal,Goal\n";
      
      // Add data rows
      monthlyData.forEach(month => {
        csvContent += `${month.month},${month.deals},$${month.backEndProfit.toFixed(2)},$${month.avgProfit.toFixed(2)},${month.productsPerDeal.toFixed(2)},${month.goal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}\n`;
      });
    } else if (reportType === 'products') {
      csvContent = "Product,Count\n";
      
      productData.forEach(product => {
        csvContent += `${product.name},${product.value}\n`;
      });
    } else if (reportType === 'lenders') {
      csvContent = "Lender,Deals,Total Profit,Average Profit\n";
      
      lenderData.forEach(lender => {
        csvContent += `${lender.name},${lender.deals},$${lender.profit.toFixed(2)},$${lender.avgProfit.toFixed(2)}\n`;
      });
    }
    
    // Create download link
    const encodedUri = encodeURI("data:text/csv;charset=utf-8," + csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${reportType}_report_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    
    // Download it
    link.click();
    
    // Clean up
    document.body.removeChild(link);
  };
  
  if (loading || profileLoading) {
    return <div className="loading">Loading report data...</div>;
  }
  
  if (error) {
    return <div className="reports-error">{error}</div>;
  }
  
  return (
    <div className="reports-container">
      <div className="reports-header">
        <h1>Reports</h1>
        <div className="report-controls">
          <div className="control-group">
            <label>Report Type</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
            >
              <option value="monthly">Monthly Summary</option>
              <option value="products">Product Distribution</option>
              <option value="lenders">Lender Performance</option>
            </select>
          </div>
          <div className="control-group">
            <label>Time Range</label>
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
            >
              <option value="3">Last 3 Months</option>
              <option value="6">Last 6 Months</option>
              <option value="12">Last 12 Months</option>
            </select>
          </div>
          <button className="export-btn" onClick={exportToCsv}>
            Export to CSV
          </button>
        </div>
      </div>
      
      {loading ? (
        <div className="loading">Loading report data...</div>
      ) : (
        <div className="report-content">
          {reportType === 'monthly' && (
            <div className="report-section">
              <h2>Monthly Performance Summary</h2>
              <div className="stats-summary">
                <div className="stat-card">
                  <h3>Total Deals</h3>
                  <p className="stat-value">
                    {monthlyData.reduce((sum, month) => sum + month.deals, 0)}
                  </p>
                </div>
                <div className="stat-card">
                  <h3>Total Back-End Profit</h3>
                  <p className="stat-value">
                    ${monthlyData.reduce((sum, month) => sum + month.backEndProfit, 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                  </p>
                </div>
                <div className="stat-card">
                  <h3>Avg Profit per Deal</h3>
                  <p className="stat-value">
                    ${(monthlyData.reduce((sum, month) => sum + (month.avgProfit * month.deals), 0) / 
                    monthlyData.reduce((sum, month) => sum + month.deals, 0) || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                  </p>
                </div>
                <div className="stat-card">
                  <h3>Avg Products per Deal</h3>
                  <p className="stat-value">
                    {(monthlyData.reduce((sum, month) => sum + (month.productsPerDeal * month.deals), 0) / 
                    monthlyData.reduce((sum, month) => sum + month.deals, 0) || 0).toFixed(1)}
                  </p>
                </div>
              </div>
              
              {monthlyData.length > 0 ? (
                <>
                  <div className="chart-container">
                    <h3>Monthly Profit Trend</h3>
                    <div className="chart-wrapper">
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={monthlyData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="month" />
                          <YAxis yAxisId="left" orientation="left" stroke="#8884d8" />
                          <YAxis yAxisId="right" orientation="right" stroke="#82ca9d" />
                          <Tooltip formatter={(value, name) => {
                            if (name === 'backEndProfit') return [`$${value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`, 'Back-End Profit'];
                            if (name === 'deals') return [value, 'Deals'];
                            return [value, name];
                          }} />
                          <Legend />
                          <Line yAxisId="left" type="monotone" dataKey="backEndProfit" name="Back-End Profit" stroke="#8884d8" activeDot={{ r: 8 }} />
                          <Line yAxisId="left" type="monotone" dataKey="goal" name="Monthly Goal" stroke="#ff7300" strokeDasharray="5 5" />
                          <Line yAxisId="right" type="monotone" dataKey="deals" name="Number of Deals" stroke="#82ca9d" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  
                  <div className="chart-container">
                    <h3>Average Profit per Deal</h3>
                    <div className="chart-wrapper">
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={monthlyData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="month" />
                          <YAxis />
                          <Tooltip formatter={(value) => [`$${value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`, 'Avg Profit']} />
                          <Bar dataKey="avgProfit" name="Avg Profit per Deal" fill="#3f87f5" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </>
              ) : (
                <div className="no-data-message">
                  <p>No deal data available for the selected time period.</p>
                </div>
              )}
              
              <div className="data-table">
                <h3>Monthly Data</h3>
                {monthlyData.length > 0 ? (
                  <table>
                    <thead>
                      <tr>
                        <th>Month</th>
                        <th>Deals</th>
                        <th>Back-End Profit</th>
                        <th>Avg Profit</th>
                        <th>Products/Deal</th>
                        <th>Goal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyData.map((month, index) => (
                        <tr key={index}>
                          <td>{month.month}</td>
                          <td>{month.deals}</td>
                          <td>${month.backEndProfit.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                          <td>${month.avgProfit.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                          <td>{month.productsPerDeal.toFixed(1)}</td>
                          <td>${month.goal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="no-data">No data available for the selected time period.</p>
                )}
              </div>
            </div>
          )}
          
          {reportType === 'products' && (
            <div className="report-section">
              <h2>Product Distribution Analysis</h2>
              {productData.length > 0 ? (
                <>
                  <div className="chart-container">
                    <h3>Product Distribution</h3>
                    <div className="chart-wrapper">
                      <ResponsiveContainer width="100%" height={400}>
                        <PieChart>
                          <Pie
                            data={productData}
                            cx="50%"
                            cy="50%"
                            labelLine={true}
                            label={({name, percent}) => `${name}: ${(percent * 100).toFixed(0)}%`}
                            outerRadius={150}
                            fill="#8884d8"
                            dataKey="value"
                          >
                            {productData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value, name, props) => [`${value} sales`, props.payload.name]} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  
                  <div className="data-table">
                    <h3>Product Sales</h3>
                    <table>
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Sales</th>
                          <th>Percentage</th>
                        </tr>
                      </thead>
                      <tbody>
                        {productData.map((product, index) => {
                          const totalSales = productData.reduce((sum, p) => sum + p.value, 0);
                          const percentage = totalSales > 0 ? (product.value / totalSales * 100).toFixed(1) : '0.0';
                          
                          return (
                            <tr key={index}>
                              <td>{product.name}</td>
                              <td>{product.value}</td>
                              <td>{percentage}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="no-data-message">
                  <p>No product data available for the selected time period.</p>
                </div>
              )}
            </div>
          )}
          
          {reportType === 'lenders' && (
            <div className="report-section">
              <h2>Lender Performance Analysis</h2>
              {lenderData.length > 0 ? (
                <>
                  <div className="chart-container">
                    <h3>Deals by Lender</h3>
                    <div className="chart-wrapper">
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={lenderData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" />
                          <YAxis />
                          <Tooltip />
                          <Bar dataKey="deals" name="Deals" fill="#8884d8" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  
                  <div className="chart-container">
                    <h3>Average Profit by Lender</h3>
                    <div className="chart-wrapper">
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={lenderData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" />
                          <YAxis />
                          <Tooltip formatter={(value) => [`$${value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`, 'Avg Profit']} />
                          <Bar dataKey="avgProfit" name="Avg Profit per Deal" fill="#82ca9d" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  
                  <div className="data-table">
                    <h3>Lender Performance</h3>
                    <table>
                      <thead>
                        <tr>
                          <th>Lender</th>
                          <th>Deals</th>
                          <th>Total Profit</th>
                          <th>Avg Profit per Deal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lenderData.map((lender, index) => (
                          <tr key={index}>
                            <td>{lender.name}</td>
                            <td>{lender.deals}</td>
                            <td>${lender.profit.toLocaleString(undefined, {minimumFractionDigits:.2, maximumFractionDigits: 2})}</td>
                            <td>${lender.avgProfit.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="no-data-message">
                  <p>No lender data available for the selected time period.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Reports; 