import React, { useState, useEffect, useRef } from 'react';
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../AuthContext';
import { format, subMonths, parseISO } from 'date-fns';
import { getAIResponse } from '../../services/openaiService';
import './AiAssistant.scss';

function AiAssistant() {
  const { currentUser } = useAuth();
  const [messages, setMessages] = useState([
    { id: 1, sender: 'ai', content: 'Terrance here. 20+ years in F&I. What do you need help with?' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [lenders, setLenders] = useState([]);
  const [deals, setDeals] = useState([]);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);
  
  useEffect(() => {
    // Fetch real data from Firebase
    const fetchData = async () => {
      try {
        setError(null);
        
        // Fetch lenders
        const lendersRef = collection(db, 'lenders');
        const lendersSnapshot = await getDocs(lendersRef);
        const lendersData = [];
        
        lendersSnapshot.forEach(doc => {
          const data = doc.data();
          lendersData.push({
            id: doc.id,
            name: data.name || 'Unknown',
            type: data.type || 'Unknown',
            tiers: data.tiers || '',
            minScore: data.minScore || 0,
            maxLtv: data.maxLtv || 0,
            tierDetails: data.tierDetails || [],
            backendGuidelines: data.backendGuidelines || {
              maxWarranty: 0,
              maxGap: 0
            }
          });
        });
        
        setLenders(lendersData);
        
        // Fetch recent deals
        try {
          const dealsRef = collection(db, 'deals');
          const recentDealsQuery = query(
            dealsRef,
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
          
          // Fallback query without orderBy if index doesn't exist
          const fallbackQuery = query(
            collection(db, 'deals'),
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
      } catch (error) {
        console.error('Error fetching data for AI assistant:', error);
        setError('Failed to load reference data. Please refresh the page.');
      }
    };
    
    fetchData();
  }, []);
  
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
      // Prepare the context for OpenAI
      const context = {
        lenders,
        recentDeals: deals,
        userRole: 'Finance Manager',
        dealershipName: 'Kia Dealership'
      };
      
      // Call the OpenAI service
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
  
  return (
    <div className="ai-assistant-container">
      <div className="ai-assistant-header">
        <h1>Terrance <span className="assistant-title">F&I Director</span></h1>
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
          Terrance, your F&I Director with 20+ years of automotive finance experience.
        </p>
      </div>
    </div>
  );
}

export default AiAssistant; 