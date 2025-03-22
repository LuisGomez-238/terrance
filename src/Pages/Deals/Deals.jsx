import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../AuthContext';
import './Deals.scss';

function Deals() {
  const { currentUser } = useAuth();
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchDeals = async () => {
      try {
        setLoading(true);
        const dealsRef = collection(db, 'deals');
        let q;
        
        try {
          // Try the complex query first
          q = query(
            dealsRef,
            where('userId', '==', currentUser.uid),
            orderBy('createdAt', 'desc')
          );
          
          const querySnapshot = await getDocs(q);
          const dealsData = [];
          
          querySnapshot.forEach((doc) => {
            dealsData.push({
              id: doc.id,
              ...doc.data()
            });
          });
          
          setDeals(dealsData);
        } catch (indexErr) {
          // If the index error occurs, fallback to simpler query
          if (indexErr.message && indexErr.message.includes('index')) {
            console.warn('Index not found, using fallback query method');
            
            q = query(dealsRef, where('userId', '==', currentUser.uid));
            const querySnapshot = await getDocs(q);
            const dealsData = [];
            
            querySnapshot.forEach((doc) => {
              dealsData.push({
                id: doc.id,
                ...doc.data()
              });
            });
            
            // Sort in JavaScript
            dealsData.sort((a, b) => {
              const dateA = a.createdAt ? new Date(a.createdAt.seconds * 1000) : new Date(0);
              const dateB = b.createdAt ? new Date(b.createdAt.seconds * 1000) : new Date(0);
              return dateB - dateA;
            });
            
            setDeals(dealsData);
            
            // Display more user-friendly error about the index
            setError(
              'An index is being created for better performance. This may take a few minutes. ' +
              'You can continue to use the app with limited sorting capabilities until then.'
            );
          } else {
            // If it's not an index error, re-throw it
            throw indexErr;
          }
        }
      } catch (err) {
        console.error('Error fetching deals:', err);
        setError('Failed to load deals. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    
    if (currentUser) {
      fetchDeals();
    }
  }, [currentUser]);

  const filterDeals = () => {
    if (!searchTerm.trim()) return deals;
    
    return deals.filter(deal => {
      const customerMatch = deal.customer && deal.customer.toLowerCase().includes(searchTerm.toLowerCase());
      const vehicleMatch = deal.vehicle && 
        (
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
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {loading ? (
        <div className="loading">Loading deals...</div>
      ) : filteredDeals.length === 0 ? (
        <div className="empty-state">
          <span className="material-icons">description</span>
          <h3>No deals found</h3>
          <p>Start by creating your first deal</p>
          <Link to="/deals/new" className="btn-primary">Create Deal</Link>
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
                <th>Products</th>
                <th>Profit</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDeals.map(deal => (
                <tr key={deal.id}>
                  <td>{deal.customer}</td>
                  <td>{formatVehicle(deal.vehicle)}</td>
                  <td>{formatDate(deal.date)}</td>
                  <td>{deal.lenderId}</td>
                  <td>
                    {Array.isArray(deal.products) 
                      ? deal.products.join(', ') 
                      : (typeof deal.products === 'string' ? deal.products : '')}
                  </td>
                  <td className="profit">${deal.profit}</td>
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