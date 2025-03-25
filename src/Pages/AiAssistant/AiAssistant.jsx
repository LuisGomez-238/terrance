import React, { useState, useEffect, useRef } from 'react';
import { collection, getDocs, query, where, orderBy, limit, getDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../AuthContext';
import { format, subMonths, parseISO } from 'date-fns';
import { getAIResponse } from '../../services/openaiService';
import './AiAssistant.scss';
import { useProfile } from '../../contexts/ProfileContext';
import { getDocumentTypeName } from '../../utils/documentUtils';
import CUDLData from '../../assets/CUDLQuickRefrenceGuide.json';

function AiAssistant() {
  const { currentUser } = useAuth();
  
  const profileContext = useProfile();
  const userProfile = profileContext?.userProfile || { 
    monthlyTarget: 10000,
    name: '',
    notifications: {
      newLenderPrograms: true,
      dailySummary: true,
      monthlyGoal: false,
      aiSuggestions: true
    }
  };
  const profileLoading = profileContext?.loading || false;
  
  const [messages, setMessages] = useState([
    { id: 1, sender: 'ai', content: 'Terrance here. 20+ years in F&I. What do you need help with?' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [lenders, setLenders] = useState([]);
  const [deals, setDeals] = useState([]);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);
  const [availableDocuments, setAvailableDocuments] = useState([]);
  
  useEffect(() => {
    // Fetch real data from Firebase including documents
    const fetchData = async () => {
      try {
        setError(null);
        
        // Load CUDL Quick Reference Guide
        console.log("Loading CUDL Quick Reference Guide...");
        
        // Map the CUDL data to our lender format
        const cudlLenders = [];
        
        // First check if CUDLData is properly loaded
        if (CUDLData && CUDLData.credit_union_details) {
          console.log("CUDL data loaded successfully. Processing lenders...");
          
          // Process each credit union from CUDL data
          Object.entries(CUDLData.credit_union_details).forEach(([name, details]) => {
            const formattedNotes = [
              `Dealer Type: ${details.dealer_type || 'N/A'}`,
              `Live/Work Counties: ${Array.isArray(details.live_work_in_county) ? details.live_work_in_county.join(', ') : 'N/A'}`,
              `Max Adv New: ${details.max_adv_new || 'N/A'}`,
              `Max Adv Used: ${details.max_adv_used || 'N/A'}`,
              `Used Age Limit: ${details.used_age_limit || 'N/A'}`,
              `Used Mileage Limit: ${details.used_mileage_limit || 'N/A'}`,
              `Max Warranty: ${details.max_warranty || 'N/A'}`,
              `GAP: ${details.gap || 'N/A'}`,
              `Credit Bureau: ${details.credit_bureau || 'N/A'}`,
              `Max Flats: ${details.max_flats || 'N/A'}`,
              `Special Notes: ${details.notes || 'N/A'}`
            ].join(' | ');
            
            cudlLenders.push({
              id: `cudl_${name.replace(/\s+/g, '_').toLowerCase()}`,
              name: name,
              type: 'CUDL Credit Union',
              notes: formattedNotes,
              sourceType: 'CUDL Quick Reference Guide'
            });
          });
          
          console.log(`Processed ${cudlLenders.length} lenders from CUDL data`);
        } else {
          console.error("Failed to load CUDL data properly:", CUDLData);
        }
        
        // Combine CUDL lenders with Firebase lenders, prioritizing CUDL data
        const lendersRef = collection(db, 'lenders');
        const lendersSnapshot = await getDocs(lendersRef);
        const firestoreLenders = [];
        
        lendersSnapshot.forEach(doc => {
          const data = doc.data();
          
          // Check if this lender already exists in CUDL data
          const existingCudlLender = cudlLenders.find(l => 
            l.name.toLowerCase() === (data.name || '').toLowerCase()
          );
          
          if (!existingCudlLender) {
            // Only add if not in CUDL data
            firestoreLenders.push({
              id: doc.id,
              name: data.name || 'Unknown',
              type: data.type || 'Unknown',
              notes: data.notes || '',
              minScore: data.minScore || 0,
              maxLtv: data.maxLtv || 0,
              creditTiers: data.creditTiers || [],
              vehicleRestrictions: data.vehicleRestrictions || {},
              backendGuidelines: data.backendGuidelines || {
                maxWarranty: 0,
                maxGap: 0
              },
              tierDetails: data.tierDetails || [],
              sourceType: 'Firestore Database'
            });
          }
        });
        
        // Combine the lenders, with CUDL lenders first
        setLenders([...cudlLenders, ...firestoreLenders]);
        
        // Fetch recent deals - only for current user
        try {
          const dealsRef = collection(db, 'deals');
          const recentDealsQuery = query(
            dealsRef,
            where('userId', '==', currentUser.uid), // Filter by current user
            orderBy('createdAt', 'desc'),
            limit(20)
          );
          
          const dealsSnapshot = await getDocs(recentDealsQuery);
          const dealsData = [];
          
          dealsSnapshot.forEach(doc => {
            const data = doc.data();
            
            // Calculate total profit from products
            let totalProfit = 0;
            let products = [];
            
            if (Array.isArray(data.products)) {
              products = data.products.map(product => {
                const profit = parseFloat(product.profit) || 0;
                totalProfit += profit;
                
                return {
                  type: product.name || 'Unknown',
                  price: parseFloat(product.price) || 0,
                  profit: profit
                };
              });
            }
            
            dealsData.push({
              id: doc.id,
              customer: data.customer || { name: 'Unknown' },
              vehicle: data.vehicle || { year: 'Unknown', model: 'Unknown' },
              deal: { 
                lenderId: data.lender?.id || 'Unknown',
                lenderName: data.lender?.name || 'Unknown',
                apr: parseFloat(data.rate) || 0,
                term: parseFloat(data.term) || 0,
                backEndProfit: totalProfit
              },
              products: products,
              date: data.createdAt ? new Date(data.createdAt.seconds * 1000) : new Date(),
              userId: data.userId || 'Unknown'
            });
          });
          
          setDeals(dealsData);
        } catch (dealsError) {
          console.error('Error fetching deals:', dealsError);
          
          // Fallback query without orderBy if index doesn't exist, but still filtered by user
          const fallbackQuery = query(
            collection(db, 'deals'),
            where('userId', '==', currentUser.uid), // Filter by current user
            limit(20)
          );
          
          const fallbackSnapshot = await getDocs(fallbackQuery);
          const fallbackData = [];
          
          fallbackSnapshot.forEach(doc => {
            const data = doc.data();
            
            // Calculate total profit from products
            let totalProfit = 0;
            let products = [];
            
            if (Array.isArray(data.products)) {
              products = data.products.map(product => {
                const profit = parseFloat(product.profit) || 0;
                totalProfit += profit;
                
                return {
                  type: product.name || 'Unknown',
                  price: parseFloat(product.price) || 0,
                  profit: profit
                };
              });
            }
            
            fallbackData.push({
              id: doc.id,
              customer: data.customer || { name: 'Unknown' },
              vehicle: data.vehicle || { year: 'Unknown', model: 'Unknown' },
              deal: { 
                lenderId: data.lender?.id || 'Unknown',
                lenderName: data.lender?.name || 'Unknown',
                apr: parseFloat(data.rate) || 0,
                term: parseFloat(data.term) || 0,
                backEndProfit: totalProfit
              },
              products: products,
              date: data.createdAt ? new Date(data.createdAt.seconds * 1000) : new Date(),
              userId: data.userId || 'Unknown'
            });
          });
          
          setDeals(fallbackData);
        }
        
        // Fetch document information for each lender
        const fetchDocumentsForLenders = async (lendersData) => {
          console.log("Starting to fetch documents for lenders...");
          
          const documentsRef = collection(db, 'lenderDocuments');
          const documentsQuery = query(
            documentsRef,
            where('processed', '==', true),
            orderBy('uploadDate', 'desc')
          );
          
          const documentsSnapshot = await getDocs(documentsQuery);
          console.log(`Found ${documentsSnapshot.size} processed documents in Firestore`);
          
          // Group documents by lender
          const lenderDocsMap = {};
          
          documentsSnapshot.forEach(doc => {
            const data = doc.data();
            const lenderId = data.lenderId;
            
            if (!lenderDocsMap[lenderId]) {
              lenderDocsMap[lenderId] = [];
            }
            
            lenderDocsMap[lenderId].push({
              id: doc.id,
              type: data.type,
              fileName: data.fileName,
              uploadDate: data.uploadDate ? new Date(data.uploadDate.seconds * 1000) : new Date(),
              fileUrl: data.fileUrl,
              extractedContent: data.extractedContent || null,
              keyPoints: data.keyPoints || []
            });
            
            // Debug log for each document
            console.log(`Document for lender ${lenderId}: ${data.fileName} (${data.type})`);
            console.log(`- Has extracted content: ${!!data.extractedContent}`);
            console.log(`- Has key points: ${data.keyPoints?.length || 0}`);
          });
          
          // Format document references for each lender
          let documentReferences = "DOCUMENT REFERENCES:\n";
          
          for (const lender of lendersData) {
            const lenderDocs = lenderDocsMap[lender.id] || [];
            
            if (lenderDocs.length > 0) {
              documentReferences += `\n${lender.name}:\n`;
              
              // Group by document type
              const docsByType = {};
              lenderDocs.forEach(doc => {
                if (!docsByType[doc.type]) {
                  docsByType[doc.type] = [];
                }
                docsByType[doc.type].push(doc);
              });
              
              // Add info for each document type, using the most recent version
              for (const [type, docs] of Object.entries(docsByType)) {
                // Sort by date (newest first) and take the first one
                const latestDoc = docs.sort((a, b) => b.uploadDate - a.uploadDate)[0];
                
                // Format date
                const uploadDate = latestDoc.uploadDate.toLocaleDateString();
                
                documentReferences += `- ${getDocumentTypeName(type)} (${uploadDate}):\n`;
                
                // Include key points if available
                if (latestDoc.keyPoints && latestDoc.keyPoints.length > 0) {
                  documentReferences += "  Key points:\n";
                  latestDoc.keyPoints.forEach(point => {
                    documentReferences += `  • ${point}\n`;
                  });
                }
                
                // Include summarized content if available
                if (latestDoc.extractedContent) {
                  documentReferences += "  Summary:\n";
                  documentReferences += `  ${latestDoc.extractedContent.substring(0, 300)}...\n`;
                }
              }
            }
          }
          
          setAvailableDocuments(documentReferences);
        };
        
        fetchDocumentsForLenders(lenders);
      } catch (error) {
        console.error('Error fetching data for AI assistant:', error);
        setError('Failed to load reference data. Please refresh the page.');
      }
    };
    
    fetchData();
  }, [currentUser]);
  
  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  const handleInputChange = (e) => {
    setInput(e.target.value);
  };
  
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };
  
  const sendMessage = async () => {
    if (input.trim() === '' || loading) return;
    
    const userMessage = {
      id: messages.length + 1,
      sender: 'user',
      content: input.trim()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    
    try {
      // Simplify the context to focus on notes
      const context = {
        lenders,
        recentDeals: deals,
        userRole: 'Finance Manager',
        dealershipName: 'Kia Dealership',
        userProfile: {
          name: userProfile.name || 'Finance Manager',
          monthlyTarget: userProfile.monthlyTarget || 10000,
          preferences: userProfile.notifications || {}
        }
      };
      
      // Call the OpenAI service with simplified context
      const response = await getAIResponse(
        userMessage.content, 
        context, 
        currentUser?.uid
      );
      
      setMessages(prev => [...prev, {
        id: prev.length + 1,
        sender: 'ai',
        content: response
      }]);
    } catch (error) {
      console.error('Error getting AI response:', error);
      setMessages(prev => [...prev, {
        id: prev.length + 1,
        sender: 'ai',
        content: 'System error. Try again later. If it persists, check your API key configuration.'
      }]);
    } finally {
      setLoading(false);
    }
  };
  
  // Combine loading states
  if (loading && profileLoading && messages.length <= 1) {
    return <div className="ai-assistant-loading">Loading Terrance...</div>;
  }
  
  return (
    <div className="ai-assistant-container">
      <div className="ai-assistant-header">
        <h1>Terrance <span className="assistant-title">F&I Director</span></h1>
        {userProfile.monthlyTarget && (
          <div className="monthly-target-info">
            <span className="material-icons">flag</span>
            Monthly Target: ${userProfile.monthlyTarget.toLocaleString()}
          </div>
        )}
      </div>
      
      {error && <div className="error-message">{error}</div>}
      
      <div className="messages-container">
        {messages.map(message => (
          <div 
            key={message.id} 
            className={`message ${message.sender === 'ai' ? 'ai-message' : 'user-message'}`}
          >
            <div className="message-sender">
              {message.sender === 'ai' ? 'Terrance' : 'You'}
            </div>
            <div className="message-content">
              {message.content.split('\n').map((line, i) => (
                <React.Fragment key={i}>
                  {line}
                  <br />
                </React.Fragment>
              ))}
            </div>
          </div>
        ))}
        
        {loading && (
          <div className="message ai-message">
            <div className="message-sender">Terrance</div>
            <div className="message-content">
              <div className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>
      
      <div className="input-container">
        <textarea
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Ask Terrance a finance question..."
          disabled={loading}
          rows={2}
        />
        <button 
          onClick={sendMessage}
          disabled={!input.trim() || loading}
        >
          Send
        </button>
      </div>
      
      <div className="ai-assistant-footer">
        <p className="assistant-info">
          Terrance, your personal F&I Director with 20+ years of automotive finance experience.
        </p>
      </div>
    </div>
  );
}

export default AiAssistant; 