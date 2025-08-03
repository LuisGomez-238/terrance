import React, { useState, useEffect } from 'react';
import { 
  collection, query, where, getDocs, orderBy, doc, updateDoc, 
  Timestamp, serverTimestamp, getDoc
} from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../AuthContext';
import { useLoading } from '../../contexts/LoadingContext';
import { differenceInDays } from 'date-fns';
import './FundingStatus.scss';

function FundingStatus() {
  const { currentUser } = useAuth();
  const { showLoading, hideLoading } = useLoading();
  const [deals, setDeals] = useState([]);
  const [financeManagers, setFinanceManagers] = useState({});
  const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'pending', 'critical', 'funded'
  const [sortField, setSortField] = useState('daysSinceSold');
  const [sortDirection, setSortDirection] = useState('desc');
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Get funding summary statistics
  const fundingSummary = deals.reduce((summary, deal) => {
    const now = new Date();
    const daysSinceSold = deal.dateSold ? differenceInDays(now, deal.dateSold.toDate()) : 0;
    
    // Update total counts
    if (deal.fundedDate) {
      summary.funded++;
      summary.fundedValue += parseFloat(deal.totalProfit || deal.backEndProfit || deal.profit || 0);
    } else {
      summary.pending++;
      summary.pendingValue += parseFloat(deal.totalProfit || deal.backEndProfit || deal.profit || 0);
      
      // Check age of pending deals
      if (daysSinceSold < 3) {
        summary.newDeals++;
      } else if (daysSinceSold >= 3 && daysSinceSold <= 7) {
        summary.warningDeals++;
      } else {
        summary.criticalDeals++;
      }
    }
    
    // Check business office status
    if (deal.sentToBusinessOffice && !deal.fundedDate) {
      summary.inBusinessOffice++;
    }
    
    // Check if notes exist
    if (deal.notes && deal.notes.trim().length > 0) {
      summary.withNotes++;
    }
    
    return summary;
  }, {
    funded: 0,
    pending: 0,
    fundedValue: 0,
    pendingValue: 0,
    newDeals: 0,
    warningDeals: 0,
    criticalDeals: 0,
    inBusinessOffice: 0,
    withNotes: 0
  });
  
  // Calculate funding percentage
  const fundingPercentage = deals.length > 0 
    ? Math.round((fundingSummary.funded / deals.length) * 100) 
    : 0;
  
  // Fetch finance managers' data
  const fetchFinanceManagers = async () => {
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('role', '==', 'finance_manager'));
      const querySnapshot = await getDocs(q);
      
      const managers = {};
      querySnapshot.forEach(doc => {
        managers[doc.id] = {
          id: doc.id,
          name: doc.data().name || doc.data().email,
          email: doc.data().email
        };
      });
      
      setFinanceManagers(managers);
    } catch (error) {
      console.error("Error fetching finance managers:", error);
    }
  };
  
  // Fetch all deals
  const fetchDeals = async () => {
    showLoading("Loading funding data...");
    
    try {
      // Get deals from last 90 days (or customize this timeframe)
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 90);
      
      const dealsRef = collection(db, 'deals');
      const q = query(
        dealsRef,
        where('dateSold', '>=', Timestamp.fromDate(startDate)),
        orderBy('dateSold', 'desc')
      );
      
      const querySnapshot = await getDocs(q);
      const now = new Date();
      const fetchedDeals = [];
      
      querySnapshot.forEach(doc => {
        const deal = doc.data();
        deal.id = doc.id;
        
        // Calculate funding status and days passed
        deal.fundingStatus = deal.fundedDate ? 'Funded' : 'Pending';
        
        // Calculate days since sold
        if (deal.dateSold) {
          const soldDate = deal.dateSold.toDate();
          deal.daysSinceSold = differenceInDays(now, soldDate);
        } else {
          deal.daysSinceSold = 0;
        }
        
        // Calculate days since sent to business office
        if (deal.sentToBusinessOffice && !deal.fundedDate) {
          const sentDate = deal.sentToBusinessOffice.toDate();
          deal.daysSinceSentToBO = differenceInDays(now, sentDate);
        }
        
        // Calculate status severity
        if (deal.fundedDate) {
          deal.severity = 'funded';
        } else if (deal.daysSinceSold >= 7) {
          deal.severity = 'critical';
        } else if (deal.daysSinceSold >= 3) {
          deal.severity = 'warning';
        } else {
          deal.severity = 'normal';
        }
        
        // Simplify totalProfit calculation
        deal.totalProfit = parseFloat(deal.totalProfit || deal.backEndProfit || deal.profit || 0);
        
        fetchedDeals.push(deal);
      });
      
      setDeals(fetchedDeals);
    } catch (error) {
      console.error("Error fetching deals:", error);
    } finally {
      hideLoading();
    }
  };
  
  // Handle sort change
  const handleSort = (field) => {
    if (field === sortField) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection(field === 'daysSinceSold' || field === 'daysSinceSentToBO' ? 'desc' : 'asc');
    }
  };
  
  // Handle filter change
  const handleFilterChange = (status) => {
    setFilterStatus(status);
  };
  
  // Open notes modal
  const handleOpenNotesModal = (deal) => {
    setSelectedDeal(deal);
    setNoteText(deal.notes || '');
    setShowNotesModal(true);
  };
  
  // Save notes
  const handleSaveNotes = async () => {
    if (!selectedDeal) return;
    
    showLoading("Saving note...");
    
    try {
      const dealRef = doc(db, 'deals', selectedDeal.id);
      
      await updateDoc(dealRef, {
        notes: noteText,
        lastNoteUpdate: serverTimestamp()
      });
      
      // Update the deal in the state
      setDeals(prevDeals => 
        prevDeals.map(deal => 
          deal.id === selectedDeal.id 
            ? { ...deal, notes: noteText, lastNoteUpdate: new Date() }
            : deal
        )
      );
      
      setShowNotesModal(false);
    } catch (error) {
      console.error("Error saving note:", error);
    } finally {
      hideLoading();
    }
  };
  
  // Mark deal as sent to business office
  const handleMarkAsSent = async (dealId) => {
    showLoading("Updating deal status...");
    
    try {
      const dealRef = doc(db, 'deals', dealId);
      
      await updateDoc(dealRef, {
        sentToBusinessOffice: serverTimestamp()
      });
      
      // Update the deal in the state
      setDeals(prevDeals => 
        prevDeals.map(deal => 
          deal.id === dealId 
            ? { 
                ...deal, 
                sentToBusinessOffice: Timestamp.fromDate(new Date()),
                daysSinceSentToBO: 0 
              }
            : deal
        )
      );
    } catch (error) {
      console.error("Error updating deal:", error);
    } finally {
      hideLoading();
    }
  };
  
  // Mark deal as funded
  const handleMarkAsFunded = async (dealId) => {
    showLoading("Updating deal status...");
    
    try {
      const dealRef = doc(db, 'deals', dealId);
      
      await updateDoc(dealRef, {
        fundedDate: serverTimestamp(),
        fundingStatus: 'Funded'
      });
      
      // Update the deal in the state
      setDeals(prevDeals => 
        prevDeals.map(deal => 
          deal.id === dealId 
            ? { 
                ...deal, 
                fundedDate: Timestamp.fromDate(new Date()),
                fundingStatus: 'Funded',
                severity: 'funded' 
              }
            : deal
        )
      );
    } catch (error) {
      console.error("Error updating deal:", error);
    } finally {
      hideLoading();
    }
  };
  
  // Unmark deal as funded
  const handleUnmarkFunded = async (dealId) => {
    if (!window.confirm('Are you sure you want to unmark this deal as funded?')) {
      return;
    }
    
    showLoading("Updating deal status...");
    
    try {
      const dealRef = doc(db, 'deals', dealId);
      const dealDoc = await getDoc(dealRef);
      const dealData = dealDoc.data();
      
      await updateDoc(dealRef, {
        fundedDate: null,
        fundingStatus: 'Pending'
      });
      
      // Recompute severity based on days
      let severity = 'normal';
      if (dealData.dateSold) {
        const daysSinceSold = differenceInDays(new Date(), dealData.dateSold.toDate());
        if (daysSinceSold >= 7) {
          severity = 'critical';
        } else if (daysSinceSold >= 3) {
          severity = 'warning';
        }
      }
      
      // Update the deal in the state
      setDeals(prevDeals => 
        prevDeals.map(deal => 
          deal.id === dealId 
            ? { 
                ...deal, 
                fundedDate: null,
                fundingStatus: 'Pending',
                severity: severity
              }
            : deal
        )
      );
    } catch (error) {
      console.error("Error updating deal:", error);
    } finally {
      hideLoading();
    }
  };
  
  // Filter and sort deals for display
  const getFilteredAndSortedDeals = () => {
    // Apply search filter
    let filtered = searchTerm 
      ? deals.filter(deal => {
          const customerName = typeof deal.customer === 'string' 
            ? deal.customer.toLowerCase() 
            : deal.customer?.name?.toLowerCase() || '';
            
          // Extract vehicle info for searching
          const vehicleYear = deal.vehicle?.year?.toString() || '';
          const vehicleModel = deal.vehicle?.model?.toLowerCase() || '';
          const vehicleVin = deal.vehicle?.vin?.toLowerCase() || '';
          
          // Search in customer name, vehicle info, or lender
          return customerName.includes(searchTerm.toLowerCase()) ||
                 vehicleYear.includes(searchTerm) ||
                 vehicleModel.includes(searchTerm.toLowerCase()) ||
                 vehicleVin.includes(searchTerm.toLowerCase()) ||
                 (deal.lenderName || '').toLowerCase().includes(searchTerm.toLowerCase());
        })
      : deals;
    
    // Apply status filter
    if (filterStatus !== 'all') {
      if (filterStatus === 'funded') {
        filtered = filtered.filter(deal => deal.fundedDate);
      } else if (filterStatus === 'pending') {
        filtered = filtered.filter(deal => !deal.fundedDate);
      } else if (filterStatus === 'critical') {
        filtered = filtered.filter(deal => deal.severity === 'critical');
      } else if (filterStatus === 'sentToBO') {
        filtered = filtered.filter(deal => deal.sentToBusinessOffice && !deal.fundedDate);
      }
    }
    
    // Apply sorting
    return filtered.sort((a, b) => {
      let valueA, valueB;
      
      switch (sortField) {
        case 'customer':
          valueA = typeof a.customer === 'string' ? a.customer.toLowerCase() : (a.customer?.name || '').toLowerCase();
          valueB = typeof b.customer === 'string' ? b.customer.toLowerCase() : (b.customer?.name || '').toLowerCase();
          break;
          
        case 'dateSold':
          valueA = a.dateSold ? a.dateSold.toDate().getTime() : 0;
          valueB = b.dateSold ? b.dateSold.toDate().getTime() : 0;
          break;
          
        case 'daysSinceSold':
          valueA = a.daysSinceSold || 0;
          valueB = b.daysSinceSold || 0;
          break;
          
        case 'daysSinceSentToBO':
          valueA = a.daysSinceSentToBO || 0;
          valueB = b.daysSinceSentToBO || 0;
          break;
          
        case 'lender':
          valueA = (a.lenderName || '').toLowerCase();
          valueB = (b.lenderName || '').toLowerCase();
          break;
          
        case 'totalProfit':
          valueA = a.totalProfit || 0;
          valueB = b.totalProfit || 0;
          break;
          
        case 'financeManager':
          valueA = (financeManagers[a.userId]?.name || '').toLowerCase();
          valueB = (financeManagers[b.userId]?.name || '').toLowerCase();
          break;
          
        default:
          return 0;
      }
      
      // Handle null or undefined values
      if (valueA === null || valueA === undefined) valueA = '';
      if (valueB === null || valueB === undefined) valueB = '';
      
      // Perform the comparison
      const result = valueA > valueB ? 1 : valueA < valueB ? -1 : 0;
      return sortDirection === 'asc' ? result : -result;
    });
  };
  
  // Format date
  const formatDate = (timestamp) => {
    if (!timestamp) return '-';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString();
  };
  
  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount || 0);
  };
  
  // Format vehicle
  const formatVehicle = (vehicle) => {
    if (!vehicle) return '-';
    return `${vehicle.year || ''} ${vehicle.model || ''}`.trim();
  };
  
  // Get severity class
  const getSeverityClass = (deal) => {
    return deal.severity || 'normal';
  };
  
  // Load data on component mount
  useEffect(() => {
    fetchFinanceManagers();
    fetchDeals();
  }, []);
  
  const filteredDeals = getFilteredAndSortedDeals();
  
  return (
    <div className="funding-status-container">
      <div className="funding-header">
        <h1>Funding Status</h1>
        <p className="date-display">
          {new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })}
        </p>
      </div>
      
      <div className="funding-summary">
        <div className="summary-card total">
          <div className="summary-content">
            <h3>Funding Status</h3>
            <div className="progress-container">
              <div 
                className="progress-bar" 
                style={{ width: `${fundingPercentage}%` }}
              >
                <span className="progress-text">{fundingPercentage}%</span>
              </div>
            </div>
            <div className="summary-counts">
              <div className="count-item">
                <span>{fundingSummary.funded}</span> Funded
              </div>
              <div className="count-item">
                <span>{fundingSummary.pending}</span> Pending
              </div>
            </div>
          </div>
        </div>
        
        <div className="summary-card funding-value">
          <div className="summary-icon">
            <span className="material-icons">payments</span>
          </div>
          <div className="summary-content">
            <h3>Pending Funding Value</h3>
            <div className="summary-value">{formatCurrency(fundingSummary.pendingValue)}</div>
          </div>
        </div>
        
        <div className="summary-card">
          <div className="summary-icon warning">
            <span className="material-icons">warning</span>
          </div>
          <div className="summary-content">
            <h3>Critical Deals (7+ days)</h3>
            <div className="summary-value">{fundingSummary.criticalDeals}</div>
          </div>
        </div>
        
        <div className="summary-card">
          <div className="summary-icon info">
            <span className="material-icons">timer</span>
          </div>
          <div className="summary-content">
            <h3>Awaiting Business Office</h3>
            <div className="summary-value">{fundingSummary.inBusinessOffice}</div>
          </div>
        </div>
      </div>
      
      <div className="funding-controls">
        <div className="filter-options">
          <button 
            className={filterStatus === 'all' ? 'active' : ''} 
            onClick={() => handleFilterChange('all')}
          >
            All Deals
          </button>
          <button 
            className={filterStatus === 'pending' ? 'active' : ''} 
            onClick={() => handleFilterChange('pending')}
          >
            Pending
          </button>
          <button 
            className={filterStatus === 'critical' ? 'active' : ''} 
            onClick={() => handleFilterChange('critical')}
          >
            Critical
          </button>
          <button 
            className={filterStatus === 'sentToBO' ? 'active' : ''} 
            onClick={() => handleFilterChange('sentToBO')}
          >
            In Business Office
          </button>
          <button 
            className={filterStatus === 'funded' ? 'active' : ''} 
            onClick={() => handleFilterChange('funded')}
          >
            Funded
          </button>
        </div>
        
        <div className="search-container">
          <span className="material-icons">search</span>
          <input
            type="text"
            placeholder="Search deals..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>
      
      <div className="funding-table-container">
        <table className="funding-table">
          <thead>
            <tr>
              <th 
                className={sortField === 'customer' ? `sorted-${sortDirection}` : ''} 
                onClick={() => handleSort('customer')}
              >
                Customer
                {sortField === 'customer' && <span className="sort-icon">{sortDirection === 'asc' ? '↑' : '↓'}</span>}
              </th>
              <th 
                className={sortField === 'dateSold' ? `sorted-${sortDirection}` : ''} 
                onClick={() => handleSort('dateSold')}
              >
                Date Sold
                {sortField === 'dateSold' && <span className="sort-icon">{sortDirection === 'asc' ? '↑' : '↓'}</span>}
              </th>
              <th 
                className={sortField === 'daysSinceSold' ? `sorted-${sortDirection}` : ''} 
                onClick={() => handleSort('daysSinceSold')}
              >
                Days Out
                {sortField === 'daysSinceSold' && <span className="sort-icon">{sortDirection === 'asc' ? '↑' : '↓'}</span>}
              </th>
              <th 
                className={sortField === 'financeManager' ? `sorted-${sortDirection}` : ''} 
                onClick={() => handleSort('financeManager')}
              >
                Finance Manager
                {sortField === 'financeManager' && <span className="sort-icon">{sortDirection === 'asc' ? '↑' : '↓'}</span>}
              </th>
              <th>Vehicle</th>
              <th 
                className={sortField === 'lender' ? `sorted-${sortDirection}` : ''} 
                onClick={() => handleSort('lender')}
              >
                Lender
                {sortField === 'lender' && <span className="sort-icon">{sortDirection === 'asc' ? '↑' : '↓'}</span>}
              </th>
              <th 
                className={sortField === 'totalProfit' ? `sorted-${sortDirection}` : ''} 
                onClick={() => handleSort('totalProfit')}
              >
                Deal Value
                {sortField === 'totalProfit' && <span className="sort-icon">{sortDirection === 'asc' ? '↑' : '↓'}</span>}
              </th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredDeals.length === 0 ? (
              <tr>
                <td colSpan="9" className="no-deals">
                  <div className="empty-state">
                    <span className="material-icons">info</span>
                    <p>No deals match the current criteria</p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredDeals.map(deal => (
                <tr key={deal.id} className={getSeverityClass(deal)}>
                  <td className="customer-cell">
                    {typeof deal.customer === 'string' ? deal.customer : deal.customer?.name}
                    {deal.notes && <span className="has-notes-indicator" title="Has notes"></span>}
                  </td>
                  <td>{formatDate(deal.dateSold)}</td>
                  <td className="days-cell">
                    {deal.fundedDate ? 'Funded' : `${deal.daysSinceSold} days`}
                  </td>
                  <td>{financeManagers[deal.userId]?.name || 'Unknown'}</td>
                  <td>{formatVehicle(deal.vehicle)}</td>
                  <td>{deal.lenderName || 'N/A'}</td>
                  <td className="profit-cell">{formatCurrency(deal.totalProfit)}</td>
                  <td className="status-cell">
                    {deal.fundedDate ? (
                      <span className="status-badge funded">Funded</span>
                    ) : deal.sentToBusinessOffice ? (
                      <span className="status-badge in-bo">Business Office ({deal.daysSinceSentToBO} days)</span>
                    ) : (
                      <span className="status-badge pending">Pending</span>
                    )}
                  </td>
                  <td className="actions-cell">
                    <button 
                      className="action-btn notes-btn"
                      onClick={() => handleOpenNotesModal(deal)}
                      title="Add/Edit Notes"
                    >
                      <span className="material-icons">note_add</span>
                    </button>
                    
                    {!deal.sentToBusinessOffice && !deal.fundedDate && (
                      <button 
                        className="action-btn send-btn"
                        onClick={() => handleMarkAsSent(deal.id)}
                        title="Mark as Sent to Business Office"
                      >
                        <span className="material-icons">send</span>
                      </button>
                    )}
                    
                    {!deal.fundedDate && (
                      <button 
                        className="action-btn fund-btn"
                        onClick={() => handleMarkAsFunded(deal.id)}
                        title="Mark as Funded"
                      >
                        <span className="material-icons">paid</span>
                      </button>
                    )}
                    
                    {deal.fundedDate && (
                      <button 
                        className="action-btn unfund-btn"
                        onClick={() => handleUnmarkFunded(deal.id)}
                        title="Unmark as Funded"
                      >
                        <span className="material-icons">money_off</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      
      {showNotesModal && selectedDeal && (
        <div className="modal-overlay">
          <div className="notes-modal">
            <div className="modal-header">
              <h3>
                Funding Notes for {typeof selectedDeal.customer === 'string' 
                  ? selectedDeal.customer 
                  : selectedDeal.customer?.name}
              </h3>
              <button 
                className="close-btn" 
                onClick={() => setShowNotesModal(false)}
              >
                <span className="material-icons">close</span>
              </button>
            </div>
            <div className="modal-body">
              <div className="deal-info">
                <div className="info-item">
                  <span className="label">Lender:</span>
                  <span className="value">{selectedDeal.lenderName || 'N/A'}</span>
                </div>
                <div className="info-item">
                  <span className="label">Date Sold:</span>
                  <span className="value">{formatDate(selectedDeal.dateSold)}</span>
                </div>
                <div className="info-item">
                  <span className="label">Days Out:</span>
                  <span className="value">{selectedDeal.daysSinceSold} days</span>
                </div>
              </div>
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Enter funding notes here... (calls made, issues, etc.)"
                rows={6}
              ></textarea>
            </div>
            <div className="modal-footer">
              <button 
                className="cancel-btn"
                onClick={() => setShowNotesModal(false)}
              >
                Cancel
              </button>
              <button 
                className="save-btn"
                onClick={handleSaveNotes}
              >
                Save Notes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default FundingStatus;
