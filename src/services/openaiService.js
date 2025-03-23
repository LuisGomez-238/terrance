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

// Enhanced helper function to format detailed lender information with notes
const formatLenderDetails = (lenders) => {
  if (!lenders || lenders.length === 0) {
    return "No lender information available.";
  }

  return lenders.map(lender => {
    // Format tier details if available
    let tierInfo = "";
    if (Array.isArray(lender.tierDetails) && lender.tierDetails.length > 0) {
      tierInfo = "\n    Tiers: " + lender.tierDetails.map(tier => 
        `${tier.name || 'Unknown'} (Score: ${tier.minScore || 'N/A'}, Rate: ${tier.baseRate || 'N/A'}%)`
      ).join(', ');
    } else if (lender.tiers) {
      tierInfo = `\n    Tiers: ${lender.tiers}`;
    }
    
    // Format backend guidelines
    const backendInfo = lender.backendGuidelines ? 
      `\n    Max Warranty: $${lender.backendGuidelines.maxWarranty || 0}, Max GAP: $${lender.backendGuidelines.maxGap || 0}` : 
      "";
    
    // Include notes if available
    const notesInfo = lender.notes ? `\n    Notes: ${lender.notes}` : "";
    
    // Include special programs if available
    const programsInfo = lender.specialPrograms ? 
      `\n    Special Programs: ${Array.isArray(lender.specialPrograms) ? 
        lender.specialPrograms.join(', ') : 
        lender.specialPrograms}` : 
      "";
    
    return `- ${lender.name} (${lender.type || 'Standard'}):
    Min Credit Score: ${lender.minScore || 'N/A'}
    Max LTV: ${lender.maxLtv || 'N/A'}${tierInfo}${backendInfo}${notesInfo}${programsInfo}`;
  }).join('\n\n');
};

// Enhanced helper function to find lender usage statistics
const getLenderUsageStats = (deals, lenders) => {
  // Count deal frequency by lender
  const lenderCounts = {};
  deals.forEach(deal => {
    const lenderName = deal.deal?.lenderName || 'Unknown';
    lenderCounts[lenderName] = (lenderCounts[lenderName] || 0) + 1;
  });
  
  // Calculate average profit by lender
  const lenderProfits = {};
  const lenderDeals = {};
  
  deals.forEach(deal => {
    const lenderName = deal.deal?.lenderName || 'Unknown';
    const profit = deal.deal?.backEndProfit || 0;
    
    if (!lenderProfits[lenderName]) {
      lenderProfits[lenderName] = 0;
      lenderDeals[lenderName] = 0;
    }
    
    lenderProfits[lenderName] += profit;
    lenderDeals[lenderName]++;
  });
  
  // Create usage summary for top lenders
  const topLenders = Object.entries(lenderCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => {
      const avgProfit = lenderDeals[name] > 0 ? 
        lenderProfits[name] / lenderDeals[name] : 0;
      
      // Find the lender in our full lender list for additional info
      const lenderInfo = lenders.find(l => l.name === name) || {};
      
      // Include a brief note if available
      const notePreview = lenderInfo.notes ? 
        `, Note: "${lenderInfo.notes.substring(0, 30)}${lenderInfo.notes.length > 30 ? '...' : ''}"` : 
        '';
      
      return {
        name,
        count,
        avgProfit,
        info: lenderInfo,
        notePreview
      };
    });
    
  return topLenders.map(l => 
    `${l.name}: ${l.count} deals, Avg Profit: $${l.avgProfit.toFixed(2)}, Min Score: ${l.info.minScore || 'N/A'}${l.notePreview}`
  ).join('\n');
};

