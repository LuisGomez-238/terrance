import React, { useState, useEffect } from 'react';
import { getLenders, createLender, updateLender, deleteLender } from '../../services/lenderService';
import './Lenders.scss';
import { useLoading } from '../../contexts/LoadingContext';
import { Link } from 'react-router-dom';

function Lenders() {
  const [lenders, setLenders] = useState([]);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState(window.innerWidth <= 768 ? 'card' : 'table');
  const [dataLoaded, setDataLoaded] = useState(false);
  
  // Form state for adding/editing lenders
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentLender, setCurrentLender] = useState(null);
  const [formData, setFormData] = useState({
    // Basic info only
    name: '',
    contactPerson: '',
    email: '',
    phone: '',
    notes: '',
    type: 'bank' // Default type
  });
  
  const { showLoading, hideLoading } = useLoading();

  useEffect(() => {
    loadLenders();
    
    // Add resize listener for responsive layout
    const handleResize = () => {
      setViewMode(window.innerWidth <= 768 ? 'card' : 'table');
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const loadLenders = async () => {
    try {
      showLoading("Loading lenders...");
      setError(null);
      
      const data = await getLenders();
      setLenders(data);
      setDataLoaded(true);
      
    } catch (err) {
      console.error('Error loading lenders:', err);
      setError('Failed to load lenders. Please try again.');
    } finally {
      hideLoading();
    }
  };

  const handleOpenModal = (lender = null) => {
    if (lender) {
      setCurrentLender(lender);
      setFormData({
        name: lender.name || '',
        contactPerson: lender.contactPerson || '',
        email: lender.email || '',
        phone: lender.phone || '',
        notes: lender.notes || '',
        type: lender.type || 'bank'
      });
    } else {
      // Reset to defaults for new lender
      setCurrentLender(null);
      setFormData({
        name: '',
        contactPerson: '',
        email: '',
        phone: '',
        notes: '',
        type: 'bank'
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setCurrentLender(null);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      showLoading("Saving lender...");
      
      const lenderData = {
        ...formData
      };
      
      if (currentLender) {
        // Update existing lender
        await updateLender(currentLender.id, lenderData);
      } else {
        // Create new lender
        await createLender(lenderData);
      }
      
      // Refresh lenders list
      await loadLenders();
      handleCloseModal();
      
    } catch (err) {
      console.error('Error saving lender:', err);
      setError('Failed to save lender. Please try again.');
    } finally {
      hideLoading();
    }
  };

  const handleDeleteLender = async (id) => {
    if (window.confirm('Are you sure you want to delete this lender?')) {
      try {
        showLoading("Deleting lender...");
        await deleteLender(id);
        await loadLenders();
      } catch (err) {
        console.error('Error deleting lender:', err);
        setError('Failed to delete lender. Please try again.');
      } finally {
        hideLoading();
      }
    }
  };

  const filteredLenders = lenders.filter(lender => 
    lender.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (lender.contactPerson && lender.contactPerson.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const toggleViewMode = () => {
    setViewMode(viewMode === 'table' ? 'card' : 'table');
  };

  // Handle ESC key to close the modal
  const handleModalKeyDown = (e) => {
    if (e.key === 'Escape') {
      setIsModalOpen(false);
    }
  };

  // Prevent scrolling of the main page when modal is open
  useEffect(() => {
    if (isModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
    
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [isModalOpen]);

  if (!dataLoaded && !error) {
    return null;
  }

  return (
    <div className="lenders-container">
      <div className="lenders-header">
        <h1>Lenders</h1>
        <div className="actions">
          <div className="search-wrapper">
            <span className="material-icons">search</span>
            <input
              type="text"
              placeholder="Search lenders..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          {window.innerWidth > 768 && (
            <button className="view-toggle" onClick={toggleViewMode}>
              <span className="material-icons">
                {viewMode === 'table' ? 'view_module' : 'view_list'}
              </span>
            </button>
          )}
          
          <Link to="/lender-documents" className="btn-documents">
            <span className="material-icons">description</span>
            Lender Docs
          </Link>
          
          <button className="btn-add" onClick={() => handleOpenModal()}>
            <span className="material-icons">add</span>
            Add Lender
          </button>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {dataLoaded && filteredLenders.length === 0 ? (
        <div className="empty-state">
          <span className="material-icons">account_balance</span>
          <h3>No lenders found</h3>
          <p>Start by adding your first lender to streamline your financing process</p>
          <button className="btn-primary" onClick={() => handleOpenModal()}>Add Lender</button>
        </div>
      ) : viewMode === 'table' ? (
        <div className="lenders-table-container">
          <table className="lenders-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Contact Person</th>
                <th>Email / Phone</th>
                <th>Documents</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredLenders.map(lender => (
                <tr key={lender.id}>
                  <td>
                    <div className="lender-name">{lender.name}</div>
                    <div className="lender-type">{lender.type || 'Bank'}</div>
                  </td>
                  <td>{lender.contactPerson || '-'}</td>
                  <td>
                    <div>{lender.email || '-'}</div>
                    <div className="text-muted">{lender.phone || '-'}</div>
                  </td>
                  <td>
                    <Link 
                      to={`/lender-documents?lender=${lender.id}`} 
                      className="documents-btn"
                      title="View lender documents"
                    >
                      <span className="material-icons">folder</span>
                      View Documents
                    </Link>
                  </td>
                  <td className="actions-cell">
                    <button 
                      className="edit-btn" 
                      onClick={() => handleOpenModal(lender)}
                      title="Edit lender"
                    >
                      <span className="material-icons">edit</span>
                    </button>
                    <button 
                      className="delete-btn" 
                      onClick={() => handleDeleteLender(lender.id)}
                      title="Delete lender"
                    >
                      <span className="material-icons">delete</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="lenders-card-view">
          {filteredLenders.map(lender => (
            <div className="lender-card" key={lender.id}>
              <div className="lender-name">{lender.name}</div>
              <div className="lender-type">{lender.type || 'Bank'}</div>
              <div className="lender-details">
                <div className="detail-item">
                  <div className="label">Contact:</div>
                  <div className="value">{lender.contactPerson || '-'}</div>
                </div>
                <div className="detail-item">
                  <div className="label">Phone:</div>
                  <div className="value">{lender.phone || '-'}</div>
                </div>
                <div className="detail-item">
                  <div className="label">Email:</div>
                  <div className="value">{lender.email || '-'}</div>
                </div>
              </div>
              <div className="card-actions">
                <Link 
                  to={`/lender-documents?lender=${lender.id}`} 
                  className="documents-btn"
                  title="View lender documents"
                >
                  <span className="material-icons">folder</span>
                </Link>
                <button 
                  className="edit-btn" 
                  onClick={() => handleOpenModal(lender)}
                  title="Edit lender"
                >
                  <span className="material-icons">edit</span>
                </button>
                <button 
                  className="delete-btn" 
                  onClick={() => handleDeleteLender(lender.id)}
                  title="Delete lender"
                >
                  <span className="material-icons">delete</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Simplified Add/Edit Lender Modal */}
      {isModalOpen && (
        <div 
          className="modal-overlay" 
          onClick={handleCloseModal}
          onKeyDown={handleModalKeyDown}
          tabIndex="-1"
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{currentLender ? 'Edit Lender' : 'Add New Lender'}</h2>
              <button className="close-btn" onClick={handleCloseModal}>
                <span className="material-icons">close</span>
              </button>
            </div>
            
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label htmlFor="name">Lender Name*</label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    required
                    placeholder="Enter lender name"
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="type">Lender Type</label>
                  <select
                    id="type"
                    name="type"
                    value={formData.type}
                    onChange={handleInputChange}
                  >
                    <option value="bank">Bank</option>
                    <option value="credit_union">Credit Union</option>
                    <option value="finance_company">Finance Company</option>
                    <option value="captive">Captive Finance</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                
                <div className="form-group">
                  <label htmlFor="contactPerson">Contact Person</label>
                  <input
                    type="text"
                    id="contactPerson"
                    name="contactPerson"
                    value={formData.contactPerson}
                    onChange={handleInputChange}
                    placeholder="Enter contact person's name"
                  />
                </div>
                
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="email">Email</label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      placeholder="example@email.com"
                    />
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="phone">Phone</label>
                    <input
                      type="tel"
                      id="phone"
                      name="phone"
                      value={formData.phone}
                      onChange={handleInputChange}
                      placeholder="(123) 456-7890"
                    />
                  </div>
                </div>
                
                <div className="form-group">
                  <label>Lender Notes (Primary Source for Terrance AI)</label>
                  <textarea 
                    className="notes-textarea"
                    placeholder="Enter detailed information that Terrance should reference when advising about this lender. This is the ONLY information Terrance will use. Be thorough and structured:

- Credit Score Requirements: 720+ for best rates, 680-719 for Tier 2
- Interest Rates: 4.99% for 60 months (Tier 1), 5.99% for 72 months (Tier 1)
- Vehicle Restrictions: Max age 7 years, Max mileage 100,000
- Special Programs: First-time buyer program available with 10% down
- Documentation Required: Proof of income, residence for 2+ years
- Max LTV: 120% for Tier 1, 110% for Tier 2
- Back-end limits: $2,500 for service contracts, $895 for GAP"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={12}
                  />
                  <p className="form-hint">
                    <strong>Important:</strong> Terrance will ONLY use the information you provide in these notes when giving advice about this lender. Be thorough and accurate.
                  </p>
                </div>
              </div>
              
              <div className="modal-footer">
                <div className="form-info">
                  <span className="info-text">
                    <span className="material-icons">info</span>
                    Detailed lender information is now managed through uploaded documents
                  </span>
                </div>
                
                <div className="action-buttons">
                  <button 
                    type="button" 
                    className="btn-secondary"
                    onClick={handleCloseModal}
                  >
                    Cancel
                  </button>
                  
                  <button 
                    type="submit" 
                    className="btn-primary"
                  >
                    {currentLender ? 'Update Lender' : 'Add Lender'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Lenders; 

