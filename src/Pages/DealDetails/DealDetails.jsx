import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { doc, getDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../AuthContext';
import { getLenders } from '../../services/lenderService';
import './DealDetails.scss';

function DealDetails() {
  const { dealId } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [deal, setDeal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [lenders, setLenders] = useState([]);
  
  // Form state
  const [formData, setFormData] = useState({
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    vehicleYear: '',
    vehicleModel: '',
    vehicleVin: '',
    lenderId: '',
    apr: '',
    term: '',
    backEndProfit: '',
    products: {},
    notes: ''
  });
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Fetch deal data from Firestore
        const dealDocRef = doc(db, 'deals', dealId);
        const dealSnapshot = await getDoc(dealDocRef);
        
        if (!dealSnapshot.exists()) {
          setError('Deal not found');
          setLoading(false);
          return;
        }
        
        const dealData = dealSnapshot.data();
        
        // Check if the deal belongs to the current user
        if (dealData.userId !== currentUser.uid) {
          setError('You do not have permission to view this deal');
          setLoading(false);
          return;
        }
        
        // Fetch lenders
        const lendersData = await getLenders();
        setLenders(lendersData);
        
        // Transform deal data to match our component's format
        const formattedDeal = {
          id: dealId,
          customer: {
            name: dealData.customer || '',
            phone: dealData.customerPhone || '',
            email: dealData.customerEmail || ''
          },
          vehicle: typeof dealData.vehicle === 'object' ? dealData.vehicle : {
            year: '',
            model: '',
            vin: ''
          },
          deal: {
            lenderId: dealData.lenderId || '',
            apr: dealData.apr || 0,
            term: dealData.term || 0,
            backEndProfit: dealData.profit || 0
          },
          products: Array.isArray(dealData.products) ? 
            dealData.products.map(p => {
              if (typeof p === 'string') {
                // Handle case where products might be just strings
                return { type: p.toLowerCase().replace(/\s/g, ''), price: 0 };
              }
              return typeof p === 'object' ? p : { type: 'unknown', price: 0 };
            }) : [],
          notes: dealData.notes || '',
          date: dealData.date || new Date(),
          userId: dealData.userId,
          createdAt: dealData.createdAt,
          updatedAt: dealData.updatedAt
        };
        
        setDeal(formattedDeal);
        
        // Convert products array to object format for form
        const productsObj = {
          warranty: { selected: false, price: '' },
          gap: { selected: false, price: '' },
          paintProtection: { selected: false, price: '' },
          tireWheel: { selected: false, price: '' },
          keyReplacement: { selected: false, price: '' },
          maintenance: { selected: false, price: '' }
        };
        
        formattedDeal.products.forEach(product => {
          if (product && product.type) {
            productsObj[product.type] = {
              selected: true,
              price: (product.price || 0).toString()
            };
          }
        });
        
        setFormData({
          customerName: formattedDeal.customer.name,
          customerPhone: formattedDeal.customer.phone,
          customerEmail: formattedDeal.customer.email,
          vehicleYear: formattedDeal.vehicle.year || '',
          vehicleModel: formattedDeal.vehicle.model || '',
          vehicleVin: formattedDeal.vehicle.vin || '',
          lenderId: formattedDeal.deal.lenderId,
          apr: formattedDeal.deal.apr.toString(),
          term: formattedDeal.deal.term.toString(),
          backEndProfit: formattedDeal.deal.backEndProfit.toString(),
          products: productsObj,
          notes: formattedDeal.notes
        });
        
        setLoading(false);
      } catch (err) {
        console.error('Error fetching deal details:', err);
        setError('Failed to load deal details. Please try again.');
        setLoading(false);
      }
    };
    
    if (dealId && currentUser) {
      fetchData();
    }
  }, [dealId, currentUser]);
  
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  const handleProductChange = (product, isChecked, price = '') => {
    setFormData(prev => ({
      ...prev,
      products: {
        ...prev.products,
        [product]: {
          selected: isChecked,
          price: isChecked ? (price || prev.products[product].price) : ''
        }
      }
    }));
  };
  
  const calculateTotalProducts = () => {
    return Object.values(formData.products).reduce((total, product) => {
      return total + (product.selected && product.price ? parseFloat(product.price) : 0);
    }, 0);
  };
  
  const handleUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      // Construct the updated deal object
      const selectedProducts = Object.entries(formData.products)
        .filter(([_, product]) => product.selected)
        .map(([key, product]) => ({
          type: key,
          price: parseFloat(product.price) || 0
        }));
      
      // Create update object for Firestore
      const updateData = {
        customer: formData.customerName,
        customerPhone: formData.customerPhone,
        customerEmail: formData.customerEmail,
        vehicle: {
          year: formData.vehicleYear,
          model: formData.vehicleModel,
          vin: formData.vehicleVin
        },
        lenderId: formData.lenderId,
        apr: parseFloat(formData.apr) || 0,
        term: parseInt(formData.term) || 0,
        profit: parseFloat(formData.backEndProfit) || 0,
        products: selectedProducts,
        notes: formData.notes,
        updatedAt: serverTimestamp()
      };
      
      // Update deal in Firestore
      await updateDoc(doc(db, 'deals', dealId), updateData);
      console.log('Deal updated successfully');
      
      // Update local state
      const updatedFormattedDeal = {
        ...deal,
        customer: {
          name: formData.customerName,
          phone: formData.customerPhone,
          email: formData.customerEmail
        },
        vehicle: {
          year: formData.vehicleYear,
          model: formData.vehicleModel,
          vin: formData.vehicleVin
        },
        deal: {
          lenderId: formData.lenderId,
          apr: parseFloat(formData.apr) || 0,
          term: parseInt(formData.term) || 0,
          backEndProfit: parseFloat(formData.backEndProfit) || 0
        },
        products: selectedProducts,
        notes: formData.notes,
        updatedAt: new Date()
      };
      
      setDeal(updatedFormattedDeal);
      setEditMode(false);
    } catch (error) {
      console.error('Error updating deal:', error);
      setError('Failed to update deal. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this deal?')) return;
    
    setLoading(true);
    try {
      // Delete deal from Firestore
      await deleteDoc(doc(db, 'deals', dealId));
      console.log('Deal deleted successfully');
      
      navigate('/deals');
    } catch (error) {
      console.error('Error deleting deal:', error);
      setError('Failed to delete deal. Please try again.');
      setLoading(false);
    }
  };
  
  if (loading) {
    return <div className="loading">Loading deal details...</div>;
  }
  
  if (error) {
    return (
      <div className="deal-error">
        <h2>Error</h2>
        <p>{error}</p>
        <Link to="/deals" className="back-link">Back to Deals</Link>
      </div>
    );
  }
  
  if (!deal) {
    return (
      <div className="deal-not-found">
        <h2>Deal not found</h2>
        <Link to="/deals" className="back-link">Back to Deals</Link>
      </div>
    );
  }
  
  return (
    <div className="deal-details-container">
      <div className="deal-details-header">
        <div className="header-left">
          <Link to="/deals" className="back-link">← Back to Deals</Link>
          <h1>{editMode ? 'Edit Deal' : `Deal: ${deal.customer.name}`}</h1>
        </div>
        <div className="header-actions">
          {editMode ? (
            <>
              <button 
                className="cancel-btn"
                onClick={() => setEditMode(false)}
                disabled={loading}
              >
                Cancel
              </button>
              <button 
                className="save-btn"
                onClick={handleUpdate}
                disabled={loading}
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            </>
          ) : (
            <>
              <button 
                className="delete-btn"
                onClick={handleDelete}
                disabled={loading}
              >
                Delete
              </button>
              <button 
                className="edit-btn"
                onClick={() => setEditMode(true)}
                disabled={loading}
              >
                Edit
              </button>
            </>
          )}
        </div>
      </div>
      
      {editMode ? (
        // Edit Form
        <form className="deal-form" onSubmit={handleUpdate}>
          <div className="form-row">
            <div className="form-section">
              <h2>Customer Information</h2>
              <div className="form-group">
                <label htmlFor="customerName">Name</label>
                <input
                  id="customerName"
                  name="customerName"
                  type="text"
                  value={formData.customerName}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="customerPhone">Phone</label>
                <input
                  id="customerPhone"
                  name="customerPhone"
                  type="tel"
                  value={formData.customerPhone}
                  onChange={handleInputChange}
                />
              </div>
              <div className="form-group">
                <label htmlFor="customerEmail">Email</label>
                <input
                  id="customerEmail"
                  name="customerEmail"
                  type="email"
                  value={formData.customerEmail}
                  onChange={handleInputChange}
                />
              </div>
            </div>
            
            <div className="form-section">
              <h2>Vehicle Information</h2>
              <div className="form-group">
                <label htmlFor="vehicleYear">Year</label>
                <input
                  id="vehicleYear"
                  name="vehicleYear"
                  type="text"
                  value={formData.vehicleYear}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="vehicleModel">Make/Model</label>
                <input
                  id="vehicleModel"
                  name="vehicleModel"
                  type="text"
                  value={formData.vehicleModel}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="vehicleVin">VIN</label>
                <input
                  id="vehicleVin"
                  name="vehicleVin"
                  type="text"
                  value={formData.vehicleVin}
                  onChange={handleInputChange}
                />
              </div>
            </div>
          </div>
          
          <div className="form-row">
            <div className="form-section">
              <h2>Deal Information</h2>
              <div className="form-group">
                <label htmlFor="lenderId">Lender</label>
                <select
                  id="lenderId"
                  name="lenderId"
                  value={formData.lenderId}
                  onChange={handleInputChange}
                  required
                >
                  <option value="">Select Lender</option>
                  {lenders.map(lender => (
                    <option key={lender.id} value={lender.id}>
                      {lender.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="apr">APR (%)</label>
                <input
                  id="apr"
                  name="apr"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.apr}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="term">Term (months)</label>
                <input
                  id="term"
                  name="term"
                  type="number"
                  min="1"
                  value={formData.term}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="backEndProfit">Back-end Profit ($)</label>
                <input
                  id="backEndProfit"
                  name="backEndProfit"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.backEndProfit}
                  onChange={handleInputChange}
                  required
                />
              </div>
            </div>
            
            <div className="form-section">
              <h2>Products Sold</h2>
              <div className="products-list">
                {Object.entries(formData.products).map(([key, product]) => (
                  <div className="product-item" key={key}>
                    <input
                      type="checkbox"
                      id={key}
                      checked={product.selected}
                      onChange={(e) => handleProductChange(key, e.target.checked)}
                    />
                    <label htmlFor={key}>
                      {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                    </label>
                    <input
                      type="number"
                      placeholder="$"
                      value={product.price}
                      onChange={(e) => handleProductChange(key, true, e.target.value)}
                      disabled={!product.selected}
                      className="product-price"
                    />
                  </div>
                ))}
              </div>
              
              <div className="products-total">
                Total Products: ${calculateTotalProducts().toFixed(2)}
              </div>
            </div>
          </div>
          
          <div className="form-section notes-section">
            <h2>Notes</h2>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleInputChange}
              rows={4}
            ></textarea>
          </div>
        </form>
      ) : (
        // View Mode
        <div className="deal-details-content">
          <div className="details-row">
            <div className="details-section">
              <h2>Customer Information</h2>
              <div className="detail-item">
                <span className="detail-label">Name:</span>
                <span className="detail-value">{deal.customer.name}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Phone:</span>
                <span className="detail-value">{deal.customer.phone || 'N/A'}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Email:</span>
                <span className="detail-value">{deal.customer.email || 'N/A'}</span>
              </div>
            </div>
            
            <div className="details-section">
              <h2>Vehicle Information</h2>
              <div className="detail-item">
                <span className="detail-label">Year:</span>
                <span className="detail-value">{deal.vehicle.year || 'N/A'}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Make/Model:</span>
                <span className="detail-value">{deal.vehicle.model || 'N/A'}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">VIN:</span>
                <span className="detail-value">{deal.vehicle.vin || 'N/A'}</span>
              </div>
            </div>
          </div>
          
          <div className="details-row">
            <div className="details-section">
              <h2>Deal Information</h2>
              <div className="detail-item">
                <span className="detail-label">Lender:</span>
                <span className="detail-value">
                  {lenders.find(l => l.id === deal.deal.lenderId)?.name || 'N/A'}
                </span>
              </div>
              <div className="detail-item">
                <span className="detail-label">APR:</span>
                <span className="detail-value">{deal.deal.apr}%</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Term:</span>
                <span className="detail-value">{deal.deal.term} months</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Back-end Profit:</span>
                <span className="detail-value">${deal.deal.backEndProfit}</span>
              </div>
            </div>
            
            <div className="details-section">
              <h2>Products Sold</h2>
              {deal.products && deal.products.length > 0 ? (
                <div className="products-list">
                  {deal.products.map((product, index) => (
                    <div className="detail-item" key={index}>
                      <span className="detail-label">
                        {typeof product === 'string' 
                          ? product 
                          : (product.type || '').replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}:
                      </span>
                      <span className="detail-value">
                        {typeof product === 'string' 
                          ? 'N/A' 
                          : `$${product.price || 0}`}
                      </span>
                    </div>
                  ))}
                  <div className="detail-item total-item">
                    <span className="detail-label">Total Products:</span>
                    <span className="detail-value">
                      ${deal.products.reduce((sum, p) => sum + (typeof p === 'object' ? (p.price || 0) : 0), 0)}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="no-products">No products sold</p>
              )}
            </div>
          </div>
          
          <div className="details-section notes-section">
            <h2>Notes</h2>
            <div className="notes-content">
              {deal.notes || 'No notes available'}
            </div>
          </div>
          
          <div className="details-section metadata-section">
            <h2>Deal Metadata</h2>
            <div className="detail-item">
              <span className="detail-label">Created:</span>
              <span className="detail-value">
                {deal.createdAt ? new Date(deal.createdAt.seconds * 1000).toLocaleString() : 'N/A'}
              </span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Last Updated:</span>
              <span className="detail-value">
                {deal.updatedAt ? new Date(deal.updatedAt.seconds * 1000).toLocaleString() : 'N/A'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DealDetails; 