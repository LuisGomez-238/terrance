import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { doc, getDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../AuthContext';
import { useLoading } from '../../contexts/LoadingContext';
import { getLenders } from '../../services/lenderService';
import './DealDetails.scss';
import { differenceInDays } from 'date-fns';

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
    { id: 'maintenance', name: 'Maintenance Plan' },
    { id: 'theftCode', name: 'Theft Code' },
    { id: 'vsc', name: 'VSC (Vehicle Service Contract)' },
    { id: 'finishingTouch', name: 'Finishing Touch' },
    { id: 'karrSecurity', name: 'KARR Security' },
    { id: 'karrGuard', name: 'KARR Guard' },
    { id: 'swat', name: 'S.W.A.T' },
    { id: 'lifetimeBattery', name: 'Lifetime Battery' }
  ];
  
  const [formData, setFormData] = useState({
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    vehicleYear: '',
    vehicleModel: '',
    vehicleVin: '',
    lenderId: '',
    loanAmount: '',
    buyRate: '',
    sellRate: '',
    apr: '',
    term: '',
    productData: {},
    notes: '',
    useManualReserve: false,
    manualReserveAmount: '',
    sentToBusinessOffice: null,
    fundedDate: null
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
            loanAmount: dealData.loanAmount || 0,
            productsProfit: dealData.productsProfit || 0,
            financeReserve: dealData.financeReserve || 0,
            totalProfit: dealData.totalProfit || (dealData.productsProfit || 0) + (dealData.financeReserve || 0)
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
          updatedAt: dealData.updatedAt,
          useManualReserve: dealData.useManualReserve || false,
          manualReserveAmount: dealData.manualReserveAmount || 0,
          sentToBusinessOffice: dealData.sentToBusinessOffice || null,
          fundedDate: dealData.fundedDate || null
        };
        
        setDeal(formattedDeal);
        
        const productsObj = {};
        availableProducts.forEach(product => {
          productsObj[product.id] = { 
            selected: false, 
            price: '', 
            cost: '' 
          };
        });
        
        formattedDeal.products.forEach(product => {
          if (product && product.id) {
            productsObj[product.id] = {
              selected: true,
              price: (product.soldPrice || product.price || 0).toString(),
              cost: (product.cost || 0).toString()
            };
          } else if (product && product.type) {
            const matchingProduct = availableProducts.find(p => 
              p.id.toLowerCase() === product.type.toLowerCase() ||
              p.name.toLowerCase().includes(product.type.toLowerCase())
            );
            
            if (matchingProduct) {
              productsObj[matchingProduct.id] = {
                selected: true,
                price: (product.soldPrice || product.price || 0).toString(),
                cost: (product.cost || 0).toString()
              };
            }
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
          loanAmount: formattedDeal.deal.loanAmount?.toString() || '',
          buyRate: formattedDeal.deal.buyRate?.toString() || '',
          sellRate: formattedDeal.deal.sellRate?.toString() || '',
          apr: formattedDeal.deal.apr.toString(),
          term: formattedDeal.deal.term.toString(),
          productData: productsObj,
          notes: formattedDeal.notes,
          useManualReserve: dealData.useManualReserve || false,
          manualReserveAmount: dealData.manualReserveAmount?.toString() || '',
          sentToBusinessOffice: formattedDeal.sentToBusinessOffice || null,
          fundedDate: formattedDeal.fundedDate || null
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
  
  const calculateFinanceReserve = (deal, useFormValues = false) => {
    if (useFormValues) {
      if (formData.useManualReserve && formData.manualReserveAmount) {
        return parseFloat(formData.manualReserveAmount) || 0;
      }
      
      const buyRate = parseFloat(formData.buyRate) || 0;
      const sellRate = parseFloat(formData.sellRate) || 0;
      const loanAmount = parseFloat(formData.loanAmount) || 0;
      const loanTerm = parseInt(formData.term) || 0;
      
      if (loanAmount && loanTerm && sellRate >= buyRate) {
        const rateSpread = sellRate - buyRate;
        const reservePercentage = rateSpread * 2;
        
        const cappedReservePercentage = Math.min(reservePercentage, 5);
        return (loanAmount * (cappedReservePercentage / 100));
      }
      
      return 0;
    }
    
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
    if (!deal) return 0;
    
    let productsProfit = 0;
    
    if (deal.products && Array.isArray(deal.products)) {
      productsProfit = deal.products.reduce((sum, product) => {
        if (typeof product === 'object' && product !== null) {
          const profit = parseFloat(product.profit || 0);
          return sum + profit;
        }
        return sum;
      }, 0);
    }
    
    const financeReserve = calculateFinanceReserve(deal);
    
    console.log('Profit calculation:', {
      productsProfit,
      financeReserve,
      total: productsProfit + financeReserve
    });
    
    return productsProfit + financeReserve;
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
          const productInfo = availableProducts.find(p => p.id === key);
          const soldPrice = parseFloat(product.price) || 0;
          const cost = parseFloat(product.cost) || 0;
          const profit = soldPrice - cost;
          
          return {
            id: key,
            name: productInfo?.name || key,
            soldPrice: soldPrice,
            cost: cost,
            profit: profit
          };
        });
      
      const productsProfit = calculateTotalProductsProfit();
      
      const financeReserve = calculateFinanceReserve(null, true);
      
      const totalProfit = productsProfit + financeReserve;
      
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
        loanAmount: parseFloat(formData.loanAmount) || 0,
        buyRate: parseFloat(formData.buyRate) || 0,
        sellRate: parseFloat(formData.sellRate) || 0,
        apr: parseFloat(formData.apr) || 0,
        term: parseInt(formData.term) || 0,
        productsProfit: productsProfit,
        financeReserve: financeReserve,
        totalProfit: totalProfit,
        profit: totalProfit,
        products: selectedProducts,
        notes: formData.notes,
        useManualReserve: formData.useManualReserve,
        manualReserveAmount: formData.useManualReserve ? parseFloat(formData.manualReserveAmount) || 0 : null,
        sentToBusinessOffice: formData.sentToBusinessOffice,
        fundedDate: formData.fundedDate,
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
          buyRate: formData.buyRate,
          sellRate: formData.sellRate,
          apr: formData.apr,
          term: formData.term,
          loanAmount: parseFloat(formData.loanAmount) || 0,
          productsProfit: productsProfit,
          financeReserve: financeReserve,
          totalProfit: totalProfit
        },
        products: selectedProducts,
        notes: formData.notes,
        useManualReserve: formData.useManualReserve,
        manualReserveAmount: formData.useManualReserve ? parseFloat(formData.manualReserveAmount) || 0 : null,
        sentToBusinessOffice: formData.sentToBusinessOffice,
        fundedDate: formData.fundedDate,
        updatedAt: new Date()
      };
      
      setDeal(updatedFormattedDeal);
      setEditMode(false);
      
      navigate(`/deals?edited=${dealId}&t=${Date.now()}`);
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
          {editMode ? (
            <Link to="/deals" className="back-link">← Back to Deals</Link>
          ) : (
            <Link to={deal.updatedAt && deal.updatedAt instanceof Date && Date.now() - deal.updatedAt.getTime() < 60000 
              ? `/deals?edited=${dealId}&t=${Date.now()}`
              : "/deals"} 
              className="back-link">
              ← Back to Deals
            </Link>
          )}
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
                <label htmlFor="loanAmount">Loan Amount ($)</label>
                <input
                  id="loanAmount"
                  name="loanAmount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.loanAmount}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="buyRate">Buy Rate (%)</label>
                <input
                  id="buyRate"
                  name="buyRate"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.buyRate}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="sellRate">Sell Rate (%)</label>
                <input
                  id="sellRate"
                  name="sellRate"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.sellRate}
                  onChange={handleInputChange}
                  required
                />
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
                <label>Products Profit</label>
                <div className="profit-display">${calculateTotalProductsProfit().toFixed(2)}</div>
              </div>
              <div className="form-group calculated-reserve">
                <label>Finance Reserve (calculated)</label>
                <div className="profit-display">
                  ${calculateFinanceReserve(null, true).toFixed(2)}
                </div>
              </div>
              <div className="form-group calculated-total">
                <label>Total Profit (calculated)</label>
                <div className="profit-display">
                  ${(calculateTotalProductsProfit() + calculateFinanceReserve(null, true)).toFixed(2)}
                </div>
              </div>
            </div>
            
            <div className="form-section">
              <h2>Products Sold</h2>
              <div className="product-table">
                <table>
                  <thead>
                    <tr>
                      <th>Select</th>
                      <th>Product</th>
                      <th>Sold Price ($)</th>
                      <th>Cost ($)</th>
                      <th>Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {availableProducts.map(product => (
                      <tr key={product.id} className={formData.productData[product.id]?.selected ? "selected-product" : ""}>
                        <td>
                          <input
                            type="checkbox"
                            id={`select-${product.id}`}
                            checked={formData.productData[product.id]?.selected || false}
                            onChange={(e) => handleProductDataChange(product.id, 'selected', e.target.checked)}
                          />
                        </td>
                        <td>
                          <label htmlFor={`select-${product.id}`}>{product.name}</label>
                        </td>
                        <td>
                          <input
                            type="number"
                            id={`price-${product.id}`}
                            value={formData.productData[product.id]?.price || ''}
                            onChange={(e) => handleProductDataChange(product.id, 'price', e.target.value)}
                            placeholder="0.00"
                            step="0.01"
                            min="0"
                            disabled={!formData.productData[product.id]?.selected}
                            className="product-price"
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            id={`cost-${product.id}`}
                            value={formData.productData[product.id]?.cost || ''}
                            onChange={(e) => handleProductDataChange(product.id, 'cost', e.target.value)}
                            placeholder="0.00"
                            step="0.01"
                            min="0"
                            disabled={!formData.productData[product.id]?.selected}
                            className="product-cost"
                          />
                        </td>
                        <td className="profit-column">
                          ${formData.productData[product.id]?.selected ? 
                            ((parseFloat(formData.productData[product.id]?.price || 0) - 
                              parseFloat(formData.productData[product.id]?.cost || 0)).toFixed(2)) : 
                            '0.00'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan="2"><strong>Totals</strong></td>
                      <td>
                        <strong>
                          ${Object.entries(formData.productData).reduce((sum, [_, product]) => {
                            if (product.selected) {
                              return sum + (parseFloat(product.price) || 0);
                            }
                            return sum;
                          }, 0).toFixed(2)}
                        </strong>
                      </td>
                      <td>
                        <strong>
                          ${Object.entries(formData.productData).reduce((sum, [_, product]) => {
                            if (product.selected) {
                              return sum + (parseFloat(product.cost) || 0);
                            }
                            return sum;
                          }, 0).toFixed(2)}
                        </strong>
                      </td>
                      <td>
                        <strong>${calculateTotalProductsProfit().toFixed(2)}</strong>
                      </td>
                    </tr>
                  </tfoot>
                </table>
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
          
          <div className="form-section finance-reserve-section">
            <h3>Finance Reserve</h3>
            
            <div className="calculated-reserve">
              <strong>Calculated Reserve:</strong> 
              ${calculateFinanceReserve(null, true).toFixed(2)}
              <div className="reserve-info">
                <small>
                  Based on ${formData.loanAmount || 0} loan amount with 
                  {parseFloat(formData.sellRate || 0) - parseFloat(formData.buyRate || 0)}% rate spread
                </small>
              </div>
            </div>
            
            <div className="manual-reserve-toggle">
              <input
                type="checkbox"
                id="useManualReserve"
                checked={formData.useManualReserve}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  useManualReserve: e.target.checked
                }))}
              />
              <label htmlFor="useManualReserve">Use Manual Reserve Amount</label>
            </div>
            
            {formData.useManualReserve && (
              <div className="form-group">
                <label htmlFor="manualReserveAmount">Manual Reserve Amount ($)</label>
                <input
                  id="manualReserveAmount"
                  name="manualReserveAmount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.manualReserveAmount}
                  onChange={handleInputChange}
                  placeholder="Enter reserve amount"
                />
                <div className="field-help">
                  <small>This will override the calculated reserve amount</small>
                </div>
              </div>
            )}
            
            <div className="form-group calculated-total">
              <label>Total Profit (including reserve)</label>
              <div className="profit-display">
                ${(calculateTotalProductsProfit() + calculateFinanceReserve(null, true)).toFixed(2)}
              </div>
            </div>
          </div>
          
          <div className="form-section funding-section">
            <h2>Funding Information</h2>
            <div className="form-group">
              <label htmlFor="sentToBusinessOffice">Sent to Business Office</label>
              <div className="date-control">
                <input
                  id="sentToBusinessOffice"
                  type="date"
                  value={formData.sentToBusinessOffice ? new Date(formData.sentToBusinessOffice.seconds * 1000).toISOString().split('T')[0] : ''}
                  onChange={(e) => {
                    setFormData(prev => ({
                      ...prev,
                      sentToBusinessOffice: e.target.value ? new Date(e.target.value) : null
                    }));
                  }}
                />
                {!formData.sentToBusinessOffice && (
                  <button
                    type="button"
                    className="date-btn mark-sent-btn"
                    onClick={() => {
                      setFormData(prev => ({
                        ...prev,
                        sentToBusinessOffice: new Date()
                      }));
                    }}
                  >
                    Mark as Sent Today
                  </button>
                )}
                {formData.sentToBusinessOffice && (
                  <button
                    type="button"
                    className="date-btn unmark-sent-btn"
                    onClick={() => {
                      setFormData(prev => ({
                        ...prev,
                        sentToBusinessOffice: null,
                        fundedDate: null // Also clear funded date since it depends on sent date
                      }));
                    }}
                  >
                    Clear Date
                  </button>
                )}
              </div>
            </div>
            
            <div className="form-group">
              <label htmlFor="fundedDate">Funded Date</label>
              <div className="date-control">
                <input
                  id="fundedDate"
                  type="date"
                  value={formData.fundedDate ? new Date(formData.fundedDate.seconds * 1000).toISOString().split('T')[0] : ''}
                  onChange={(e) => {
                    setFormData(prev => ({
                      ...prev,
                      fundedDate: e.target.value ? new Date(e.target.value) : null
                    }));
                  }}
                  disabled={!formData.sentToBusinessOffice}
                />
                {formData.sentToBusinessOffice && !formData.fundedDate && (
                  <button
                    type="button"
                    className="date-btn mark-funded-btn"
                    onClick={() => {
                      setFormData(prev => ({
                        ...prev,
                        fundedDate: new Date()
                      }));
                    }}
                  >
                    Mark as Funded Today
                  </button>
                )}
                {formData.fundedDate && (
                  <button
                    type="button"
                    className="date-btn unmark-funded-btn"
                    onClick={() => {
                      setFormData(prev => ({
                        ...prev,
                        fundedDate: null
                      }));
                    }}
                  >
                    Unmark as Funded
                  </button>
                )}
              </div>
              {!formData.sentToBusinessOffice && (
                <div className="field-help">
                  <small>Deal must be sent to business office before it can be marked as funded</small>
                </div>
              )}
            </div>
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
                <span className="detail-value">${deal.deal.productsProfit}</span>
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
              <span className="value">
                ${deal.products && Array.isArray(deal.products) 
                  ? deal.products.reduce((sum, p) => sum + (typeof p === 'object' ? (parseFloat(p.profit || 0)) : 0), 0).toFixed(2)
                  : '0.00'}
              </span>
            </div>
            <div className="breakdown-item">
              <span className="label">Finance Reserve:</span>
              <span className="value">
                ${calculateFinanceReserve(deal).toFixed(2)}
                {deal.useManualReserve && <span className="manual-indicator"> (Manual)</span>}
              </span>
            </div>
            <div className="breakdown-item total">
              <span className="label">Total Profit:</span>
              <span className="value">${calculateTotalProfit(deal).toFixed(2)}</span>
            </div>
          </div>
          
          <div className="details-section funding-section">
            <h2>Funding Information</h2>
            <div className="detail-item with-actions">
              <span className="detail-label">Sent to Business Office:</span>
              <div className="detail-value-wrapper">
                <span className="detail-value">
                  {deal.sentToBusinessOffice ? 
                    new Date(deal.sentToBusinessOffice.seconds * 1000).toLocaleDateString() : 
                    'Not yet sent'}
                </span>
                
                <div className="inline-edit-actions">
                  {deal.sentToBusinessOffice ? (
                    <>
                      <button
                        className="edit-date-btn"
                        onClick={() => {
                          const newDate = prompt(
                            'Enter new date (MM/DD/YYYY):',
                            new Date(deal.sentToBusinessOffice.seconds * 1000).toLocaleDateString()
                          );
                          if (newDate) {
                            try {
                              const dateObj = new Date(newDate);
                              if (!isNaN(dateObj.getTime())) {
                                showLoading("Updating date...");
                                const dealRef = doc(db, 'deals', dealId);
                                updateDoc(dealRef, {
                                  sentToBusinessOffice: dateObj
                                }).then(() => {
                                  setDeal({...deal, sentToBusinessOffice: {seconds: dateObj.getTime() / 1000, nanoseconds: 0}});
                                  hideLoading();
                                }).catch(err => {
                                  console.error("Error updating date:", err);
                                  setError("Failed to update date");
                                  hideLoading();
                                });
                              } else {
                                alert("Invalid date format. Please use MM/DD/YYYY format.");
                              }
                            } catch (e) {
                              alert("Invalid date. Please use MM/DD/YYYY format.");
                            }
                          }
                        }}
                        title="Edit date"
                      >
                        <span className="material-icons">edit</span>
                      </button>
                      
                      <button
                        className="clear-date-btn"
                        onClick={async () => {
                          if (window.confirm('Are you sure you want to clear the "Sent to Business Office" date? This will also clear the funded date if set.')) {
                            try {
                              showLoading("Updating deal...");
                              const dealRef = doc(db, 'deals', dealId);
                              const updateData = { sentToBusinessOffice: null };
                              
                              // If there's a funded date, also clear it as it depends on sent date
                              if (deal.fundedDate) {
                                updateData.fundedDate = null;
                              }
                              
                              await updateDoc(dealRef, updateData);
                              
                              const updatedDeal = {...deal, sentToBusinessOffice: null};
                              if (deal.fundedDate) {
                                updatedDeal.fundedDate = null;
                              }
                              
                              setDeal(updatedDeal);
                              hideLoading();
                            } catch (error) {
                              console.error("Error updating deal:", error);
                              setError("Failed to update deal status");
                              hideLoading();
                            }
                          }
                        }}
                        title="Clear date"
                      >
                        <span className="material-icons">clear</span>
                      </button>
                    </>
                  ) : (
                    <button
                      className="action-btn mark-sent-btn compact"
                      onClick={async () => {
                        if (window.confirm('Mark this deal as sent to business office today?')) {
                          try {
                            showLoading("Updating deal...");
                            const dealRef = doc(db, 'deals', dealId);
                            await updateDoc(dealRef, {
                              sentToBusinessOffice: new Date()
                            });
                            
                            const updatedDeal = {
                              ...deal, 
                              sentToBusinessOffice: {
                                seconds: Math.floor(Date.now() / 1000),
                                nanoseconds: 0
                              }
                            };
                            setDeal(updatedDeal);
                            hideLoading();
                          } catch (error) {
                            console.error("Error updating deal:", error);
                            setError("Failed to update deal status");
                            hideLoading();
                          }
                        }
                      }}
                    >
                      <span className="material-icons">send</span>
                      Mark as Sent Today
                    </button>
                  )}
                </div>
              </div>
            </div>
            
            <div className="detail-item">
              <span className="detail-label">Funded:</span>
              <span className="detail-value">
                {deal.fundedDate ? 
                  new Date(deal.fundedDate.seconds * 1000).toLocaleDateString() : 
                  'Not yet funded'}
              </span>
            </div>
            
            {!deal.sentToBusinessOffice && (
              <button
                className="action-btn mark-sent-btn"
                onClick={async () => {
                  if (window.confirm('Mark this deal as sent to business office today?')) {
                    try {
                      showLoading("Updating deal...");
                      const dealRef = doc(db, 'deals', dealId);
                      await updateDoc(dealRef, {
                        sentToBusinessOffice: new Date()
                      });
                      
                      const updatedDeal = {
                        ...deal, 
                        sentToBusinessOffice: {
                          seconds: Math.floor(Date.now() / 1000),
                          nanoseconds: 0
                        }
                      };
                      setDeal(updatedDeal);
                      hideLoading();
                    } catch (error) {
                      console.error("Error updating deal:", error);
                      setError("Failed to update deal status");
                      hideLoading();
                    }
                  }
                }}
              >
                <span className="material-icons">send</span>
                Mark as Sent to Business Office
              </button>
            )}
            
            {deal.sentToBusinessOffice && !deal.fundedDate && (
              <button
                className="action-btn mark-funded-btn"
                onClick={async () => {
                  if (window.confirm('Mark this deal as funded today?')) {
                    try {
                      showLoading("Updating deal...");
                      const dealRef = doc(db, 'deals', dealId);
                      await updateDoc(dealRef, {
                        fundedDate: new Date()
                      });
                      
                      const updatedDeal = {
                        ...deal, 
                        fundedDate: {
                          seconds: Math.floor(Date.now() / 1000),
                          nanoseconds: 0
                        }
                      };
                      setDeal(updatedDeal);
                      hideLoading();
                    } catch (error) {
                      console.error("Error updating deal:", error);
                      setError("Failed to update deal status");
                      hideLoading();
                    }
                  }
                }}
              >
                <span className="material-icons">paid</span>
                Mark as Funded
              </button>
            )}
            
            {deal.fundedDate && (
              <button
                className="action-btn unmark-funded-btn"
                onClick={async () => {
                  if (window.confirm('Are you sure you want to unmark this deal as funded?')) {
                    try {
                      showLoading("Updating deal...");
                      const dealRef = doc(db, 'deals', dealId);
                      await updateDoc(dealRef, {
                        fundedDate: null
                      });
                      
                      const updatedDeal = {...deal, fundedDate: null};
                      setDeal(updatedDeal);
                      hideLoading();
                    } catch (error) {
                      console.error("Error updating deal:", error);
                      setError("Failed to update deal status");
                      hideLoading();
                    }
                  }
                }}
              >
                <span className="material-icons">money_off</span>
                Unmark as Funded
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default DealDetails; 