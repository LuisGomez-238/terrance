import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { getLenderById, deleteLender } from '../../services/lenderService';
import { updateLenderWithVectorStore } from '../../services/vectorStoreService';
import { useLoading } from '../../contexts/LoadingContext';
import './LenderDetails.scss';

function LenderDetails() {
  const { lenderId } = useParams();
  const navigate = useNavigate();
  const [lender, setLender] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [error, setError] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const fileInputRef = useRef(null);
  const { showLoading, hideLoading } = useLoading();
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    type: '',
    minScore: '',
    maxLtv: '',
    tiers: [],
    guidelines: '',
    notes: ''
  });
  
  useEffect(() => {
    const fetchLenderDetails = async () => {
      try {
        showLoading("Loading lender details...");
        
        // Use the actual Firestore query from lenderService
        const lenderData = await getLenderById(lenderId);
        
        setLender(lenderData);
        setFormData({
          name: lenderData.name || '',
          type: lenderData.type || '',
          minScore: lenderData.minScore?.toString() || '',
          maxLtv: lenderData.maxLtv?.toString() || '',
          tiers: lenderData.creditTiers || [],
          guidelines: lenderData.guidelines || '',
          notes: lenderData.notes || ''
        });
        
      } catch (error) {
        console.error('Error fetching lender details:', error);
        setError('Failed to load lender details. Please try again.');
      } finally {
        hideLoading();
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
  
  const handleFileSelect = (e) => {
    if (e.target.files) {
      setSelectedFiles(Array.from(e.target.files));
    }
  };
  
  const clearFiles = () => {
    setSelectedFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  const handleUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      showLoading("Updating lender details...");
      
      const updatedLender = {
        name: formData.name,
        type: formData.type,
        minScore: parseInt(formData.minScore),
        maxLtv: parseInt(formData.maxLtv),
        creditTiers: formData.tiers,
        guidelines: formData.guidelines,
        notes: formData.notes
      };
      
      // Update lender in Firestore with vector store integration
      await updateLenderWithVectorStore(lenderId, updatedLender, selectedFiles);
      
      // Exit edit mode and refresh data
      setEditMode(false);
      setLender(prev => ({
        ...prev,
        ...updatedLender
      }));
      
      // Clear selected files
      clearFiles();
      
    } catch (error) {
      console.error('Error updating lender:', error);
      setError('Failed to update lender. Please try again.');
    } finally {
      hideLoading();
      setLoading(false);
    }
  };
  
  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this lender? This will also remove related documents from Terrance\'s knowledge base.')) return;
    
    setLoading(true);
    try {
      showLoading("Deleting lender...");
      
      // Delete lender from Firestore
      await deleteLender(lenderId);
      
      navigate('/lenders');
    } catch (error) {
      console.error('Error deleting lender:', error);
      setError('Failed to delete lender. Please try again.');
      setLoading(false);
      hideLoading();
    }
  };
  
  if (loading && !lender) {
    return <div className="loading">Loading lender details...</div>;
  }
  
  if (!lender && !loading) {
    return (
      <div className="lender-not-found">
        <h2>Lender not found</h2>
        <Link to="/lenders" className="back-link">Back to Lenders</Link>
      </div>
    );
  }
  
  return (
    <div className="lender-details-container">
      {error && <div className="error-message">{error}</div>}
      
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
              <Link 
                to={`/lender-documents?lender=${lenderId}`}
                className="documents-btn"
              >
                <span className="material-icons">folder</span>
                Manage Documents
              </Link>
              <button
                className="test-btn"
                onClick={() => navigate(`/ai-assistant?topic=lender&id=${lenderId}`)}
              >
                <span className="material-icons">psychology</span>
                Test with Terrance
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
            <p className="section-description">
              This information will be stored in Terrance's knowledge base to provide accurate recommendations.
            </p>
            <div className="notes-header">
              <strong>Guidelines</strong> - General lender requirements and policies
            </div>
            <textarea
              name="guidelines"
              value={formData.guidelines}
              onChange={handleInputChange}
              rows={6}
              placeholder="Enter lender guidelines and special requirements..."
            ></textarea>
            
            <div className="notes-header">
              <strong>Detailed Notes</strong> - Structured information for Terrance AI
            </div>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleInputChange}
              rows={10}
              placeholder={`Enter detailed information in a structured format:

CREDIT TIERS:
- Tier 1: 740+ score, 120% LTV, rates from 3.99% (60m) to 4.49% (72m)
- Tier 2: 700-739 score, 115% LTV, rates from 4.49% (60m) to 4.99% (72m)
- Tier 3: 660-699 score, 110% LTV, rates from 5.49% (60m) to 5.99% (72m)

DOCUMENTATION REQUIREMENTS:
- Proof of income required for all applicants
- 3 months residence history required
- 6 months employment minimum

PRODUCT GUIDELINES:
- VSC maximum: $3,000 or 15% of amount financed
- GAP allowed up to $895
- Maximum back-end: 20% of amount financed

VEHICLE RESTRICTIONS:
- Maximum age: 8 years
- Maximum mileage: 100,000
- No salvage titles
- No commercial vehicles`}
            ></textarea>
          </div>
          
          <div className="form-section documents-section">
            <h2>Upload Documents</h2>
            <p className="section-description">
              Add documents to be processed and stored in Terrance's vector database
            </p>
            <div className="form-group">
              <label htmlFor="document-upload">Upload Lender Documents (PDF, Word, Text)</label>
              <input
                id="document-upload"
                type="file"
                multiple
                onChange={handleFileSelect}
                accept=".pdf,.docx,.doc,.txt"
                ref={fileInputRef}
              />
              {selectedFiles.length > 0 && (
                <div className="selected-files">
                  <h4>Selected Files ({selectedFiles.length})</h4>
                  <ul>
                    {selectedFiles.map((file, index) => (
                      <li key={index}>{file.name}</li>
                    ))}
                  </ul>
                  <button 
                    type="button" 
                    className="btn-secondary btn-sm"
                    onClick={clearFiles}
                  >
                    Clear Files
                  </button>
                </div>
              )}
              <p className="form-hint">
                <strong>Important:</strong> Upload lender documents such as guidelines, rate sheets, 
                or application forms to provide Terrance with comprehensive information.
              </p>
            </div>
          </div>
          
          <div className="form-actions">
            <button 
              type="button" 
              className="cancel-btn"
              onClick={() => setEditMode(false)}
              disabled={loading}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="save-btn"
              disabled={loading}
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
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
              <div className="tier-table">
                <div className="tier-header-row">
                  <div>Tier</div>
                  <div>Min Score</div>
                  <div>Max LTV</div>
                  <div>APR</div>
                </div>
                {lender.creditTiers?.map((tier, index) => (
                  <div className="tier-data-row" key={index}>
                    <div>{tier.tier}</div>
                    <div>{tier.score}</div>
                    <div>{tier.maxLtv}</div>
                    <div className={tier.apr === 'N/A' ? 'rate-na' : ''}>
                      {tier.apr === 'N/A' ? 'N/A' : tier.apr}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          
          <div className="details-section guidelines-section">
            <h2>Lender Guidelines</h2>
            <div className="guidelines-content">
              {lender.guidelines?.split('\n').map((line, index) => (
                <p key={index}>{line}</p>
              ))}
            </div>
          </div>
          
          <div className="details-section notes-section">
            <h2>Detailed Notes for Terrance</h2>
            <div className="terrance-info">
              <div className="info-icon">
                <span className="material-icons">psychology</span>
              </div>
              <div className="info-text">
                This structured information is used by Terrance AI to provide accurate recommendations
              </div>
            </div>
            <div className="notes-content">
              {lender.notes?.split('\n').map((line, index) => (
                <p key={index}>{line}</p>
              ))}
            </div>
          </div>
          
          <div className="details-section documents-section">
            <div className="section-header">
              <h2>Lender Documents</h2>
              <Link 
                to={`/lender-documents?lender=${lenderId}`}
                className="view-all-btn"
              >
                View All Documents
              </Link>
            </div>
            <div className="terrance-info">
              <div className="info-icon">
                <span className="material-icons">auto_stories</span>
              </div>
              <div className="info-text">
                Documents are processed and stored in Terrance's vector database for intelligent retrieval
              </div>
            </div>
          </div>
          
          <div className="details-section vector-status">
            <h2>Terrance Knowledge Status</h2>
            <div className="test-terrance">
              <p>Want to see how well Terrance understands this lender's information?</p>
              <button
                className="test-btn"
                onClick={() => navigate(`/ai-assistant?topic=lender&id=${lenderId}`)}
              >
                <span className="material-icons">psychology</span>
                Test with Terrance
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default LenderDetails; 