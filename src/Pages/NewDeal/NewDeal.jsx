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
  const [backEndProfit, setBackEndProfit] = useState('');
  const [products, setProducts] = useState({
    warranty: { selected: false, price: '' },
    gap: { selected: false, price: '' },
    paintProtection: { selected: false, price: '' },
    tireWheel: { selected: false, price: '' },
    keyReplacement: { selected: false, price: '' },
    maintenance: { selected: false, price: '' }
  });
  const [notes, setNotes] = useState('');
  
  // Product selection state
  const availableProducts = [
    { id: 'warranty', name: 'Extended Warranty', value: true },
    { id: 'gap', name: 'GAP Insurance', value: false },
    { id: 'protection', name: 'Paint Protection', value: false },
    { id: 'maintenance', name: 'Maintenance Plan', value: false },
    { id: 'roadside', name: 'Roadside Assistance', value: false }
  ];
  
  const [selectedProducts, setSelectedProducts] = useState(
    availableProducts.reduce((acc, product) => ({
      ...acc,
      [product.id]: product.value
    }), {})
  );
  
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
  
  const handleProductChange = (productId) => {
    setSelectedProducts(prev => ({
      ...prev,
      [productId]: !prev[productId]
    }));
  };
  
  const calculateTotalProducts = () => {
    return Object.values(products).reduce((total, product) => {
      return total + (product.selected && product.price ? parseFloat(product.price) : 0);
    }, 0);
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    try {
      // Format date as Firestore timestamp if needed
      const formattedDate = new Date();
      
      // Get selected products as array
      const selectedProductsList = Object.entries(selectedProducts)
        .filter(([_, selected]) => selected)
        .map(([id, _]) => {
          return availableProducts.find(p => p.id === id).name;
        });
      
      // Prepare deal data
      const dealData = {
        customer: customerName,
        vehicle: {
          year: vehicleYear,
          model: vehicleModel,
          vin: vehicleVin
        },
        date: formattedDate,
        lenderId: selectedLender,
        products: selectedProductsList,
        profit: Number(backEndProfit), // Convert to number
        notes: notes,
        userId: currentUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
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
            <div className="form-group">
              <label htmlFor="backEndProfit">Back-end Profit ($)</label>
              <input
                id="backEndProfit"
                type="number"
                step="0.01"
                min="0"
                value={backEndProfit}
                onChange={(e) => setBackEndProfit(e.target.value)}
                required
              />
            </div>
          </div>
          
          <div className="form-section">
            <h2>Products Sold</h2>
            <div className="products-grid">
              {availableProducts.map(product => (
                <div key={product.id} className="product-item">
                  <input
                    type="checkbox"
                    id={product.id}
                    checked={selectedProducts[product.id]}
                    onChange={() => handleProductChange(product.id)}
                  />
                  <label htmlFor={product.id}>{product.name}</label>
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