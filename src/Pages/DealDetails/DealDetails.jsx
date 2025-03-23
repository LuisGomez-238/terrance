import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { doc, getDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../AuthContext';
import { useLoading } from '../../contexts/LoadingContext';
import { getLenders } from '../../services/lenderService';
import './DealDetails.scss';

function DealDetails() {
  const { dealId } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [deal, setDeal] = useState(null);
  const [error, setError] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [lenders, setLenders] = useState([]);
  const { showLoading, hideLoading } = useLoading();
  const [dataLoaded, setDataLoaded] = useState(false);
  
  const availableProducts = [
    { id: 'warranty', name: 'Extended Warranty' },
    { id: 'gap', name: 'GAP Insurance' },
    { id: 'paintProtection', name: 'Paint Protection' },
    { id: 'tireWheel', name: 'Tire & Wheel Protection' },
    { id: 'keyReplacement', name: 'Key Replacement' },
    { id: 'maintenance', name: 'Maintenance Plan' }
  ];
  
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
    productData: {},
    notes: ''
  });
  
  useEffect(() => {
    const fetchData = async () => {
      if (!dealId || !currentUser) return;
      
      try {
        showLoading("Loading deal details...");
        setError(null);
        
        const dealDocRef = doc(db, 'deals', dealId);
        const dealSnapshot = await getDoc(dealDocRef);
        
        if (!dealSnapshot.exists()) {
          setError('Deal not found');
          hideLoading();
          return;
        }
        
        const dealData = dealSnapshot.data();
        
        if (dealData.userId !== currentUser.uid) {
          setError('You do not have permission to view this deal');
          hideLoading();
          return;
        }
        
        const lendersData = await getLenders();
        setLenders(lendersData);
        
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
            buyRate: dealData.buyRate || 0,
            sellRate: dealData.sellRate || 0,
            apr: dealData.apr || 0,
            term: dealData.term || 0,
            backEndProfit: dealData.profit || 0,
            loanAmount: dealData.loanAmount || 0
          },
          products: Array.isArray(dealData.products) ? 
            dealData.products.map(p => {
              if (typeof p === 'string') {
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
          productData: productsObj,
          notes: formattedDeal.notes
        });
        
        setDataLoaded(true);
      } catch (err) {
        console.error('Error fetching deal details:', err);
        setError('Failed to load deal details. Please try again.');
      } finally {
        hideLoading();
      }
    };
    
    fetchData();
  }, [dealId, currentUser]);
  
  const calculateFinanceReserve = (deal) => {
    if (typeof deal === 'object' && deal !== null) {
      if (deal.useManualReserve && deal.manualReserveAmount) {
        return parseFloat(deal.manualReserveAmount);
      }
      
      const buyRate = parseFloat(deal.buyRate || (deal.deal && deal.deal.buyRate) || 0);
      const sellRate = parseFloat(deal.sellRate || (deal.deal && deal.deal.sellRate) || 0);
      const loanAmount = parseFloat(deal.loanAmount || (deal.deal && deal.deal.loanAmount) || 0);
      const loanTerm = parseInt(deal.loanTerm || (deal.deal && deal.deal.term) || 0);
      
      if (loanAmount && loanTerm && sellRate >= buyRate) {
        const rateSpread = sellRate - buyRate;
        const reservePercentage = rateSpread * 2;
        
        const cappedReservePercentage = Math.min(reservePercentage, 5);
        return (loanAmount * (cappedReservePercentage / 100));
      }
    }
    
    return 0;
  };

  const calculateTotalProfit = (deal) => {
    let productsProfit = 0;
    
    if (deal && deal.products && Array.isArray(deal.products)) {
      productsProfit = deal.products.reduce((sum, product) => {
        if (typeof product === 'object' && product !== null) {
          const sold = parseFloat(product.soldPrice || product.price || 0);
          const cost = parseFloat(product.cost || 0);
          
          if (sold && cost) {
            return sum + (sold - cost);
          }
          
          if (typeof product.profit === 'number' || (typeof product.profit === 'string' && !isNaN(parseFloat(product.profit)))) {
            return sum + parseFloat(product.profit);
          }
        }
        return sum;
      }, 0);
    }
    
    const financeReserve = calculateFinanceReserve(deal);
    
    const additionalProfit = parseFloat(
      (deal.backEndProfit || deal.profit || (deal.deal && deal.deal.backEndProfit) || 0)
    );
    
    return productsProfit + financeReserve + additionalProfit;
  };
  
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  const handleProductDataChange = (productId, field, value) => {
    setFormData(prev => ({
      ...prev,
      productData: {
        ...prev.productData,
        [productId]: {
          ...prev.productData[productId],
          [field]: value
        }
      }
    }));
  };
  
  const calculateTotalProductsProfit = () => {
    let totalProfit = 0;
    
    Object.keys(formData.productData).forEach(productId => {
      const product = formData.productData[productId];
      if (product.selected) {
        const soldPrice = parseFloat(product.price) || 0;
        const cost = parseFloat(product.cost) || 0;
        totalProfit += (soldPrice - cost);
      }
    });
    
    return totalProfit;
  };
  
  const handleUpdate = async (e) => {
    e.preventDefault();
    showLoading("Saving deal...");
    
    try {
      const selectedProducts = Object.entries(formData.productData)
        .filter(([_, product]) => product.selected)
        .map(([key, product]) => {
          const soldPrice = parseFloat(product.price) || 0;
          const cost = parseFloat(product.cost) || 0;
          
          return {
            id: key,
            name: availableProducts.find(p => p.id === key)?.name || key,
            soldPrice: soldPrice,
            cost: cost,
            profit: soldPrice - cost
          };
        });
      
      const totalProfit = calculateTotalProductsProfit();
      
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
        profit: totalProfit,
        products: selectedProducts,
        notes: formData.notes,
        updatedAt: serverTimestamp()
      };
      
      await updateDoc(doc(db, 'deals', dealId), updateData);
      console.log('Deal updated successfully');
      
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
          backEndProfit: totalProfit
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
      hideLoading();
    }
  };
  
  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this deal?')) return;
    
    showLoading("Deleting deal...");
    try {
      await deleteDoc(doc(db, 'deals', dealId));
      console.log('Deal deleted successfully');
      
      hideLoading();
      navigate('/deals');
    } catch (error) {
      console.error('Error deleting deal:', error);
      setError('Failed to delete deal. Please try again.');
      hideLoading();
    }
  };
  
  if (!dataLoaded && !error) {
    return null;
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
              >
                Cancel
              </button>
              <button 
                className="save-btn"
                onClick={handleUpdate}
              >
                Save Changes
              </button>
            </>
          ) : (
            <>
              <button 
                className="delete-btn"
                onClick={handleDelete}
              >
                Delete
              </button>
              <button 
                className="edit-btn"
                onClick={() => setEditMode(true)}
              >
                Edit
              </button>
            </>
          )}
        </div>
      </div>
      
      {editMode ? (
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
              <div className="form-group calculated-profit">
                <label>Backend Profit (calculated)</label>
                <div className="profit-display">${calculateTotalProductsProfit().toFixed(2)}</div>
              </div>
            </div>
            
            <div className="form-section">
              <h2>Products Sold</h2>
              <div className="products-list">
                {Object.entries(formData.productData).map(([key, product]) => (
                  <div className="product-item" key={key}>
                    <input
                      type="checkbox"
                      id={key}
                      checked={product.selected}
                      onChange={(e) => handleProductDataChange(key, 'selected', e.target.checked)}
                    />
                    <label htmlFor={key}>
                      {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                    </label>
                    <input
                      type="number"
                      placeholder="$"
                      value={product.price}
                      onChange={(e) => handleProductDataChange(key, 'price', e.target.value)}
                      disabled={!product.selected}
                      className="product-price"
                    />
                  </div>
                ))}
              </div>
              
              <div className="products-total">
                Total Products: ${calculateTotalProductsProfit().toFixed(2)}
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
                <div className="products-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Sold Price</th>
                        <th>Cost</th>
                        <th>Profit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deal.products.map((product, index) => (
                        <tr key={index}>
                          <td>
                            {typeof product === 'string' 
                              ? product 
                              : (product.name || 'Unknown Product')}
                          </td>
                          <td>
                            ${typeof product === 'object' 
                              ? (parseFloat(product.soldPrice || product.price || 0).toFixed(2))
                              : '0.00'}
                          </td>
                          <td>
                            ${typeof product === 'object' 
                              ? (parseFloat(product.cost || 0).toFixed(2))
                              : '0.00'}
                          </td>
                          <td className="profit-column">
                            ${typeof product === 'object' 
                              ? (parseFloat(product.profit || 0).toFixed(2))
                              : '0.00'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td><strong>Total</strong></td>
                        <td>
                          <strong>
                            ${deal.products.reduce((sum, p) => 
                              sum + (typeof p === 'object' ? (parseFloat(p.soldPrice || p.price || 0)) : 0), 0).toFixed(2)}
                          </strong>
                        </td>
                        <td>
                          <strong>
                            ${deal.products.reduce((sum, p) => 
                              sum + (typeof p === 'object' ? (parseFloat(p.cost || 0)) : 0), 0).toFixed(2)}
                          </strong>
                        </td>
                        <td className="profit-column">
                          <strong>
                            ${deal.products.reduce((sum, p) => 
                              sum + (typeof p === 'object' ? (parseFloat(p.profit || 0)) : 0), 0).toFixed(2)}
                          </strong>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
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
          
          <div className="profit-breakdown">
            <h3>Profit Breakdown</h3>
            <div className="breakdown-item">
              <span className="label">Product Profit:</span>
              <span className="value">${calculateTotalProductsProfit().toFixed(2)}</span>
            </div>
            <div className="breakdown-item">
              <span className="label">Finance Reserve:</span>
              <span className="value">${calculateFinanceReserve(deal).toFixed(2)}</span>
            </div>
            <div className="breakdown-item">
              <span className="label">Additional Profit:</span>
              <span className="value">${parseFloat(deal.deal.backEndProfit || deal.deal.profit || 0).toFixed(2)}</span>
            </div>
            <div className="breakdown-item total">
              <span className="label">Total Profit:</span>
              <span className="value">${calculateTotalProfit(deal).toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DealDetails; 