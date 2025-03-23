import React, { useState, useEffect } from 'react';
import { getLenders, createLender, updateLender, deleteLender } from '../../services/lenderService';
import './Lenders.scss';

function Lenders() {
  const [lenders, setLenders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState(window.innerWidth <= 768 ? 'card' : 'table');
  const [activeTab, setActiveTab] = useState('basic');
  
  // Form state for adding/editing lenders
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentLender, setCurrentLender] = useState(null);
  const [formData, setFormData] = useState({
    // Basic info
    name: '',
    contactPerson: '',
    email: '',
    phone: '',
    notes: '',
    
    // Credit tier guidelines with term-specific rates
    creditTiers: [
      { 
        name: 'Tier 1/A', 
        minScore: 740, 
        maxLTV: 150, 
        rates: { '60': 4.49, '72': 4.99, '84': 5.49 }
      },
      { 
        name: 'Tier 2/B', 
        minScore: 700, 
        maxLTV: 140, 
        rates: { '60': 5.49, '72': 5.99, '84': 6.49 }
      },
      { 
        name: 'Tier 3/C', 
        minScore: 660, 
        maxLTV: 130, 
        rates: { '60': 6.99, '72': 7.99, '84': 8.99 }
      },
      { 
        name: 'Tier 4/D', 
        minScore: 620, 
        maxLTV: 120, 
        rates: { '60': 8.99, '72': 9.99, '84': 10.99 }
      },
      { 
        name: 'Tier 5/E', 
        minScore: 580, 
        maxLTV: 110, 
        rates: { '60': 11.99, '72': 12.99, '84': 13.99 }
      },
      { 
        name: 'Tier 6/F', 
        minScore: 540, 
        maxLTV: 100, 
        rates: { '60': 14.99, '72': 15.99, '84': 16.99 }
      },
      { 
        name: 'Tier 7/G', 
        minScore: 500, 
        maxLTV: 90, 
        rates: { '60': 17.99, '72': 18.99, '84': 19.99 }
      },
    ],
    
    // Vehicle restrictions
    vehicleRestrictions: {
      maxMileage: '',
      oldestYear: '',
      maxAgeYears: '',
      maxLoanTerm: '',
    },
    
    // Backend guidelines
    backendGuidelines: {
      maxWarrantyAmount: '',
      maxGapAmount: '',
      maxTotalBackend: '',
      backendOnTopOfLTV: false,
      backendIncludedInLTV: true, 
      maxBackendPercent: '',
      requiresIncome: false,
      requiresProofOfIncome: false,
    }
  });
  
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
      setLoading(true);
      setError(null);
      
      const data = await getLenders();
      setLenders(data);
      
    } catch (err) {
      console.error('Error loading lenders:', err);
      setError('Failed to load lenders. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (lender = null) => {
    if (lender) {
      setCurrentLender(lender);
      // Initialize with default values for any missing fields
      setFormData({
        // Basic info
        name: lender.name || '',
        contactPerson: lender.contactPerson || '',
        phone: lender.phone || '',
        notes: lender.notes || '',
        
        // Credit tier guidelines - use existing or default
        creditTiers: lender.creditTiers || [
          { name: 'Tier 1/A', minScore: 740, maxLTV: 150, rates: { '60': 4.49, '72': 4.99, '84': 5.49 } },
          { name: 'Tier 2/B', minScore: 700, maxLTV: 140, rates: { '60': 5.49, '72': 5.99, '84': 6.49 } },
          { name: 'Tier 3/C', minScore: 660, maxLTV: 130, rate: 7.99 },
          { name: 'Tier 4/D', minScore: 620, maxLTV: 120, rate: 9.99 },
          { name: 'Tier 5/E', minScore: 580, maxLTV: 110, rate: 12.99 },
          { name: 'Tier 6/F', minScore: 540, maxLTV: 100, rate: 15.99 },
          { name: 'Tier 7/G', minScore: 500, maxLTV: 90, rate: 18.99 },
        ],
        
        // Vehicle restrictions
        vehicleRestrictions: lender.vehicleRestrictions || {
          maxMileage: '',
          oldestYear: '',
          maxAgeYears: '',
          maxLoanTerm: '',
        },
        
        // Backend guidelines
        backendGuidelines: lender.backendGuidelines || {
          maxWarrantyAmount: '',
          maxGapAmount: '',
          maxTotalBackend: '',
          backendOnTopOfLTV: false,
          backendIncludedInLTV: true, 
          maxBackendPercent: '',
          requiresIncome: false,
          requiresProofOfIncome: false,
        }
      });
    } else {
      // Reset to defaults for new lender
      setCurrentLender(null);
      setFormData({
        // Basic info
        name: '',
        contactPerson: '',
        email: '',
        phone: '',
        notes: '',
        
        // Credit tier guidelines with term-specific rates
        creditTiers: [
          { 
            name: 'Tier 1/A', 
            minScore: 740, 
            maxLTV: 150, 
            rates: { '60': 4.49, '72': 4.99, '84': 5.49 }
          },
          { 
            name: 'Tier 2/B', 
            minScore: 700, 
            maxLTV: 140, 
            rates: { '60': 5.49, '72': 5.99, '84': 6.49 }
          },
          { 
            name: 'Tier 3/C', 
            minScore: 660, 
            maxLTV: 130, 
            rates: { '60': 6.99, '72': 7.99, '84': 8.99 }
          },
          { 
            name: 'Tier 4/D', 
            minScore: 620, 
            maxLTV: 120, 
            rates: { '60': 8.99, '72': 9.99, '84': 10.99 }
          },
          { 
            name: 'Tier 5/E', 
            minScore: 580, 
            maxLTV: 110, 
            rates: { '60': 11.99, '72': 12.99, '84': 13.99 }
          },
          { 
            name: 'Tier 6/F', 
            minScore: 540, 
            maxLTV: 100, 
            rates: { '60': 14.99, '72': 15.99, '84': 16.99 }
          },
          { 
            name: 'Tier 7/G', 
            minScore: 500, 
            maxLTV: 90, 
            rates: { '60': 17.99, '72': 18.99, '84': 19.99 }
          },
        ],
        
        // Vehicle restrictions
        vehicleRestrictions: {
          maxMileage: '',
          oldestYear: '',
          maxAgeYears: '',
          maxLoanTerm: '',
        },
        
        // Backend guidelines
        backendGuidelines: {
          maxWarrantyAmount: '',
          maxGapAmount: '',
          backendOnTopOfLTV: false,
          backendIncludedInLTV: true,
          requiresIncome: false,
          requiresProofOfIncome: false,
        }
      });
    }
    setActiveTab('basic'); // Reset to basic tab
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
  
  const handleCreditTierChange = (index, field, value) => {
    const updatedTiers = [...formData.creditTiers];
    updatedTiers[index] = {
      ...updatedTiers[index],
      [field]: value
    };
    
    setFormData({
      ...formData,
      creditTiers: updatedTiers
    });
  };
  
  const handleTierRateChange = (tierIndex, term, value) => {
    const updatedTiers = [...formData.creditTiers];
    
    // Initialize rates object if it doesn't exist
    if (!updatedTiers[tierIndex].rates) {
      updatedTiers[tierIndex].rates = {};
    }
    
    // Update the specific term rate
    updatedTiers[tierIndex].rates[term] = value;
    
    setFormData({
      ...formData,
      creditTiers: updatedTiers
    });
  };
  
  const handleVehicleRestrictionsChange = (field, value) => {
    setFormData({
      ...formData,
      vehicleRestrictions: {
        ...formData.vehicleRestrictions,
        [field]: value
      }
    });
  };
  
  const handleBackendGuidelinesChange = (field, value) => {
    setFormData({
      ...formData,
      backendGuidelines: {
        ...formData.backendGuidelines,
        [field]: field === 'backendOnTopOfLTV' || field === 'backendIncludedInLTV' || 
                 field === 'requiresIncome' || field === 'requiresProofOfIncome' 
                 ? value 
                 : value
      }
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      setLoading(true);
      
      // Clean up the credit tiers before saving
      const formattedCreditTiers = formData.creditTiers.map(tier => {
        // Ensure rates exist
        const rates = tier.rates || {};
        
        // Return a cleaned tier object
        return {
          name: tier.name,
          minScore: tier.minScore,
          maxLTV: tier.maxLTV,
          rates: {
            '60': rates['60'] === '' ? 'N/A' : 
                  rates['60'] === 'N/A' ? 'N/A' : 
                  parseFloat(rates['60']),
            '72': rates['72'] === '' ? 'N/A' : 
                  rates['72'] === 'N/A' ? 'N/A' : 
                  parseFloat(rates['72']),
            '84': rates['84'] === '' ? 'N/A' : 
                  rates['84'] === 'N/A' ? 'N/A' : 
                  parseFloat(rates['84'])
          }
        };
      });
      
      const lenderData = {
        ...formData,
        creditTiers: formattedCreditTiers
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
      setLoading(false);
    }
  };

  const handleDeleteLender = async (id) => {
    if (window.confirm('Are you sure you want to delete this lender?')) {
      try {
        setLoading(true);
        await deleteLender(id);
        await loadLenders();
      } catch (err) {
        console.error('Error deleting lender:', err);
        setError('Failed to delete lender. Please try again.');
      } finally {
        setLoading(false);
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
  
  const openLenderDetails = (lender) => {
    // Open a more detailed view of lender guidelines
    setCurrentLender(lender);
    setFormData({
      ...lender,
      creditTiers: lender.creditTiers || formData.creditTiers,
      vehicleRestrictions: lender.vehicleRestrictions || formData.vehicleRestrictions,
      backendGuidelines: lender.backendGuidelines || formData.backendGuidelines,
    });
    setActiveTab('creditTiers');
    setIsModalOpen(true);
  };

  // Add a useEffect to manage focus when the modal opens
  useEffect(() => {
    // Find the first input element in the modal
    if (isModalOpen) {
      const firstInput = document.querySelector('.modal-body input');
      if (firstInput) {
        firstInput.focus();
      }
    }
  }, [isModalOpen]);

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
          
          <button className="btn-add" onClick={() => handleOpenModal()}>
            <span className="material-icons">add</span>
            Add Lender
          </button>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {loading && lenders.length === 0 ? (
        <div className="loading">Loading lenders...</div>
      ) : filteredLenders.length === 0 ? (
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
                <th>Guidelines</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredLenders.map(lender => (
                <tr key={lender.id}>
                  <td>
                    <div className="lender-name">{lender.name}</div>
                  </td>
                  <td>{lender.contactPerson || '-'}</td>
                  <td>
                    <div>{lender.email || '-'}</div>
                    <div className="text-muted">{lender.phone || '-'}</div>
                  </td>
                  <td>
                    <button 
                      className="guidelines-btn" 
                      onClick={() => openLenderDetails(lender)}
                      title="View lending guidelines"
                    >
                      <span className="material-icons">assignment</span>
                      View Guidelines
                    </button>
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
              <div className="lender-details">
                <div className="detail-item">
                  <div className="label">Phone:</div>
                  <div className="value">{lender.phone || '-'}</div>
                </div>
              </div>
              <div className="card-actions">
                <button 
                  className="guidelines-btn" 
                  onClick={() => openLenderDetails(lender)}
                  title="View lending guidelines"
                >
                  <span className="material-icons">assignment</span>
                </button>
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

      {/* Add/Edit Lender Modal with Tabs */}
      {isModalOpen && (
        <div 
          className="modal-overlay" 
          onClick={handleCloseModal}
          onKeyDown={handleModalKeyDown}
          tabIndex="-1"
        >
          <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{currentLender ? 'Edit Lender' : 'Add New Lender'}</h2>
              <button className="close-btn" onClick={handleCloseModal}>
                <span className="material-icons">close</span>
              </button>
            </div>
            
            <div className="modal-tabs">
              <button 
                className={`tab-btn ${activeTab === 'basic' ? 'active' : ''}`}
                onClick={() => setActiveTab('basic')}
              >
                <span className="material-icons">business</span>
                <span className="tab-label">Basic Info</span>
              </button>
              <button 
                className={`tab-btn ${activeTab === 'creditTiers' ? 'active' : ''}`}
                onClick={() => setActiveTab('creditTiers')}
              >
                <span className="material-icons">credit_score</span>
                <span className="tab-label">Credit Tiers</span>
              </button>
              <button 
                className={`tab-btn ${activeTab === 'vehicleRestrictions' ? 'active' : ''}`}
                onClick={() => setActiveTab('vehicleRestrictions')}
              >
                <span className="material-icons">directions_car</span>
                <span className="tab-label">Vehicle</span>
              </button>
              <button 
                className={`tab-btn ${activeTab === 'backendGuidelines' ? 'active' : ''}`}
                onClick={() => setActiveTab('backendGuidelines')}
              >
                <span className="material-icons">paid</span>
                <span className="tab-label">Backend</span>
              </button>
            </div>
            
            <div className="progress-indicator">
              <div className="progress-steps">
                <div className={`step ${activeTab === 'basic' ? 'active' : ''} ${activeTab !== 'basic' ? 'completed' : ''}`}>1</div>
                <div className="step-line"></div>
                <div className={`step ${activeTab === 'creditTiers' ? 'active' : ''} ${activeTab !== 'basic' && activeTab !== 'creditTiers' ? 'completed' : ''}`}>2</div>
                <div className="step-line"></div>
                <div className={`step ${activeTab === 'vehicleRestrictions' ? 'active' : ''} ${activeTab === 'backendGuidelines' ? 'completed' : ''}`}>3</div>
                <div className="step-line"></div>
                <div className={`step ${activeTab === 'backendGuidelines' ? 'active' : ''}`}>4</div>
              </div>
            </div>
            
            <form onSubmit={handleSubmit}>
              <div className="tab-content-container">
                {/* Basic Info Tab */}
                <div className={`tab-content ${activeTab === 'basic' ? 'active' : ''}`}>
                  <div className="form-group">
                    <label htmlFor="name">Lender Name</label>
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
                  
                  <div className="form-group">
                    <label htmlFor="notes">Notes</label>
                    <textarea
                      id="notes"
                      name="notes"
                      value={formData.notes}
                      onChange={handleInputChange}
                      rows="3"
                      placeholder="Add any notes about this lender..."
                    ></textarea>
                  </div>
                </div>
                
                {/* Credit Tiers Tab */}
                <div className={`tab-content ${activeTab === 'creditTiers' ? 'active' : ''}`}>
                  <div className="section-header">
                    <h3>Credit Score and LTV Guidelines</h3>
                    <p className="section-description">Define credit tiers with rates for different loan terms.</p>
                  </div>
                  
                  <div className="credit-tiers-table">
                    <div className="tier-header">
                      <div className="tier-col tier-name">Tier Name</div>
                      <div className="tier-col">Min Score</div>
                      <div className="tier-col">Max LTV%</div>
                      <div className="tier-col rates-col">
                        <div className="rates-header">
                          <div>60-Month Rate</div>
                          <div>72-Month Rate</div>
                          <div>84-Month Rate</div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="tier-rows-container">
                      {formData.creditTiers.map((tier, index) => (
                        <div className="tier-row" key={index}>
                          <div className="tier-col tier-name">
                            <input
                              type="text"
                              value={tier.name}
                              onChange={(e) => handleCreditTierChange(index, 'name', e.target.value)}
                              placeholder="Tier name"
                            />
                          </div>
                          <div className="tier-col">
                            <input
                              type="number"
                              value={tier.minScore}
                              onChange={(e) => handleCreditTierChange(index, 'minScore', Number(e.target.value))}
                              placeholder="Min score"
                            />
                          </div>
                          <div className="tier-col">
                            <input
                              type="number"
                              value={tier.maxLTV}
                              onChange={(e) => handleCreditTierChange(index, 'maxLTV', Number(e.target.value))}
                              placeholder="Max LTV%"
                            />
                          </div>
                          <div className="tier-col rates-col">
                            {['60', '72', '84'].map((term) => (
                              <div className="term-rate" key={term}>
                                <div className="rate-input-group">
                                  <input
                                    type="text"
                                    value={
                                      tier.rates?.[term] === 'N/A' ? 'N/A' : 
                                      (tier.rates?.[term] || '')
                                    }
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      
                                      // Handle N/A value
                                      if (value === 'N/A') {
                                        handleTierRateChange(index, term, 'N/A');
                                        return;
                                      }
                                      
                                      // Handle empty value
                                      if (value === '') {
                                        handleTierRateChange(index, term, '');
                                        return;
                                      }
                                      
                                      // Allow numbers and decimal points (periods)
                                      // This regex checks if the value consists of digits and at most one decimal point
                                      if (/^(\d+\.?\d*|\.\d+)$/.test(value)) {
                                        handleTierRateChange(index, term, value);
                                      }
                                    }}
                                    placeholder={`${term}mo rate`}
                                    onClick={() => {
                                      if (tier.rates?.[term] === 'N/A') {
                                        handleTierRateChange(index, term, '');
                                      }
                                    }}
                                  />
                                  <span className="rate-suffix">%</span>
                                </div>
                                <button 
                                  type="button"
                                  className={`na-toggle ${tier.rates?.[term] === 'N/A' ? 'active' : ''}`}
                                  onClick={() => {
                                    handleTierRateChange(index, term, tier.rates?.[term] === 'N/A' ? '' : 'N/A');
                                  }}
                                  title={tier.rates?.[term] === 'N/A' ? 'Click to enable this rate' : 'Mark as not available'}
                                >
                                  N/A
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                
                {/* Vehicle Restrictions Tab */}
                <div className={`tab-content ${activeTab === 'vehicleRestrictions' ? 'active' : ''}`}>
                  <div className="section-header">
                    <h3>Vehicle Financing Criteria</h3>
                    <p className="section-description">Specify vehicle requirements this lender will accept.</p>
                  </div>
                  
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="maxMileage">Maximum Mileage</label>
                      <div className="input-with-icon">
                        <input
                          type="number"
                          id="maxMileage"
                          value={formData.vehicleRestrictions.maxMileage}
                          onChange={(e) => handleVehicleRestrictionsChange('maxMileage', e.target.value)}
                          placeholder="e.g. 100000"
                        />
                        <span className="input-suffix">miles</span>
                      </div>
                    </div>
                    
                    <div className="form-group">
                      <label htmlFor="oldestYear">Oldest Model Year</label>
                      <input
                        type="number"
                        id="oldestYear"
                        value={formData.vehicleRestrictions.oldestYear}
                        onChange={(e) => handleVehicleRestrictionsChange('oldestYear', e.target.value)}
                        placeholder="e.g. 2010"
                      />
                    </div>
                  </div>
                  
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="maxAgeYears">Maximum Vehicle Age</label>
                      <div className="input-with-icon">
                        <input
                          type="number"
                          id="maxAgeYears"
                          value={formData.vehicleRestrictions.maxAgeYears}
                          onChange={(e) => handleVehicleRestrictionsChange('maxAgeYears', e.target.value)}
                          placeholder="e.g. 7"
                        />
                        <span className="input-suffix">years</span>
                      </div>
                    </div>
                    
                    <div className="form-group">
                      <label htmlFor="maxLoanTerm">Maximum Loan Term</label>
                      <div className="input-with-icon">
                        <input
                          type="number"
                          id="maxLoanTerm"
                          value={formData.vehicleRestrictions.maxLoanTerm}
                          onChange={(e) => handleVehicleRestrictionsChange('maxLoanTerm', e.target.value)}
                          placeholder="e.g. 72"
                        />
                        <span className="input-suffix">months</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Backend Guidelines Tab */}
                <div className={`tab-content ${activeTab === 'backendGuidelines' ? 'active' : ''}`}>
                  <div className="section-header">
                    <h3>Backend Product Guidelines</h3>
                    <p className="section-description">Define how backend products can be added with this lender.</p>
                  </div>
                  
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="maxWarrantyAmount">Maximum Warranty Amount</label>
                      <div className="input-with-icon">
                        <span className="input-prefix">$</span>
                        <input
                          type="number"
                          id="maxWarrantyAmount"
                          value={formData.backendGuidelines.maxWarrantyAmount || ''}
                          onChange={(e) => handleBackendGuidelinesChange('maxWarrantyAmount', e.target.value)}
                          placeholder="e.g. 2500"
                        />
                      </div>
                    </div>
                    
                    <div className="form-group">
                      <label htmlFor="maxGapAmount">Maximum GAP Amount</label>
                      <div className="input-with-icon">
                        <span className="input-prefix">$</span>
                        <input
                          type="number"
                          id="maxGapAmount"
                          value={formData.backendGuidelines.maxGapAmount || ''}
                          onChange={(e) => handleBackendGuidelinesChange('maxGapAmount', e.target.value)}
                          placeholder="e.g. 800"
                        />
                      </div>
                    </div>
                  </div>
                  
                  <div className="section-divider">
                    <span>Backend Financing Rules</span>
                  </div>
                  
                  <div className="form-group backend-options">
                    <div className="checkbox-container">
                      <div className="checkbox-group">
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={formData.backendGuidelines.backendOnTopOfLTV}
                            onChange={(e) => handleBackendGuidelinesChange('backendOnTopOfLTV', e.target.checked)}
                          />
                          <span>Backend can be added on top of max LTV</span>
                        </label>
                        
                        <div className="checkbox-help">
                          Backend products can exceed the maximum LTV for the credit tier
                        </div>
                      </div>
                      
                      <div className="checkbox-group">
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={formData.backendGuidelines.backendIncludedInLTV}
                            onChange={(e) => handleBackendGuidelinesChange('backendIncludedInLTV', e.target.checked)}
                          />
                          <span>Backend must be included in max LTV</span>
                        </label>
                        
                        <div className="checkbox-help">
                          Backend products must be within the maximum LTV for the credit tier
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="modal-footer">
                <div className="footer-navigation">
                  {activeTab !== 'basic' && (
                    <button 
                      type="button" 
                      className="btn-nav previous"
                      onClick={() => setActiveTab(
                        activeTab === 'creditTiers' ? 'basic' : 
                        activeTab === 'vehicleRestrictions' ? 'creditTiers' : 
                        'vehicleRestrictions'
                      )}
                    >
                      <span className="material-icons">arrow_back</span>
                      Previous
                    </button>
                  )}
                  
                  {activeTab !== 'backendGuidelines' && (
                    <button 
                      type="button" 
                      className="btn-nav next"
                      onClick={() => setActiveTab(
                        activeTab === 'basic' ? 'creditTiers' : 
                        activeTab === 'creditTiers' ? 'vehicleRestrictions' : 
                        'backendGuidelines'
                      )}
                    >
                      Next
                      <span className="material-icons">arrow_forward</span>
                    </button>
                  )}
                </div>
                
                <div className="action-buttons">
                  <button 
                    type="button" 
                    className="btn-secondary"
                    onClick={handleCloseModal}
                  >
                    Cancel
                  </button>
                  
                  {activeTab === 'backendGuidelines' && (
                    <button 
                      type="submit" 
                      className="btn-primary"
                      disabled={loading}
                    >
                      {loading ? 'Saving...' : currentLender ? 'Update Lender' : 'Add Lender'}
                    </button>
                  )}
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

