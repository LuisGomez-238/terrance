import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy, limit, doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../AuthContext';
import { format, subMonths, startOfMonth, endOfMonth, parseISO, isWithinInterval, setMonth, setYear } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import './Reports.scss';
import { useProfile } from '../../contexts/ProfileContext';
import { useLoading } from '../../contexts/LoadingContext';

function Reports() {
  const { currentUser } = useAuth();
  
  // Get profile data and handle potential undefined values
  const profileContext = useProfile();
  const userProfile = profileContext?.userProfile || { monthlyTarget: 10000 };
  const profileLoading = profileContext?.loading || false;
  
  // Remove local loading state
  const [error, setError] = useState(null);
  const [reportType, setReportType] = useState('monthly');
  const [timeRange, setTimeRange] = useState('current');
  const [monthlyData, setMonthlyData] = useState([]);
  const [productData, setProductData] = useState([]);
  const [lenderData, setLenderData] = useState([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth()); // 0-11 for Jan-Dec
  const [monthlyGoal, setMonthlyGoal] = useState(userProfile.monthlyTarget || 10000);
  const [dataLoaded, setDataLoaded] = useState(false); // Track data loaded state
  const [productPenetrationData, setProductPenetrationData] = useState([]);
  
  // Colors for pie chart
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#A4DE6C', '#8884D8', '#FF6B6B'];
  
  // Get loading functions from context
  const { showLoading, hideLoading } = useLoading();
  
  // Generate array of years (current year and 4 years back)
  const availableYears = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);
  
  // Generate array of months for dropdown
  const months = [
    { value: 0, label: 'January' },
    { value: 1, label: 'February' },
    { value: 2, label: 'March' },
    { value: 3, label: 'April' },
    { value: 4, label: 'May' },
    { value: 5, label: 'June' },
    { value: 6, label: 'July' },
    { value: 7, label: 'August' },
    { value: 8, label: 'September' },
    { value: 9, label: 'October' },
    { value: 10, label: 'November' },
    { value: 11, label: 'December' }
  ];
  
  // Update useEffect to react to profile changes
  useEffect(() => {
    if (userProfile && userProfile.monthlyTarget) {
      console.log("Monthly target updated from profile:", userProfile.monthlyTarget);
      setMonthlyGoal(userProfile.monthlyTarget);
    }
  }, [userProfile.monthlyTarget]);
  
  // Handler for timeRange change
  const handleTimeRangeChange = (e) => {
    const newValue = e.target.value;
    setTimeRange(newValue);
    
    // If switching to specific month, we need to update the dropdowns to current month
    if (newValue === 'specific') {
      setSelectedMonth(new Date().getMonth());
      setSelectedYear(new Date().getFullYear());
    }
  };
  
  // Main effect for fetching report data
  useEffect(() => {
    const fetchReportData = async () => {
      showLoading("Generating your reports...");
      setDataLoaded(false);
      
      try {
        // First, ensure we have the latest monthly target
        const fetchUserMonthlyTarget = async () => {
          if (!currentUser) return monthlyGoal;
          
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
          
          return monthlyGoal;
        };
        
        await fetchUserMonthlyTarget();
        
        // Determine date range based on timeRange selection
        const today = new Date();
        let startDate;
        let endDate;
        let months;
        
        if (timeRange === 'specific') {
          // Specific month selected
          let specificDate = new Date();
          specificDate = setYear(specificDate, selectedYear);
          specificDate = setMonth(specificDate, selectedMonth);
          
          startDate = startOfMonth(specificDate);
          endDate = endOfMonth(specificDate);
          months = 1;
        } else if (timeRange === 'current') {
          // Current month to date
          startDate = startOfMonth(today);
          endDate = today;
          months = 1;
        } else {
          // For other time ranges (3, 6, 12 months)
          months = parseInt(timeRange);
          startDate = startOfMonth(subMonths(today, months - 1));
          endDate = today;
        }
        
        // Fetch all deals for the current user
        const dealsRef = collection(db, 'deals');
        let dealsQuery = query(
          dealsRef,
          where('userId', '==', currentUser.uid)
        );
        
        const dealsSnapshot = await getDocs(dealsQuery);
        let deals = [];
        
        console.log('Fetched deals:', dealsSnapshot.size);
        
        dealsSnapshot.forEach(doc => {
          const dealData = doc.data();
          
          // Process the date (try all possible date fields)
          let dealDate;
          if (dealData.dateSold) {
            dealDate = dealData.dateSold.toDate ? dealData.dateSold.toDate() : new Date(dealData.dateSold);
          } else if (dealData.date) {
            dealDate = dealData.date.toDate ? dealData.date.toDate() : new Date(dealData.date);
          } else if (dealData.createdAt) {
            dealDate = dealData.createdAt.toDate ? dealData.createdAt.toDate() : new Date(dealData.createdAt);
          } else {
            // If no date field, use current date
            dealDate = new Date();
          }
          
          // Skip deals that are outside our time range
          if (dealDate < startDate) {
            return;
          }
          
          // For specific month, also check the end date
          if (timeRange === 'specific' && dealDate > endDate) {
            return;
          }
          
          // Calculate total profit from all sources
          // 1. Product profit
          let productProfit = 0;
          let productList = [];
          let productCount = 0;
          
          if (Array.isArray(dealData.products)) {
            productCount = dealData.products.length;
            dealData.products.forEach(product => {
              if (typeof product === 'object') {
                const profit = parseFloat(product.profit || 0);
                productProfit += profit;
                
                // Keep track of product names for distribution analysis
                if (product.name) {
                  productList.push(product.name);
                } else if (product.id) {
                  // Try to find a product name from the ID
                  const productName = product.id.replace(/([A-Z])/g, ' $1')
                    .replace(/^./, str => str.toUpperCase());
                  productList.push(productName);
                }
              } else if (typeof product === 'string') {
                // Legacy format where products are just strings
                productList.push(product);
              }
            });
          }
          
          // 2. Finance reserve
          let financeReserve = 0;
          if (dealData.financeReserve) {
            // If finance reserve is explicitly stored
            financeReserve = parseFloat(dealData.financeReserve || 0);
          } else if (dealData.useManualReserve && dealData.manualReserveAmount) {
            // If manual reserve is used
            financeReserve = parseFloat(dealData.manualReserveAmount || 0);
          } else if (dealData.sellRate && dealData.buyRate && dealData.loanAmount) {
            // Calculate finance reserve
            const buyRate = parseFloat(dealData.buyRate || 0);
            const sellRate = parseFloat(dealData.sellRate || 0);
            const loanAmount = parseFloat(dealData.loanAmount || 0);
            const loanTerm = parseInt(dealData.term || dealData.loanTerm || 0);
            
            if (loanAmount && loanTerm && sellRate >= buyRate) {
              const rateSpread = sellRate - buyRate;
              const reservePercentage = rateSpread * 2;
              const cappedReservePercentage = Math.min(reservePercentage, 5);
              financeReserve = (loanAmount * (cappedReservePercentage / 100));
            }
          }
          
          // Calculate total profit (products + finance reserve)
          const totalProfit = productProfit + financeReserve;
          
          // Get lender information
          const lenderName = dealData.lenderName || 
                             (dealData.lender && typeof dealData.lender === 'object' ? 
                               dealData.lender.name : dealData.lender) || 
                             'Unknown';
          
          deals.push({
            id: doc.id,
            date: dealDate,
            profit: totalProfit,
            productProfit: productProfit,
            financeReserve: financeReserve,
            products: productList,
            productCount: productCount,
            lender: lenderName,
            customer: typeof dealData.customer === 'object' ? 
                      dealData.customer.name : dealData.customer,
            vehicle: dealData.vehicle || { model: 'Unknown' }
          });
        });
        
        console.log('Processed deals:', deals.length);
        
        // Process the data for monthly report
        const monthlyProfitData = [];
        const productCounts = {};
        const lenderCounts = {};
        const lenderProfits = {};
        
        // Generate month data structure based on time range
        if (timeRange === 'specific') {
          // For specific month, we just need one month
          const specificDate = new Date(selectedYear, selectedMonth, 1);
          const monthStart = startOfMonth(specificDate);
          const monthEnd = endOfMonth(specificDate);
          const monthName = format(specificDate, 'MMM yyyy');
          
          // Filter deals for this month
          const monthDeals = deals.filter(deal => 
            isWithinInterval(deal.date, { start: monthStart, end: monthEnd })
          );
          
          const totalProfit = monthDeals.reduce((sum, deal) => sum + deal.profit, 0);
          const avgProfit = monthDeals.length > 0 ? totalProfit / monthDeals.length : 0;
          const totalProducts = monthDeals.reduce((sum, deal) => sum + deal.productCount, 0);
          const productsPerDeal = monthDeals.length > 0 ? totalProducts / monthDeals.length : 0;
          
          monthlyProfitData.push({
            month: monthName,
            deals: monthDeals.length,
            backEndProfit: totalProfit,
            avgProfit,
            productsPerDeal,
            goal: monthlyGoal
          });
          
          // Process product and lender data
          monthDeals.forEach(deal => {
            if (Array.isArray(deal.products)) {
              deal.products.forEach(product => {
                productCounts[product] = (productCounts[product] || 0) + 1;
              });
            }
            
            if (deal.lender) {
              lenderCounts[deal.lender] = (lenderCounts[deal.lender] || 0) + 1;
              lenderProfits[deal.lender] = (lenderProfits[deal.lender] || 0) + deal.profit;
            }
          });
        } else {
          // For other time ranges
          for (let i = months - 1; i >= 0; i--) {
            const date = subMonths(today, i);
            const monthStart = startOfMonth(date);
            const monthEnd = endOfMonth(date);
            const monthName = format(date, 'MMM yyyy');
            
            // Filter deals for this month
            const monthDeals = deals.filter(deal => 
              isWithinInterval(deal.date, { start: monthStart, end: monthEnd })
            );
            
            const totalProfit = monthDeals.reduce((sum, deal) => sum + deal.profit, 0);
            const avgProfit = monthDeals.length > 0 ? totalProfit / monthDeals.length : 0;
            const totalProducts = monthDeals.reduce((sum, deal) => sum + deal.productCount, 0);
            const productsPerDeal = monthDeals.length > 0 ? totalProducts / monthDeals.length : 0;
            
            monthlyProfitData.push({
              month: monthName,
              deals: monthDeals.length,
              backEndProfit: totalProfit,
              avgProfit,
              productsPerDeal,
              goal: monthlyGoal
            });
            
            // Process product data
            monthDeals.forEach(deal => {
              if (Array.isArray(deal.products)) {
                deal.products.forEach(product => {
                  productCounts[product] = (productCounts[product] || 0) + 1;
                });
              }
              
              // Process lender data
              if (deal.lender) {
                lenderCounts[deal.lender] = (lenderCounts[deal.lender] || 0) + 1;
                lenderProfits[deal.lender] = (lenderProfits[deal.lender] || 0) + deal.profit;
              }
            });
          }
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
        
        // Calculate product penetration
        const totalDeals = deals.length;
        const productPenetration = Object.keys(productCounts).map(name => {
          const count = productCounts[name];
          const penetrationRate = totalDeals > 0 ? (count / totalDeals) * 100 : 0;
          
          return {
            name,
            value: penetrationRate,
            count
          };
        }).sort((a, b) => b.value - a.value);
        
        console.log('Monthly data:', monthlyProfitData);
        
        setMonthlyData(monthlyProfitData);
        setProductData(productChartData);
        setLenderData(lenderChartData);
        setProductPenetrationData(productPenetration);
        setDataLoaded(true);
      } catch (error) {
        console.error('Error fetching report data:', error);
        setError('Failed to load report data. Please try again.');
      } finally {
        hideLoading();
      }
    };
    
    fetchReportData();
  }, [currentUser, timeRange, reportType, selectedYear, selectedMonth, monthlyGoal]);
  
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
      csvContent = "Product,Count,Penetration Rate (%)\n";
      
      productPenetrationData.forEach(product => {
        csvContent += `${product.name},${product.count},${product.value.toFixed(1)}\n`;
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
  
  // Return null when data is loading to let the global spinner handle it
  if (!dataLoaded && !error) {
    return null;
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
              onChange={handleTimeRangeChange}
            >
              <option value="current">Current Month to Date</option>
              <option value="specific">Specific Month</option>
              <option value="3">Last 3 Months</option>
              <option value="6">Last 6 Months</option>
              <option value="12">Last 12 Months</option>
            </select>
          </div>
          
          {/* Show month/year selectors only when specific month is selected */}
          {timeRange === 'specific' && (
            <>
              <div className="control-group">
                <label>Month</label>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                >
                  {months.map((month) => (
                    <option key={month.value} value={month.value}>
                      {month.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="control-group">
                <label>Year</label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                >
                  {availableYears.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
          
          <button className="export-btn" onClick={exportToCsv}>
            Export to CSV
          </button>
        </div>
      </div>
      
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
                <div className="chart-container pie-chart-container">
                  <h3>Product Distribution</h3>
                  <div className="chart-wrapper">
                    <ResponsiveContainer width="100%" height={350}>
                      <PieChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                        <Pie
                          data={productData}
                          cx="50%"
                          cy="50%"
                          labelLine={true}
                          label={({name, percent}) => `${name}: ${(percent * 100).toFixed(0)}%`}
                          outerRadius={120}
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
                
                <div className="chart-container">
                  <h3>Product Penetration Rate</h3>
                  <p className="chart-description">
                    Percentage of deals that include each product
                  </p>
                  <div className="chart-wrapper">
                    <ResponsiveContainer width="100%" height={400}>
                      <BarChart 
                        data={productPenetrationData} 
                        margin={{ top: 20, right: 30, left: 20, bottom: 50 }}
                        layout="vertical"
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                        <YAxis type="category" dataKey="name" width={150} />
                        <Tooltip 
                          formatter={(value, name, props) => [
                            `${value.toFixed(1)}% (${props.payload.count} deals)`, 
                            'Penetration Rate'
                          ]} 
                        />
                        <Legend />
                        <Bar 
                          dataKey="value" 
                          name="Penetration Rate" 
                          fill="#8884d8"
                          label={{ 
                            position: 'right', 
                            formatter: (value) => `${value.toFixed(1)}%`,
                            fill: '#666'
                          }}
                        />
                      </BarChart>
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
                
                <div className="data-table">
                  <h3>Product Penetration</h3>
                  <table>
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Number of Deals</th>
                        <th>Penetration Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productPenetrationData.map((product, index) => (
                        <tr key={index}>
                          <td>{product.name}</td>
                          <td>{product.count}</td>
                          <td>{product.value.toFixed(1)}%</td>
                        </tr>
                      ))}
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
    </div>
  );
}

export default Reports; 