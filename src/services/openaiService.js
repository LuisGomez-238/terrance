import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import OpenAI from 'openai';

// Get API key from environment variables
const apiKey = import.meta.env.VITE_OPENAI_API_KEY || process.env.REACT_APP_OPENAI_API_KEY || '';

// Initialize the OpenAI client with the new SDK syntax
const openai = new OpenAI({
  apiKey: apiKey,
  dangerouslyAllowBrowser: true // This is needed for client-side use
});

// Helper function to store chat history in Firestore
const storeChatHistory = async (userId, messages) => {
  try {
    const chatRef = collection(db, 'chatHistory');
    await addDoc(chatRef, {
      userId,
      messages,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error storing chat history:', error);
  }
};

// Helper function to calculate current month's performance metrics
const calculatePerformanceMetrics = (deals) => {
  // Get current month's start date
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  
  // Filter deals for current month
  const currentMonthDeals = deals.filter(deal => {
    if (!deal.date) return false;
    const dealDate = deal.date instanceof Date ? deal.date : new Date(deal.date);
    return dealDate >= currentMonthStart;
  });
  
  // Calculate metrics
  const dealCount = currentMonthDeals.length;
  const totalProfit = currentMonthDeals.reduce((sum, deal) => 
    sum + (deal.deal?.backEndProfit || 0), 0);
  const avgProfit = dealCount > 0 ? totalProfit / dealCount : 0;
  
  // Calculate top products
  const productCounts = {};
  currentMonthDeals.forEach(deal => {
    if (Array.isArray(deal.products)) {
      deal.products.forEach(product => {
        const productName = product.type || 'Unknown';
        productCounts[productName] = (productCounts[productName] || 0) + 1;
      });
    }
  });
  
  // Sort products by count
  const topProducts = Object.entries(productCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => `${name} (${count})`);
  
  return {
    dealCount,
    totalProfit,
    avgProfit,
    topProducts: topProducts.length > 0 ? topProducts.join(', ') : 'None'
  };
};

// Main function to get response from OpenAI
export const getAIResponse = async (question, context, userId) => {
  try {
    // Extract all context data
    const userProfile = context.userProfile || {};
    const lenders = context.lenders || [];
    const deals = context.recentDeals || [];
    
    // Calculate performance metrics
    const performance = calculatePerformanceMetrics(deals);
    
    // Get top lenders by usage
    const lenderUsage = {};
    deals.forEach(deal => {
      const lenderName = deal.deal?.lenderName || 'Unknown';
      lenderUsage[lenderName] = (lenderUsage[lenderName] || 0) + 1;
    });
    
    const topLenders = Object.entries(lenderUsage)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, count]) => name);
    
    // Calculate goal progress percentage
    const monthlyTarget = userProfile.monthlyTarget || 10000;
    const goalProgress = Math.round((performance.totalProfit / monthlyTarget) * 100);
    const remainingToGoal = Math.max(0, monthlyTarget - performance.totalProfit);
    
    // Update the system message with comprehensive context
    const systemMessage = `You are Terrance, an experienced automotive Finance Director with 20+ years in the industry. 
You're direct, knowledgeable and don't waste time with pleasantries. 
You respond in short, concise sentences focusing on actionable advice about automotive finance, insurance products, and sales techniques.

USER PROFILE DATA:
- Name: ${userProfile.name || 'Finance Manager'}
- Monthly profit target: $${monthlyTarget.toLocaleString()}
- Notification preferences: ${Object.entries(userProfile.preferences || {})
  .filter(([_, value]) => value === true)
  .map(([key]) => key.replace(/([A-Z])/g, ' $1').toLowerCase())
  .join(', ')}

CURRENT PERFORMANCE:
- Current month deals: ${performance.dealCount}
- Current month profit: $${performance.totalProfit.toLocaleString()}
- Average profit per deal: $${performance.avgProfit.toFixed(2)}
- Goal progress: ${goalProgress}% ($${remainingToGoal.toLocaleString()} remaining)
- Top selling products: ${performance.topProducts}

LENDER INFORMATION:
- Available lenders (${lenders.length}): ${lenders.map(l => l.name).join(', ').substring(0, 100)}${lenders.length > 5 ? '...' : ''}
- Most used lenders: ${topLenders.join(', ') || 'No data'}

DEAL HISTORY:
- Total deals in system: ${deals.length}
- Recent deals: ${deals.slice(0, 3).map(d => 
  `${d.vehicle.year || ''} ${d.vehicle.model || 'Unknown'} ($${d.deal?.backEndProfit?.toFixed(2) || '0.00'})`
).join('; ')}

You can only access this specific user's deals and should reference their personal performance data.
Focus on their goal progress, top products, and preferred lenders when giving advice.
Keep responses brief and direct - like an experienced F&I director who's busy but willing to help with specific questions.`;

    // Log system message for debugging (remove in production)
    console.log("System message:", systemMessage);

    // Using the new SDK method for creating chat completions
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: question }
      ],
      temperature: 0.7,
      max_tokens: 500
    });

    if (response.choices && response.choices.length > 0) {
      const aiResponse = response.choices[0].message.content;
      
      // Store chat history in Firestore if userId is provided
      if (userId) {
        await storeChatHistory(userId, [
          { role: 'user', content: question },
          { role: 'assistant', content: aiResponse }
        ]);
      }
      
      return aiResponse;
    } else {
      return "I'm unable to generate a response at this time. Please try again later.";
    }
  } catch (error) {
    console.error('Error in AI service:', error);
    throw new Error('Failed to get AI response: ' + (error.message || 'Unknown error'));
  }
};
