import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../AuthContext';
import './Deals.scss';
import { useLoading } from '../../contexts/LoadingContext';

function Deals() {
  const { currentUser } = useAuth();
  const [deals, setDeals] = useState([]);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const { showLoading, hideLoading } = useLoading();
  const [dataLoaded, setDataLoaded] = useState(false);

  const fetchDeals = useCallback(async () => {
    if (!currentUser) {
      console.log('No current user found, aborting fetch');
      return;
    }

    try {
      showLoading("Loading your deals...");
      setDataLoaded(false);
      
      const dealsRef = collection(db, 'deals');
      
      console.log('Fetching deals for user ID:', currentUser.uid);
      
      let q = query(
        dealsRef,
        where('userId', '==', currentUser.uid)
      );
      
      const querySnapshot = await getDocs(q);
      console.log('Found deals for current user:', querySnapshot.size);
      
      const dealsData = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        
        if (data.userId === currentUser.uid) {
          const dealData = {
            id: doc.id,
            customer: typeof data.customer === 'object' ? data.customer.name : data.customer,
            vehicle: data.vehicle || {},
            dateSold: data.dateSold || data.date || data.createdAt,
            lenderName: data.lenderName || (data.lender && typeof data.lender === 'object' ? data.lender.name : data.lender) || 'N/A',
            buyRate: data.buyRate || 0,
            sellRate: data.sellRate || 0,
            loanAmount: data.loanAmount || 0,
            loanTerm: data.loanTerm || 0,
            products: Array.isArray(data.products) ? data.products : [],
            backEndProfit: data.backEndProfit || data.profit || 0,
            ...data
          };
          
          dealsData.push(dealData);
        } else {
          console.warn('Skipping deal with mismatched userId:', data.userId, 'Current user:', currentUser.uid);
        }
      });
      
      console.log('Final filtered deals count:', dealsData.length);
      
      setDeals(dealsData);
      setError(null);
      setDataLoaded(true);
    } catch (err) {
      console.error('Error fetching deals:', err);
      setError('Failed to load deals. Please try again.');
      setDeals([]);
    } finally {
      hideLoading();
    }
  }, [currentUser, showLoading, hideLoading]);

  useEffect(() => {
    fetchDeals();
  }, [fetchDeals]);

  const filterDeals = () => {
    if (!searchTerm.trim()) return deals;
    
    return deals.filter(deal => {
      const customerName = typeof deal.customer === 'object' ? deal.customer.name : deal.customer;
      const customerMatch = customerName && customerName.toLowerCase().includes(searchTerm.toLowerCase());
      
      const vehicleMatch = deal.vehicle && (
        (deal.vehicle.year && deal.vehicle.year.toString().includes(searchTerm)) ||
        (deal.vehicle.model && deal.vehicle.model.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (deal.vehicle.vin && deal.vehicle.vin.toLowerCase().includes(searchTerm.toLowerCase()))
      );
      
      return customerMatch || vehicleMatch;
    });
  };

  const filteredDeals = filterDeals();

  const formatDate = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString();
  };

  // Format vehicle information as a string
  const formatVehicle = (vehicle) => {
    if (!vehicle) return '';
    if (typeof vehicle === 'string') return vehicle;
    
    // If vehicle is an object with year, model, and vin
    return `${vehicle.year || ''} ${vehicle.model || ''}${vehicle.vin ? ` (VIN: ${vehicle.vin})` : ''}`.trim();
  };

  const formatProducts = (products) => {
    if (!products || !Array.isArray(products) || products.length === 0) {
      return 'None';
    }
    
    // For the table view, just show product names with commas
    return products.map(product => {
      if (typeof product === 'string') return product;
      return product.name || 'Unknown Product';
    }).join(', ');
  };

  const calculateTotalProfit = (deal) => {
    // Calculate product profits
    let productsProfit = 0;
    
    if (Array.isArray(deal.products)) {
      productsProfit = deal.products.reduce((sum, product) => {
        if (typeof product === 'object' && product !== null) {
          // Calculate profit from sold price and cost
          const sold = parseFloat(product.soldPrice || product.price || 0);
          const cost = parseFloat(product.cost || 0);
          
          if (sold && cost) {
            return sum + (sold - cost);
          }
          
          // Or use direct profit field if available
          if (typeof product.profit === 'number' || (typeof product.profit === 'string' && !isNaN(parseFloat(product.profit)))) {
            return sum + parseFloat(product.profit);
          }
        }
        return sum;
      }, 0);
    }
    
    // Calculate finance reserve
    const financeReserve = calculateFinanceReserve(deal);
    
    // Add any additional backend profit
    const additionalProfit = parseFloat(deal.backEndProfit || deal.profit || 0);
    
    // Total backend profit is products + finance reserve + additional profit
    return productsProfit + financeReserve + additionalProfit;
  };

  const calculateFinanceReserve = (deal) => {
    // If manual reserve is specified, use that value
    if (deal.useManualReserve && deal.manualReserveAmount) {
      return parseFloat(deal.manualReserveAmount);
    }
    
    // Otherwise calculate based on rates and loan amount
    const buyRate = parseFloat(deal.buyRate || 0);
    const sellRate = parseFloat(deal.sellRate || 0);
    const loanAmount = parseFloat(deal.loanAmount || 0);
    const loanTerm = parseInt(deal.loanTerm || 0);
    
    if (loanAmount && loanTerm && sellRate >= buyRate) {
      // Standard formula for reserve calculation
      // This is a simplified calculation - actual formula may vary by lender
      const rateSpread = sellRate - buyRate;
      const reservePercentage = rateSpread * 2; // Typical 2:1 ratio for reserve percentage
      
      // Cap at 5% maximum reserve as this is common in the industry
      const cappedReservePercentage = Math.min(reservePercentage, 5);
      return (loanAmount * (cappedReservePercentage / 100));
    }
    
    return 0;
  };

  // Return null when data is loading - let the global spinner handle it
  if (!dataLoaded && !error) {
    return null;
  }

  return (
    <div className="deals-container">
      <div className="deals-header">
        <h1>Deals</h1>
        <div className="actions">
          <div className="search-wrapper">
            <span className="material-icons">search</span>
            <input
              type="text"
              placeholder="Search deals..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Link to="/deals/new" className="btn-add">
            <span className="material-icons">add</span>
            New Deal
          </Link>
          <button className="btn-refresh" onClick={fetchDeals}>
            <span className="material-icons">refresh</span>
            Refresh
          </button>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {filteredDeals.length === 0 ? (
        <div className="empty-state">
          <span className="material-icons">description</span>
          <h3>No deals found</h3>
          <p>
            {searchTerm ? 
              'No deals match your search criteria' : 
              'You haven\'t created any deals yet. Start by creating your first deal.'
            }
          </p>
          <Link to="/deals/new" className="btn-primary">Create Deal</Link>
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="btn-secondary">
              Clear Search
            </button>
          )}
        </div>
      ) : (
        <div className="deals-table-container">
          <table className="deals-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Vehicle</th>
                <th>Date Sold</th>
                <th>Lender</th>
                <th>Rate Spread</th>
                <th>Reserve</th>
                <th>Products</th>
                <th>Total Profit</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDeals.map(deal => (
                <tr key={deal.id}>
                  <td>{deal.customer}</td>
                  <td>{formatVehicle(deal.vehicle)}</td>
                  <td>{formatDate(deal.dateSold || deal.date)}</td>
                  <td>{deal.lenderName || deal.lenderId}</td>
                  <td>
                    {deal.sellRate && deal.buyRate ? 
                      `${deal.buyRate}% → ${deal.sellRate}%` : 
                      'N/A'
                    }
                  </td>
                  <td className="reserve">
                    ${calculateFinanceReserve(deal).toFixed(2)}
                  </td>
                  <td>{formatProducts(deal.products)}</td>
                  <td className={`profit ${calculateTotalProfit(deal) > 0 ? 'positive' : 'negative'}`}>
                    ${calculateTotalProfit(deal).toFixed(2)}
                  </td>
                  <td>
                    <Link to={`/deals/${deal.id}`} className="view-btn">
                      <span className="material-icons">visibility</span>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default Deals; 