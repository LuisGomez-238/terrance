import React, { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../AuthContext';
import { getLenders } from '../../services/lenderService';
import './NewDeal.scss';

function NewDeal() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [lenders, setLenders] = useState([]);
  const [error, setError] = useState(null);
  
  // Form state
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [vehicleYear, setVehicleYear] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleVin, setVehicleVin] = useState('');
  const [selectedLender, setSelectedLender] = useState('');
  const [apr, setApr] = useState('');
  const [term, setTerm] = useState('');
  const [notes, setNotes] = useState('');
  
  // Updated product list with all specified products
  const availableProducts = [
    { id: 'theftCode', name: 'Theft Code', value: false },
    { id: 'vsc', name: 'VSC (Vehicle Service Contract)', value: false },
    { id: 'gap', name: 'GAP Insurance', value: false },
    { id: 'finishingTouch', name: 'Finishing Touch', value: false },
    { id: 'maintenance', name: 'Maintenance Plan', value: false },
    { id: 'karrSecurity', name: 'KARR Security', value: false },
    { id: 'karrGuard', name: 'KARR Guard', value: false },
    { id: 'swat', name: 'S.W.A.T', value: false },
    { id: 'lifetimeBattery', name: 'Lifetime Battery', value: false }
  ];
  
  // Updated product state to track both price and cost
  const [productData, setProductData] = useState(
    availableProducts.reduce((acc, product) => ({
      ...acc,
      [product.id]: {
        selected: product.value,
        price: '', // Sold for price
        cost: ''   // Cost price
      }
    }), {})
  );
  
  // Add these new state variables
  const [dateSold, setDateSold] = useState('');
  const [buyRate, setBuyRate] = useState('');
  const [sellRate, setSellRate] = useState('');
  const [loanAmount, setLoanAmount] = useState('');
  const [loanTerm, setLoanTerm] = useState('');
  const [useManualReserve, setUseManualReserve] = useState(false);
  const [manualReserveAmount, setManualReserveAmount] = useState('');
  
  useEffect(() => {
    const fetchLenders = async () => {
      try {
        const lenderData = await getLenders();
        setLenders(lenderData);
      } catch (err) {
        console.error('Error fetching lenders:', err);
        setError('Failed to load lenders. Please try again.');
      }
    };
    
    fetchLenders();
  }, []);
  
  // Function to handle product selection changes
  const handleProductSelectionChange = (productId, selected) => {
    setProductData(prev => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        selected
      }
    }));
  };
  
  // Function to handle product price/cost changes
  const handleProductDataChange = (productId, field, value) => {
    setProductData(prev => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        [field]: value
      }
    }));
  };
  
  // Function to calculate gross profit for a specific product
  const calculateProductProfit = (productId) => {
    const product = productData[productId];
    if (!product.selected) return 0;
    
    const price = parseFloat(product.price) || 0;
    const cost = parseFloat(product.cost) || 0;
    return price - cost;
  };
  
  // Function to calculate total profit from all products
  const calculateTotalProductsProfit = () => {
    let totalProfit = 0;
    
    Object.keys(productData).forEach(productId => {
      const product = productData[productId];
      if (product.selected) {
        const soldPrice = parseFloat(product.price) || 0;
        const cost = parseFloat(product.cost) || 0;
        totalProfit += (soldPrice - cost);
      }
    });
    
    return totalProfit;
  };
  
  // Function to calculate total revenue from products
  const calculateTotalProductsRevenue = () => {
    return Object.keys(productData).reduce((total, productId) => {
      const product = productData[productId];
      if (product.selected && product.price) {
        return total + (parseFloat(product.price) || 0);
      }
      return total;
    }, 0);
  };
  
  // Add this function to calculate finance reserve
  const calculateFinanceReserve = () => {
    // If manual reserve is specified, use that value
    if (useManualReserve && manualReserveAmount) {
      return parseFloat(manualReserveAmount);
    }
    
    // Otherwise calculate based on rates and loan amount
    const buyRateValue = parseFloat(buyRate || 0);
    const sellRateValue = parseFloat(sellRate || 0);
    const loanAmountValue = parseFloat(loanAmount || 0);
    const loanTermValue = parseInt(loanTerm || 0);
    
    if (loanAmountValue && loanTermValue && sellRateValue >= buyRateValue) {
      // Standard formula for reserve calculation
      const rateSpread = sellRateValue - buyRateValue;
      const reservePercentage = rateSpread * 2; // Typical 2:1 ratio
      
      // Cap at 5% maximum reserve
      const cappedReservePercentage = Math.min(reservePercentage, 5);
      return (loanAmountValue * (cappedReservePercentage / 100));
    }
    
    return 0;
  };
  
  // Function to calculate total profit (products + finance reserve)
  const calculateTotalProfit = () => {
    const productsProfit = calculateTotalProductsProfit();
    const financeReserve = calculateFinanceReserve();
    return productsProfit + financeReserve;
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    try {
      // Format the selected products with their price, cost, and profit information
      const selectedProductsList = Object.entries(productData)
        .filter(([_, data]) => data.selected)
        .map(([id, data]) => {
          const productInfo = availableProducts.find(p => p.id === id);
          const soldPrice = parseFloat(data.price) || 0;
          const cost = parseFloat(data.cost) || 0;
          
          return {
            id: id,
            name: productInfo.name,
            soldPrice: soldPrice,
            cost: cost,
            profit: soldPrice - cost
          };
        });
      
      // Calculate total product profit
      const productsProfit = calculateTotalProductsProfit();
      
      // Calculate finance reserve
      const financeReserve = calculateFinanceReserve();
      
      // Calculate total profit
      const totalProfit = productsProfit + financeReserve;
      
      // Create a well-structured deal object
      const dealData = {
        // Customer information
        customer: customerName,
        customerPhone: customerPhone || null,
        customerEmail: customerEmail || null,
        
        // Vehicle information
        vehicle: {
          year: vehicleYear,
          model: vehicleModel,
          vin: vehicleVin || ''
        },
        
        // Deal information
        createdAt: serverTimestamp(),
        dateSold: dateSold ? new Date(dateSold) : new Date(),
        lenderId: selectedLender,
        lenderName: lenders.find(l => l.id === selectedLender)?.name || '',
        
        // Finance information
        buyRate: parseFloat(buyRate) || 0,
        sellRate: parseFloat(sellRate) || 0,
        loanAmount: parseFloat(loanAmount) || 0,
        loanTerm: parseInt(loanTerm) || 0,
        useManualReserve: useManualReserve,
        manualReserveAmount: parseFloat(manualReserveAmount) || 0,
        
        // Products and profit
        products: selectedProductsList,
        productsProfit: productsProfit,
        financeReserve: financeReserve,
        totalProfit: totalProfit,
        
        // Additional information
        notes: notes || '',
        
        // User identification
        userId: currentUser.uid,
      };
      
      console.log('Saving deal with data:', dealData);
      
      // Save to Firestore 
      const dealRef = await addDoc(collection(db, 'deals'), dealData);
      
      console.log('Deal saved successfully with ID:', dealRef.id);
      navigate('/deals');
    } catch (err) {
      console.error('Error saving deal:', err);
      setError('Failed to save deal: ' + err.message);
      setLoading(false);
    }
  };
  
  return (
    <div className="new-deal-container">
      <div className="new-deal-header">
        <h1>New Deal</h1>
        <button 
          className="save-deal-btn"
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? 'Saving...' : 'Save'}
        </button>
      </div>
      
      {error && <div className="error-message">{error}</div>}
      
      <form className="deal-form" onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-section">
            <h2>Customer Information</h2>
            <div className="form-group">
              <label htmlFor="customerName">Name</label>
              <input
                id="customerName"
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="customerPhone">Phone</label>
              <input
                id="customerPhone"
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="customerEmail">Email</label>
              <input
                id="customerEmail"
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
              />
            </div>
          </div>
          
          <div className="form-section">
            <h2>Vehicle Information</h2>
            <div className="form-group">
              <label htmlFor="vehicleYear">Year</label>
              <input
                id="vehicleYear"
                type="text"
                value={vehicleYear}
                onChange={(e) => setVehicleYear(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="vehicleModel">Make/Model</label>
              <input
                id="vehicleModel"
                type="text"
                value={vehicleModel}
                onChange={(e) => setVehicleModel(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="vehicleVin">VIN</label>
              <input
                id="vehicleVin"
                type="text"
                value={vehicleVin}
                onChange={(e) => setVehicleVin(e.target.value)}
              />
            </div>
          </div>
        </div>
        
        <div className="form-row">
          <div className="form-section">
            <h2>Deal Information</h2>
            <div className="form-group">
              <label htmlFor="lender">Lender</label>
              <select
                id="lender"
                value={selectedLender}
                onChange={(e) => setSelectedLender(e.target.value)}
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
                type="number"
                step="0.01"
                min="0"
                value={apr}
                onChange={(e) => setApr(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="term">Term (months)</label>
              <input
                id="term"
                type="number"
                min="1"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                required
              />
            </div>
            <div className="form-group calculated-profit">
              <label>Backend Profit (calculated)</label>
              <div className="profit-display">${calculateTotalProductsProfit().toFixed(2)}</div>
            </div>
          </div>
          
          <div className="form-section">
            <h2>Finance Details</h2>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="dateSold">Date Sold</label>
                <input
                  id="dateSold"
                  type="date"
                  value={dateSold}
                  onChange={(e) => setDateSold(e.target.value)}
                  required
                />
              </div>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="buyRate">Buy Rate (%)</label>
                <input
                  id="buyRate"
                  type="number"
                  step="0.01"
                  min="0"
                  value={buyRate}
                  onChange={(e) => setBuyRate(e.target.value)}
                  placeholder="E.g., 4.99"
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="sellRate">Sell Rate (%)</label>
                <input
                  id="sellRate"
                  type="number"
                  step="0.01"
                  min="0"
                  value={sellRate}
                  onChange={(e) => {
                    setSellRate(e.target.value);
                    // If sell rate is less than buy rate, show warning
                    if (parseFloat(e.target.value) < parseFloat(buyRate)) {
                      setError('Warning: Sell rate is lower than buy rate');
                    } else {
                      setError(null);
                    }
                  }}
                  placeholder="E.g., 5.99"
                />
              </div>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="loanAmount">Loan Amount ($)</label>
                <input
                  id="loanAmount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={loanAmount}
                  onChange={(e) => setLoanAmount(e.target.value)}
                  placeholder="Total amount financed"
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="loanTerm">Loan Term (months)</label>
                <input
                  id="loanTerm"
                  type="number"
                  min="1"
                  value={loanTerm}
                  onChange={(e) => setLoanTerm(e.target.value)}
                  placeholder="E.g., 60, 72"
                />
              </div>
            </div>
            
            {/* Manual Reserve Option */}
            <div className="form-row">
              <div className="form-group checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={useManualReserve}
                    onChange={(e) => setUseManualReserve(e.target.checked)}
                  />
                  Manually enter reserve amount
                </label>
              </div>
            </div>
            
            {useManualReserve && (
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="manualReserveAmount">Reserve Amount ($)</label>
                  <input
                    id="manualReserveAmount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={manualReserveAmount}
                    onChange={(e) => setManualReserveAmount(e.target.value)}
                    placeholder="Enter reserve amount"
                  />
                </div>
              </div>
            )}
            
            <div className="finance-summary">
              <div className="summary-row">
                <span className="label">Finance Reserve:</span>
                <span className="value reserve">${calculateFinanceReserve().toFixed(2)}</span>
              </div>
              <div className="summary-row">
                <span className="label">Product Profit:</span>
                <span className="value">${calculateTotalProductsProfit().toFixed(2)}</span>
              </div>
              <div className="summary-row total">
                <span className="label">Total Profit:</span>
                <span className="value">${calculateTotalProfit().toFixed(2)}</span>
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
                    <tr key={product.id} className={productData[product.id].selected ? "selected-product" : ""}>
                      <td>
                        <input
                          type="checkbox"
                          id={`select-${product.id}`}
                          checked={productData[product.id].selected}
                          onChange={(e) => handleProductSelectionChange(product.id, e.target.checked)}
                        />
                      </td>
                      <td>
                        <label htmlFor={`select-${product.id}`}>{product.name}</label>
                      </td>
                      <td>
                        <input
                          type="number"
                          id={`price-${product.id}`}
                          value={productData[product.id].price}
                          onChange={(e) => handleProductDataChange(product.id, 'price', e.target.value)}
                          placeholder="0.00"
                          step="0.01"
                          min="0"
                          disabled={!productData[product.id].selected}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          id={`cost-${product.id}`}
                          value={productData[product.id].cost}
                          onChange={(e) => handleProductDataChange(product.id, 'cost', e.target.value)}
                          placeholder="0.00"
                          step="0.01"
                          min="0"
                          disabled={!productData[product.id].selected}
                        />
                      </td>
                      <td className="profit-column">
                        ${productData[product.id].selected ? calculateProductProfit(product.id).toFixed(2) : '0.00'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan="2"><strong>Totals</strong></td>
                    <td><strong>${calculateTotalProductsRevenue().toFixed(2)}</strong></td>
                    <td></td>
                    <td><strong>${calculateTotalProductsProfit().toFixed(2)}</strong></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
        
        <div className="form-section notes-section">
          <h2>Notes</h2>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
          ></textarea>
        </div>
      </form>
    </div>
  );
}

export default NewDeal; 