// Helper function to format interest rate data
const formatInterestRateData = (lenders) => {
  if (!lenders || lenders.length === 0) {
    console.log("No lenders available for rate information");
    return "No interest rate information available.";
  }

  // For debugging - log the raw lender data
  console.log("Raw lender data for rate formatting:", JSON.stringify(lenders, null, 2));

  let rateData = [];
  
  lenders.forEach(lender => {
    // Skip if no credit tiers are available
    if (!lender.creditTiers || lender.creditTiers.length === 0) {
      console.log(`Lender ${lender.name} has no credit tiers`);
      return;
    }
    
    // For debugging - log the credit tiers for this lender
    console.log(`Credit tiers for ${lender.name}:`, JSON.stringify(lender.creditTiers, null, 2));
    
    let rateInfo = `- ${lender.name} Interest Rates:\n`;
    
    // Sort tiers by minimum credit score (highest first)
    const sortedTiers = [...lender.creditTiers].sort((a, b) => 
      (b.minScore || 0) - (a.minScore || 0)
    );
    
    rateInfo += "    Credit Score Tiers:\n";
    
    // Format each tier's rate information
    sortedTiers.forEach(tier => {
      const name = tier.name || 'Unknown';
      const minScore = tier.minScore || 'N/A';
      const maxLTV = tier.maxLTV || 'N/A';
      
      rateInfo += `    ${name} (${minScore}+): Max LTV ${maxLTV}%`;
      
      // Add term-specific rates if available
      if (tier.rates && typeof tier.rates === 'object') {
        rateInfo += ` | Rates: `;
        let termRates = [];
        
        // Format rates for 60, 72, and 84 month terms
        for (const term of ['60', '72', '84']) {
          const rate = tier.rates[term];
          // Skip if rate is not defined or empty
          if (rate !== undefined && rate !== null && rate !== '') {
            termRates.push(`${term} months: ${rate === 'N/A' ? 'N/A' : rate + '%'}`);
          }
        }
        
        rateInfo += termRates.join(', ');
      } else if (tier.rate) {
        // For backward compatibility with older format
        rateInfo += ` | Base rate: ${tier.rate === 'N/A' ? 'N/A' : tier.rate + '%'}`;
      }
      
      rateInfo += '\n';
    });
    
    // Add vehicle restrictions if available
    if (lender.vehicleRestrictions) {
      const vr = lender.vehicleRestrictions;
      let restrictions = [];
      
      if (vr.maxMileage) restrictions.push(`Max mileage: ${vr.maxMileage} miles`);
      if (vr.oldestYear) restrictions.push(`Oldest year: ${vr.oldestYear}`);
      if (vr.maxAgeYears) restrictions.push(`Max age: ${vr.maxAgeYears} years`);
      if (vr.maxLoanTerm) restrictions.push(`Max term: ${vr.maxLoanTerm} months`);
      
      if (restrictions.length > 0) {
        rateInfo += `    Vehicle Restrictions: ${restrictions.join(', ')}\n`;
      }
    }
    
    // Add notes if available
    if (lender.notes) {
      rateInfo += `    Notes: ${lender.notes}\n`;
    }
    
    rateData.push(rateInfo);
  });
  
  // For debugging - log the formatted rate information
  const formattedData = rateData.join('\n\n');
  console.log("Formatted interest rate data:", formattedData);
  
  return formattedData;
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
    
    // Get lender usage statistics with enhanced format
    const lenderUsageStats = getLenderUsageStats(deals, lenders);
    
    // Format detailed lender information
    const detailedLenderInfo = formatLenderDetails(lenders);
    
    // Format interest rate data
    const interestRateData = formatInterestRateData(lenders);
    
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
We have ${lenders.length} lenders available. Here are the top lenders by usage:
${lenderUsageStats}

DETAILED LENDER GUIDELINES:
${detailedLenderInfo}

INTEREST RATE INFORMATION:
${interestRateData}

DEAL HISTORY:
- Total deals in system: ${deals.length}
- Recent deals: ${deals.slice(0, 3).map(d => 
  `${d.vehicle.year || ''} ${d.vehicle.model || 'Unknown'} ($${d.deal?.backEndProfit?.toFixed(2) || '0.00'})`
).join('; ')}

When asked about interest rates for specific credit scores or terms:
1. ONLY provide rate information that is explicitly available in the INTEREST RATE INFORMATION section.
2. If exact rate information for a specific lender, credit score, or term is not available in your data, say "I don't have that specific rate information in my system" rather than estimating.
3. If a specific credit score falls between tier thresholds, explain which tier it would be in.
4. Always specify the exact data source, e.g., "According to our system, Noble Credit Union's rate for a 710 score (Tier 2) at 72 months is 5.99%."
5. If the requested lender doesn't appear in your data at all, state this clearly.

When asked about specific lenders, provide detailed guidelines on their credit requirements, backend limits, and product approvals. 
Reference the specific notes attached to each lender - these contain important internal knowledge about approval trends and relationship tips.
When making recommendations, prioritize lenders with higher average profit based on the user's deal history.
You can only access this specific user's deals and should reference their personal performance data.
Focus on their goal progress, top products, and preferred lenders when giving advice.
Keep responses brief and direct - like an experienced F&I director who's busy but willing to help with specific questions.`;

    // Log system message for debugging (remove in production)
    console.log("System message:", systemMessage);

    // Using the new SDK method for creating chat completions
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
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
