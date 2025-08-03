import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, Timestamp, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../AuthContext';
import { useLoading } from '../../contexts/LoadingContext';
import './Reports.scss';

// Sample imports for charts - you'll need to install these packages
// npm install recharts
import { 
  LineChart, Line, BarChart, Bar, PieChart, Pie, 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, 
  ResponsiveContainer, Cell 
} from 'recharts';

function SalesManagerReports() {
  const { currentUser } = useAuth();
  const { showLoading, hideLoading } = useLoading();
  const [selectedReport, setSelectedReport] = useState('monthly');
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1), // First day of current month
    end: new Date()
  });
  const [reportData, setReportData] = useState({
    monthly: [],
    products: [],
    managers: [],
    funding: []
  });
  const [loading, setLoading] = useState(false);
  const [financeManagers, setFinanceManagers] = useState([]);
  
  // Kia brand colors for charts
  const chartColors = ['#BB162B', '#000000', '#5D6167', '#E63946', '#457B9D', '#1D3557'];
  
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
      return managers;
    } catch (error) {
      console.error("Error fetching finance managers:", error);
      return [];
    }
  };
  
  // Function to update date range based on report type
  const updateDateRange = (reportType) => {
    const now = new Date();
    let start;
    
    switch(reportType) {
      case 'monthly':
        // Last 12 months
        start = new Date(now);
        start.setMonth(start.getMonth() - 12);
        start.setDate(1);
        break;
      case 'quarterly':
        // Last 4 quarters
        start = new Date(now);
        start.setMonth(start.getMonth() - 15);
        break;
      case 'yearly':
        // Last 3 years
        start = new Date(now);
        start.setFullYear(start.getFullYear() - 3);
        start.setMonth(0, 1); // January 1st
        break;
      case 'custom':
        // Don't change the current date range
        return;
      default:
        // Default to last 12 months
        start = new Date(now);
        start.setMonth(start.getMonth() - 12);
        start.setDate(1);
    }
    
    setDateRange({
      start,
      end: now
    });
  };
  
  // Generate monthly performance report data
  const generateMonthlyReport = async () => {
    try {
      const dealsRef = collection(db, 'deals');
      const q = query(
        dealsRef,
        where('dateSold', '>=', Timestamp.fromDate(dateRange.start)),
        where('dateSold', '<=', Timestamp.fromDate(dateRange.end)),
        orderBy('dateSold', 'asc')
      );
      
      const querySnapshot = await getDocs(q);
      
      // Prepare monthly buckets
      const monthlyData = {};
      
      // Initialize months for the past year
      const startMonth = dateRange.start.getMonth();
      const startYear = dateRange.start.getFullYear();
      
      for (let i = 0; i < 12; i++) {
        const monthIdx = (startMonth + i) % 12;
        const year = startYear + Math.floor((startMonth + i) / 12);
        const monthKey = `${year}-${(monthIdx + 1).toString().padStart(2, '0')}`;
        
        monthlyData[monthKey] = {
          name: new Date(year, monthIdx, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
          deals: 0,
          profit: 0,
          products: 0
        };
      }
      
      // Process deals
      querySnapshot.forEach(doc => {
        const deal = doc.data();
        if (deal.dateSold) {
          const date = deal.dateSold.toDate();
          const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
          
          // Skip if month is not in our range
          if (!monthlyData[monthKey]) return;
          
          monthlyData[monthKey].deals += 1;
          monthlyData[monthKey].profit += parseFloat(deal.totalProfit || deal.backEndProfit || deal.profit || 0);
          
          if (Array.isArray(deal.products)) {
            monthlyData[monthKey].products += deal.products.length;
          }
        }
      });
      
      // Convert to array and calculate averages
      const monthlyArray = Object.values(monthlyData).map(month => ({
        ...month,
        avgProfit: month.deals > 0 ? month.profit / month.deals : 0,
        productsPerDeal: month.deals > 0 ? month.products / month.deals : 0
      }));
      
      return monthlyArray;
    } catch (error) {
      console.error("Error generating monthly report:", error);
      return [];
    }
  };
  
  // Generate products performance report
  const generateProductsReport = async () => {
    try {
      const dealsRef = collection(db, 'deals');
      const q = query(
        dealsRef,
        where('dateSold', '>=', Timestamp.fromDate(dateRange.start)),
        where('dateSold', '<=', Timestamp.fromDate(dateRange.end))
      );
      
      const querySnapshot = await getDocs(q);
      
      // Track product types and their metrics
      const productData = {};
      
      querySnapshot.forEach(doc => {
        const deal = doc.data();
        
        if (Array.isArray(deal.products)) {
          deal.products.forEach(product => {
            const productName = typeof product === 'object' ? (product.name || 'Unknown') : product;
            
            if (!productData[productName]) {
              productData[productName] = {
                name: productName,
                count: 0,
                profit: 0
              };
            }
            
            productData[productName].count += 1;
            
            // Add profit if available
            if (typeof product === 'object') {
              const soldPrice = parseFloat(product.soldPrice || product.price || 0);
              const cost = parseFloat(product.cost || 0);
              const profit = !isNaN(soldPrice) && !isNaN(cost) ? soldPrice - cost : 0;
              
              productData[productName].profit += profit;
            }
          });
        }
      });
      
      // Convert to array and sort by count
      const productsArray = Object.values(productData)
        .map(product => ({
          ...product,
          avgProfit: product.count > 0 ? product.profit / product.count : 0
        }))
        .sort((a, b) => b.count - a.count);
      
      return productsArray;
    } catch (error) {
      console.error("Error generating products report:", error);
      return [];
    }
  };
  
  // Generate Finance Manager performance comparison
  const generateManagersReport = async (managers) => {
    try {
      const dealsRef = collection(db, 'deals');
      const q = query(
        dealsRef,
        where('dateSold', '>=', Timestamp.fromDate(dateRange.start)),
        where('dateSold', '<=', Timestamp.fromDate(dateRange.end))
      );
      
      const querySnapshot = await getDocs(q);
      
      // Initialize manager data
      const managerData = {};
      managers.forEach(manager => {
        managerData[manager.id] = {
          id: manager.id,
          name: manager.name,
          deals: 0,
          profit: 0,
          products: 0,
          houseDeals: 0,
          funded: 0,
          pending: 0
        };
      });
      
      // Process each deal
      querySnapshot.forEach(doc => {
        const deal = doc.data();
        const managerId = deal.userId;
        
        // Skip if not a tracked manager
        if (!managerData[managerId]) return;
        
        managerData[managerId].deals += 1;
        managerData[managerId].profit += parseFloat(deal.totalProfit || deal.backEndProfit || deal.profit || 0);
        
        if (Array.isArray(deal.products)) {
          managerData[managerId].products += deal.products.length;
        }
        
        if (deal.houseDeal) {
          managerData[managerId].houseDeals += 1;
        }
        
        if (deal.fundedDate) {
          managerData[managerId].funded += 1;
        } else {
          managerData[managerId].pending += 1;
        }
      });
      
      // Calculate metrics and convert to array
      const managersArray = Object.values(managerData)
        .map(manager => ({
          ...manager,
          avgProfit: manager.deals > 0 ? manager.profit / manager.deals : 0,
          productsPerDeal: manager.deals > 0 ? manager.products / manager.deals : 0,
          fundingRate: manager.deals > 0 ? (manager.funded / manager.deals) * 100 : 0
        }))
        .sort((a, b) => b.deals - a.deals);
      
      return managersArray;
    } catch (error) {
      console.error("Error generating managers report:", error);
      return [];
    }
  };
  
  // Generate funding status report
  const generateFundingReport = async () => {
    try {
      const dealsRef = collection(db, 'deals');
      const q = query(
        dealsRef,
        where('dateSold', '>=', Timestamp.fromDate(dateRange.start)),
        where('dateSold', '<=', Timestamp.fromDate(dateRange.end))
      );
      
      const querySnapshot = await getDocs(q);
      
      const fundingData = {
        funded: 0,
        pending: 0,
        lessThan3Days: 0,
        between3And7Days: 0,
        moreThan7Days: 0,
        totalValue: 0,
        pendingValue: 0
      };
      
      const now = new Date();
      
      querySnapshot.forEach(doc => {
        const deal = doc.data();
        const profit = parseFloat(deal.totalProfit || deal.backEndProfit || deal.profit || 0);
        
        if (deal.fundedDate) {
          fundingData.funded += 1;
        } else {
          fundingData.pending += 1;
          fundingData.pendingValue += profit;
          
          // Calculate days since deal was sold
          if (deal.dateSold) {
            const dealDate = deal.dateSold.toDate();
            const daysDiff = Math.floor((now - dealDate) / (1000 * 60 * 60 * 24));
            
            if (daysDiff < 3) {
              fundingData.lessThan3Days += 1;
            } else if (daysDiff >= 3 && daysDiff <= 7) {
              fundingData.between3And7Days += 1;
            } else {
              fundingData.moreThan7Days += 1;
            }
          }
        }
        
        fundingData.totalValue += profit;
      });
      
      // Add percentage fields
      const totalDeals = fundingData.funded + fundingData.pending;
      if (totalDeals > 0) {
        fundingData.fundedPercent = (fundingData.funded / totalDeals) * 100;
        fundingData.pendingPercent = (fundingData.pending / totalDeals) * 100;
      }
      
      // Create data array for pie chart
      const pieChartData = [
        { name: 'Funded', value: fundingData.funded },
        { name: '< 3 Days', value: fundingData.lessThan3Days },
        { name: '3-7 Days', value: fundingData.between3And7Days },
        { name: '> 7 Days', value: fundingData.moreThan7Days }
      ];
      
      return {
        summary: fundingData,
        pieData: pieChartData
      };
    } catch (error) {
      console.error("Error generating funding report:", error);
      return { summary: {}, pieData: [] };
    }
  };
  
  // Load all report data
  const loadReportData = async () => {
    setLoading(true);
    showLoading("Generating reports...");
    
    try {
      // Ensure we have managers data
      let managers = financeManagers;
      if (managers.length === 0) {
        managers = await fetchFinanceManagers();
      }
      
      // Generate all reports
      const monthly = await generateMonthlyReport();
      const products = await generateProductsReport();
      const managersReport = await generateManagersReport(managers);
      const funding = await generateFundingReport();
      
      setReportData({
        monthly,
        products,
        managers: managersReport,
        funding
      });
      
    } catch (error) {
      console.error("Error loading report data:", error);
    } finally {
      hideLoading();
      setLoading(false);
    }
  };
  
  // Handle report selection change
  const handleReportChange = (reportType) => {
    setSelectedReport(reportType);
    updateDateRange(reportType);
  };
  
  // Handle custom date range changes
  const handleDateChange = (field, value) => {
    setDateRange(prev => ({
      ...prev,
      [field]: new Date(value)
    }));
  };
  
  // Format currency helper function
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };
  
  // Load data when component mounts or date range changes
  useEffect(() => {
    fetchFinanceManagers();
  }, []);
  
  useEffect(() => {
    loadReportData();
  }, [dateRange, financeManagers.length]);
  
  // Render Monthly Performance Report
  const renderMonthlyReport = () => (
    <div className="report-content">
      <div className="chart-container">
        <h3>Monthly Deal Volume</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={reportData.monthly}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip formatter={(value) => value.toFixed(0)} />
            <Legend />
            <Bar dataKey="deals" fill={chartColors[0]} name="Deal Count" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      
      <div className="chart-container">
        <h3>Monthly Profit</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={reportData.monthly}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip formatter={(value) => formatCurrency(value)} />
            <Legend />
            <Line type="monotone" dataKey="profit" stroke={chartColors[0]} name="Total Profit" />
            <Line type="monotone" dataKey="avgProfit" stroke={chartColors[1]} name="Avg Profit Per Deal" />
          </LineChart>
        </ResponsiveContainer>
      </div>
      
      <div className="chart-container">
        <h3>Monthly Products Per Deal</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={reportData.monthly}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis domain={[0, 'dataMax + 1']} />
            <Tooltip formatter={(value) => value.toFixed(2)} />
            <Legend />
            <Line type="monotone" dataKey="productsPerDeal" stroke={chartColors[0]} name="Products Per Deal" />
          </LineChart>
        </ResponsiveContainer>
      </div>
      
      <div className="report-table">
        <h3>Monthly Performance Data</h3>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>Deals</th>
                <th>Total Profit</th>
                <th>Avg. Profit/Deal</th>
                <th>Products/Deal</th>
              </tr>
            </thead>
            <tbody>
              {reportData.monthly.map((month, index) => (
                <tr key={index}>
                  <td>{month.name}</td>
                  <td>{month.deals}</td>
                  <td>{formatCurrency(month.profit)}</td>
                  <td>{formatCurrency(month.avgProfit)}</td>
                  <td>{month.productsPerDeal.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
  
  // Render Products Report
  const renderProductsReport = () => (
    <div className="report-content">
      <div className="chart-container">
        <h3>Product Penetration</h3>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={reportData.products.slice(0, 10)} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" />
            <YAxis dataKey="name" type="category" width={150} />
            <Tooltip />
            <Legend />
            <Bar dataKey="count" fill={chartColors[0]} name="Number Sold" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      
      <div className="chart-container">
        <h3>Product Profit</h3>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={reportData.products.slice(0, 10)} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" />
            <YAxis dataKey="name" type="category" width={150} />
            <Tooltip formatter={(value) => formatCurrency(value)} />
            <Legend />
            <Bar dataKey="profit" fill={chartColors[1]} name="Total Profit" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      
      <div className="report-table">
        <h3>Product Performance Data</h3>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Count</th>
                <th>Total Profit</th>
                <th>Avg. Profit/Unit</th>
              </tr>
            </thead>
            <tbody>
              {reportData.products.map((product, index) => (
                <tr key={index}>
                  <td>{product.name}</td>
                  <td>{product.count}</td>
                  <td>{formatCurrency(product.profit)}</td>
                  <td>{formatCurrency(product.avgProfit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
  
  // Render Finance Managers Comparison Report
  const renderManagersReport = () => (
    <div className="report-content">
      <div className="chart-container">
        <h3>Manager Deal Volume</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={reportData.managers}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="deals" fill={chartColors[0]} name="Deal Count" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      
      <div className="chart-container">
        <h3>Manager Profit</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={reportData.managers}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip formatter={(value) => formatCurrency(value)} />
            <Legend />
            <Bar dataKey="profit" fill={chartColors[0]} name="Total Profit" />
            <Bar dataKey="avgProfit" fill={chartColors[1]} name="Avg Profit/Deal" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      
      <div className="chart-container">
        <h3>Manager Performance Metrics</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={reportData.managers}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="productsPerDeal" fill={chartColors[0]} name="Products/Deal" />
            <Bar dataKey="fundingRate" fill={chartColors[1]} name="Funding Rate %" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      
      <div className="report-table">
        <h3>Finance Manager Performance Data</h3>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Manager</th>
                <th>Deals</th>
                <th>Total Profit</th>
                <th>Avg. Profit</th>
                <th>Products/Deal</th>
                <th>Funding Rate</th>
                <th>House Deals</th>
              </tr>
            </thead>
            <tbody>
              {reportData.managers.map((manager, index) => (
                <tr key={index}>
                  <td>{manager.name}</td>
                  <td>{manager.deals}</td>
                  <td>{formatCurrency(manager.profit)}</td>
                  <td>{formatCurrency(manager.avgProfit)}</td>
                  <td>{manager.productsPerDeal.toFixed(2)}</td>
                  <td>{manager.fundingRate.toFixed(0)}%</td>
                  <td>{manager.houseDeals}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
  
  // Render Funding Status Report
  const renderFundingReport = () => {
    const { summary, pieData } = reportData.funding;
    
    if (!summary) return <div className="loading-indicator">No funding data available</div>;
    
    return (
      <div className="report-content">
        <div className="funding-summary">
          <div className="funding-metric">
            <h3>Funding Status</h3>
            <div className="metric-value">{summary.fundedPercent?.toFixed(0) || 0}%</div>
            <div className="metric-label">Funded</div>
          </div>
          
          <div className="funding-metric">
            <h3>Pending Deals</h3>
            <div className="metric-value">{summary.pending || 0}</div>
            <div className="metric-label">Deals</div>
          </div>
          
          <div className="funding-metric">
            <h3>Pending Value</h3>
            <div className="metric-value">{formatCurrency(summary.pendingValue || 0)}</div>
            <div className="metric-label">Total</div>
          </div>
        </div>
        
        <div className="chart-container">
          <h3>Funding Status Breakdown</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                outerRadius={120}
                fill="#8884d8"
                dataKey="value"
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={chartColors[index % chartColors.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => value} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
        
        <div className="funding-details">
          <div className="funding-detail-card">
            <h3>Deals Pending Less Than 3 Days</h3>
            <div className="value">{summary.lessThan3Days || 0}</div>
          </div>
          
          <div className="funding-detail-card">
            <h3>Deals Pending 3-7 Days</h3>
            <div className="value">{summary.between3And7Days || 0}</div>
          </div>
          
          <div className="funding-detail-card warning">
            <h3>Deals Pending Over 7 Days</h3>
            <div className="value">{summary.moreThan7Days || 0}</div>
          </div>
        </div>
      </div>
    );
  };
  
  // Render the current selected report
  const renderCurrentReport = () => {
    if (loading) {
      return <div className="loading-indicator">Loading report data...</div>;
    }
    
    switch (selectedReport) {
      case 'monthly':
        return renderMonthlyReport();
      case 'products':
        return renderProductsReport();
      case 'managers':
        return renderManagersReport();
      case 'funding':
        return renderFundingReport();
      default:
        return renderMonthlyReport();
    }
  };
  
  return (
    <div className="sales-reports-container">
      <div className="reports-header">
        <h1>Sales Reports</h1>
        
        <div className="report-controls">
          <div className="report-selector">
            <button 
              className={selectedReport === 'monthly' ? 'active' : ''} 
              onClick={() => handleReportChange('monthly')}
            >
              Monthly Performance
            </button>
            <button 
              className={selectedReport === 'products' ? 'active' : ''} 
              onClick={() => handleReportChange('products')}
            >
              Products Analysis
            </button>
            <button 
              className={selectedReport === 'managers' ? 'active' : ''} 
              onClick={() => handleReportChange('managers')}
            >
              Manager Comparison
            </button>
            <button 
              className={selectedReport === 'funding' ? 'active' : ''} 
              onClick={() => handleReportChange('funding')}
            >
              Funding Status
            </button>
          </div>
          
          <div className="date-range-selector">
            <div className="date-inputs">
              <div className="date-input">
                <label>From:</label>
                <input 
                  type="date" 
                  value={dateRange.start?.toISOString().split('T')[0] || ''} 
                  onChange={(e) => handleDateChange('start', e.target.value)}
                />
              </div>
              <div className="date-input">
                <label>To:</label>
                <input 
                  type="date" 
                  value={dateRange.end?.toISOString().split('T')[0] || ''} 
                  onChange={(e) => handleDateChange('end', e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="reports-content">
        {renderCurrentReport()}
      </div>
    </div>
  );
}

export default SalesManagerReports;
