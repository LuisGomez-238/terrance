import React, { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { collection, getDocs, query, where, orderBy, limit, getFirestore, getDoc, doc, onSnapshot } from 'firebase/firestore';
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
  const location = useLocation();
  const [refreshKey, setRefreshKey] = useState(0);
  const [viewedDeals, setViewedDeals] = useState({});

  const fetchDeals = useCallback(async () => {
    if (!currentUser) {
      console.log('No current user found, aborting fetch');
      return;
    }

    try {
      console.log('Fetching deals with refresh key:', refreshKey);
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
      const fetchPromises = querySnapshot.docs.map(async (docSnapshot) => {
        const docId = docSnapshot.id;
        let data = docSnapshot.data();
        
        if (viewedDeals[docId]) {
          console.log(`Fetching fresh data for previously viewed deal: ${docId}`);
          const freshDocRef = doc(db, 'deals', docId);
          try {
            const freshDocSnap = await getDoc(freshDocRef);
            if (freshDocSnap.exists()) {
              data = freshDocSnap.data();
              console.log(`Got fresh data for deal: ${docId}`);
            }
          } catch (err) {
            console.error(`Error getting fresh data for deal ${docId}:`, err);
          }
        }
        
        if (data.userId === currentUser.uid) {
          const dealData = {
            id: docId,
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
            _fetchTime: Date.now(),
            ...data
          };
          
          dealsData.push(dealData);
        } else {
          console.warn('Skipping deal with mismatched userId:', data.userId, 'Current user:', currentUser.uid);
        }
      });
      
      await Promise.all(fetchPromises);
      
      console.log('Final filtered deals count:', dealsData.length);
      
      setupDealListeners(dealsData.map(deal => deal.id));
      
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
  }, [currentUser, showLoading, hideLoading, refreshKey, viewedDeals]);

  const setupDealListeners = useCallback((dealIds) => {
    if (window.dealListeners) {
      window.dealListeners.forEach(unsubscribe => unsubscribe());
    }
    
    window.dealListeners = [];
    
    dealIds.forEach(dealId => {
      const dealRef = doc(db, 'deals', dealId);
      const unsubscribe = onSnapshot(dealRef, (docSnapshot) => {
        if (docSnapshot.exists()) {
          console.log(`Real-time update for deal ${dealId}`);
          setDeals(prevDeals => {
            const updatedDeals = [...prevDeals];
            const dealIndex = updatedDeals.findIndex(d => d.id === dealId);
            
            if (dealIndex !== -1) {
              const data = docSnapshot.data();
              updatedDeals[dealIndex] = {
                ...updatedDeals[dealIndex],
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
                _fetchTime: Date.now(),
                ...data
              };
              console.log('Updated deal in list:', updatedDeals[dealIndex]);
            }
            
            return updatedDeals;
          });
        }
      }, (error) => {
        console.error(`Error in deal listener for ${dealId}:`, error);
      });
      
      window.dealListeners.push(unsubscribe);
    });
  }, []);

  useEffect(() => {
    console.log('Location changed or component mounted or refresh triggered, fetching deals');
    fetchDeals();
  }, [fetchDeals, location, refreshKey]);

  useEffect(() => {
    return () => {
      if (window.dealListeners) {
        window.dealListeners.forEach(unsubscribe => unsubscribe());
        window.dealListeners = [];
      }
    };
  }, []);

  useEffect(() => {
    // Check URL parameters for any edited dealId
    const params = new URLSearchParams(location.search);
    const editedDealId = params.get('edited');
    
    if (editedDealId) {
      console.log(`Deal ${editedDealId} was just edited, marking for refresh`);
      setViewedDeals(prev => ({
        ...prev,
        [editedDealId]: Date.now()
      }));
      
      // Clear the parameter from the URL to prevent duplicate refreshes
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  }, [location]);

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

  // Add this simpler vehicle formatter that shows less detail
  const formatVehicleSimple = (vehicle) => {
    if (!vehicle) return '';
    if (typeof vehicle === 'string') return vehicle;
    
    // Just year and model, no VIN
    return `${vehicle.year || ''} ${vehicle.model || ''}`.trim();
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
    // First, check if we already have a totalProfit value from Firebase
    if (deal.totalProfit !== undefined && deal.totalProfit !== null) {
      console.log(`Using stored totalProfit (${deal.totalProfit}) for deal: ${deal.id}`);
      return parseFloat(deal.totalProfit);
    }
    
    // If not, check for backEndProfit or profit fields
    if (deal.backEndProfit !== undefined && deal.backEndProfit !== null) {
      console.log(`Using stored backEndProfit (${deal.backEndProfit}) for deal: ${deal.id}`);
      return parseFloat(deal.backEndProfit);
    }
    
    if (deal.profit !== undefined && deal.profit !== null) {
      console.log(`Using stored profit (${deal.profit}) for deal: ${deal.id}`);
      return parseFloat(deal.profit);
    }
    
    // As a last resort, calculate it manually
    console.log(`No stored profit value for deal: ${deal.id}, calculating manually`);
    
    // Calculate product profits
    let productsProfit = 0;
    
    if (Array.isArray(deal.products)) {
      productsProfit = deal.products.reduce((sum, product) => {
        if (typeof product === 'object' && product !== null) {
          // Calculate profit from sold price and cost
          const sold = parseFloat(product.soldPrice || product.price || 0);
          const cost = parseFloat(product.cost || 0);
          
          if (!isNaN(sold) && !isNaN(cost)) {
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
    const additionalProfit = typeof deal.backEndProfit === 'number' || typeof deal.backEndProfit === 'string' 
      ? parseFloat(deal.backEndProfit || 0) 
      : parseFloat(deal.profit || 0);
    
    const total = productsProfit + financeReserve + additionalProfit;
    
    // Log for debugging
    console.log('Deal profit calculation:', {
      id: deal.id,
      customer: deal.customer,
      productsProfit,
      financeReserve,
      additionalProfit,
      total
    });
    
    // Total backend profit is products + finance reserve + additional profit
    return total;
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

  const handleRefreshClick = () => {
    setRefreshKey(prevKey => prevKey + 1);
  };

  // Track when a deal is viewed
  const handleDealView = (dealId) => {
    setViewedDeals(prev => ({
      ...prev,
      [dealId]: Date.now()
    }));
  };

  // Update the view button to track when a deal is viewed
  const ViewButton = ({ dealId }) => (
    <Link 
      to={`/deals/${dealId}`} 
      className="view-btn" 
      onClick={() => handleDealView(dealId)}
    >
      <span className="material-icons">visibility</span>
    </Link>
  );

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
          <Link to="/deals/new" className="btn-add kia-button">
            <span className="material-icons">add</span>
            New Deal
          </Link>
          <button className="btn-refresh kia-button-secondary" onClick={handleRefreshClick}>
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
          <Link to="/deals/new" className="btn-primary kia-button">Create Deal</Link>
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="btn-secondary kia-button-secondary">
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
                <th>Date</th>
                <th>Lender</th>
                <th>Total Profit</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredDeals.map(deal => (
                <tr key={deal.id}>
                  <td className="customer-cell">{deal.customer}</td>
                  <td>{formatVehicleSimple(deal.vehicle)}</td>
                  <td>{formatDate(deal.dateSold || deal.date)}</td>
                  <td className="lender-cell">{deal.lenderName || deal.lenderId}</td>
                  <td className={`profit ${calculateTotalProfit(deal) > 0 ? 'positive' : 'negative'}`}>
                    ${calculateTotalProfit(deal).toFixed(2)}
                  </td>
                  <td className="actions-cell">
                    <ViewButton dealId={deal.id} />
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