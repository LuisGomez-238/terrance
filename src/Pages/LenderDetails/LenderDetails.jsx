import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import './LenderDetails.scss';

function LenderDetails() {
  const { lenderId } = useParams();
  const navigate = useNavigate();
  const [lender, setLender] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    type: '',
    minScore: '',
    maxLtv: '',
    tiers: [],
    guidelines: ''
  });
  
  useEffect(() => {
    const fetchLenderDetails = async () => {
      try {
        // Mock data - replace with actual Firestore query
        const mockLender = {
          id: lenderId,
          name: 'ABC Bank',
          type: 'Bank',
          minScore: 620,
          maxLtv: 125,
          tiers: [
            { tier: 'A', score: '700+', maxLtv: '125%', apr: '3.99%' },
            { tier: 'B', score: '660+', maxLtv: '120%', apr: '5.49%' },
            { tier: 'C', score: '620+', maxLtv: '110%', apr: '7.99%' }
          ],
          guidelines: `- Must include proof of income for all applicants\n- Accepts electronic signatures\n- Max term 84 months for new, 72 months for used\n- Allows gap insurance to be financed\n- Requires minimum 6 months at current residence`
        };
        
        setLender(mockLender);
        setFormData({
          name: mockLender.name,
          type: mockLender.type,
          minScore: mockLender.minScore.toString(),
          maxLtv: mockLender.maxLtv.toString(),
          tiers: [...mockLender.tiers],
          guidelines: mockLender.guidelines
        });
        
        setLoading(false);
      } catch (error) {
        console.error('Error fetching lender details:', error);
        setLoading(false);
      }
    };
    
    fetchLenderDetails();
  }, [lenderId]);
  
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  const handleTierChange = (index, field, value) => {
    const updatedTiers = [...formData.tiers];
    updatedTiers[index] = {
      ...updatedTiers[index],
      [field]: value
    };
    
    setFormData(prev => ({
      ...prev,
      tiers: updatedTiers
    }));
  };
  
  const addTier = () => {
    setFormData(prev => ({
      ...prev,
      tiers: [
        ...prev.tiers,
        { tier: '', score: '', maxLtv: '', apr: '' }
      ]
    }));
  };
  
  const removeTier = (index) => {
    const updatedTiers = [...formData.tiers];
    updatedTiers.splice(index, 1);
    
    setFormData(prev => ({
      ...prev,
      tiers: updatedTiers
    }));
  };
  
  const handleUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const updatedLender = {
        name: formData.name,
        type: formData.type,
        minScore: parseInt(formData.minScore),
        maxLtv: parseInt(formData.maxLtv),
        tiers: formData.tiers,
        guidelines: formData.guidelines,
        updatedAt: new Date()
      };
      
      // Update lender in Firestore
      // await updateDoc(doc(db, 'lenders', lenderId), updatedLender);
      console.log('Lender updated:', updatedLender);
      
      // Exit edit mode and refresh data
      setEditMode(false);
      setLender(prev => ({
        ...prev,
        ...updatedLender
      }));
    } catch (error) {
      console.error('Error updating lender:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this lender?')) return;
    
    setLoading(true);
    try {
      // Delete lender from Firestore
      // await deleteDoc(doc(db, 'lenders', lenderId));
      console.log('Lender deleted:', lenderId);
      
      navigate('/lenders');
    } catch (error) {
      console.error('Error deleting lender:', error);
      setLoading(false);
    }
  };
  
  if (loading) {
    return <div className="loading">Loading lender details...</div>;
  }
  
  if (!lender) {
    return (
      <div className="lender-not-found">
        <h2>Lender not found</h2>
        <Link to="/lenders" className="back-link">Back to Lenders</Link>
      </div>
    );
  }
  
  return (
    <div className="lender-details-container">
      <div className="lender-details-header">
        <div className="header-left">
          <Link to="/lenders" className="back-link">← Back to Lenders</Link>
          <h1>{editMode ? 'Edit Lender' : `Lender: ${lender.name}`}</h1>
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
        <form className="lender-form" onSubmit={handleUpdate}>
          <div className="form-row">
            <div className="form-section">
              <h2>Basic Information</h2>
              <div className="form-group">
                <label htmlFor="name">Name</label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  value={formData.name}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="type">Type</label>
                <select
                  id="type"
                  name="type"
                  value={formData.type}
                  onChange={handleInputChange}
                  required
                >
                  <option value="">Select Type</option>
                  <option value="Bank">Bank</option>
                  <option value="Credit Union">Credit Union</option>
                  <option value="Captive">Captive</option>
                  <option value="Finance Company">Finance Company</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="minScore">Min Credit Score</label>
                <input
                  id="minScore"
                  name="minScore"
                  type="number"
                  min="300"
                  max="850"
                  value={formData.minScore}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="maxLtv">Max Loan to Value (%)</label>
                <input
                  id="maxLtv"
                  name="maxLtv"
                  type="number"
                  min="0"
                  max="200"
                  value={formData.maxLtv}
                  onChange={handleInputChange}
                  required
                />
              </div>
            </div>
            
            <div className="form-section">
              <h2>Credit Tiers</h2>
              <div className="tiers-table">
                <table>
                  <thead>
                    <tr>
                      <th>Tier</th>
                      <th>Score</th>
                      <th>Max LTV</th>
                      <th>APR</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formData.tiers.map((tier, index) => (
                      <tr key={index}>
                        <td>
                          <input
                            type="text"
                            value={tier.tier}
                            onChange={(e) => handleTierChange(index, 'tier', e.target.value)}
                            placeholder="A, B, C..."
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={tier.score}
                            onChange={(e) => handleTierChange(index, 'score', e.target.value)}
                            placeholder="700+, 650+"
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={tier.maxLtv}
                            onChange={(e) => handleTierChange(index, 'maxLtv', e.target.value)}
                            placeholder="125%, 110%"
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={tier.apr}
                            onChange={(e) => handleTierChange(index, 'apr', e.target.value)}
                            placeholder="3.99%, 5.49%"
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="remove-tier-btn"
                            onClick={() => removeTier(index)}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button
                  type="button"
                  className="add-tier-btn"
                  onClick={addTier}
                >
                  + Add Tier
                </button>
              </div>
            </div>
          </div>
          
          <div className="form-section guidelines-section">
            <h2>Lender Guidelines & Notes</h2>
            <textarea
              name="guidelines"
              value={formData.guidelines}
              onChange={handleInputChange}
              rows={6}
              placeholder="Enter lender guidelines and special requirements..."
            ></textarea>
          </div>
        </form>
      ) : (
        // View Mode
        <div className="lender-details-content">
          <div className="details-row">
            <div className="details-section">
              <h2>Basic Information</h2>
              <div className="detail-item">
                <span className="detail-label">Name:</span>
                <span className="detail-value">{lender.name}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Type:</span>
                <span className="detail-value">{lender.type}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Min Credit Score:</span>
                <span className="detail-value">{lender.minScore}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Max Loan to Value:</span>
                <span className="detail-value">{lender.maxLtv}%</span>
              </div>
            </div>
            
            <div className="details-section">
              <h2>Credit Tiers</h2>
              <div className="tiers-table">
                <table>
                  <thead>
                    <tr>
                      <th>Tier</th>
                      <th>Score</th>
                      <th>Max LTV</th>
                      <th>APR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lender.tiers.map((tier, index) => (
                      <tr key={index}>
                        <td>{tier.tier}</td>
                        <td>{tier.score}</td>
                        <td>{tier.maxLtv}</td>
                        <td>{tier.apr}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          
          <div className="details-section guidelines-section">
            <h2>Lender Guidelines & Notes</h2>
            <div className="guidelines-content">
              {lender.guidelines.split('\n').map((line, index) => (
                <p key={index}>{line}</p>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default LenderDetails; 