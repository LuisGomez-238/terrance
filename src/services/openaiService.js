import { collection, addDoc, serverTimestamp, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
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

// Update the formatLenderDetails function to emphasize CUDL Reference Guide
const formatLenderDetails = (lenders) => {
  if (!lenders || lenders.length === 0) {
    return "No lender information available.";
  }

  // First, add the CUDL general reference information with more emphasis
  let formattedInfo = `CUDL QUICK REFERENCE GUIDE INFORMATION:
- This information is from the CUDL Quick Reference List dated 03/21/2025
- ALWAYS REFER TO THIS INFORMATION FIRST when answering lender questions
- Lender notes in this guide represent the most current and accurate information
- Credit unions serving ALL California counties include: American First CU, CoastHills CU, First Tech FCU, Golden 1 CU, KeyPoint CU, Kinecta FCU, LBS Financial, Matadors Community FCU, Nuvision CU, Patelco CU, Premier America CU, RIZE CU, San Diego County CU, Sea Air CU, Sea West FCU, Self-Help CU, Technology CU, UNCLE CU, Valley Strong CU
- Remember that new member eligibility is subject to review by each credit union
- This reference guide is not an official credit union document - always verify with current rate sheets

`;

  // Then format each lender's specific information with emphasis on the notes
  formattedInfo += lenders.map(lender => {
    return `
LENDER: ${lender.name.toUpperCase()} (${lender.type || 'Standard'})
----------------------------------------
PRIMARY REFERENCE NOTES: ${lender.notes || 'No detailed notes available for this lender.'}
----------------------------------------
`;
  }).join('\n\n');
  
  return formattedInfo;
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

// New helper function to fetch document references for each lender
const getLenderDocuments = async (lenders) => {
  if (!lenders || lenders.length === 0) return {};
  
  const lenderDocs = {};
  
  try {
    // Get all processed lender documents
    const docsRef = collection(db, 'lenderDocuments');
    const docsQuery = query(
      docsRef,
      where('processed', '==', true),
      orderBy('uploadDate', 'desc')
    );
    
    const docsSnapshot = await getDocs(docsQuery);
    
    // Group documents by lender ID
    docsSnapshot.forEach(doc => {
      const data = doc.data();
      
      if (!lenderDocs[data.lenderId]) {
        lenderDocs[data.lenderId] = [];
      }
      
      lenderDocs[data.lenderId].push({
        type: data.type,
        fileName: data.fileName,
        url: data.fileUrl,
        uploadDate: data.uploadDate ? new Date(data.uploadDate.seconds * 1000).toDateString() : 'Unknown'
      });
    });
    
    return lenderDocs;
  } catch (error) {
    console.error('Error fetching lender documents:', error);
    return {};
  }
};

// Add function to format document information for the AI context
const formatDocumentReferences = async (lenders) => {
  if (!lenders || lenders.length === 0) return "";
  
  try {
    // Get all processed lender documents
    const docsRef = collection(db, 'lenderDocuments');
    const docsQuery = query(
      docsRef,
      where('processed', '==', true),
      orderBy('uploadDate', 'desc')
    );
    
    const docsSnapshot = await getDocs(docsQuery);
    
    // Group documents by lender
    const lenderDocsMap = {};
    
    docsSnapshot.forEach(doc => {
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
    });
    
    // Format document references for each lender
    let documentReferences = "DOCUMENT REFERENCES:\n";
    
    for (const lender of lenders) {
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
            documentReferences += `  ${latestDoc.extractedContent}\n`;
          }
        }
      }
    }
    
    return documentReferences;
  } catch (error) {
    console.error('Error formatting document references:', error);
    return "Error retrieving document references.";
  }
};

// Helper function to get human-readable document type name
function getDocumentTypeName(type) {
  const types = {
    'guidelines': 'Lending Guidelines',
    'ratesheet': 'Rate Sheet',
    'forms': 'Application Forms',
    'reference': 'Quick Reference'
  };
  
  return types[type] || type;
}

// Main function to get response from OpenAI
export const getAIResponse = async (question, context, userId) => {
  try {
    // Extract context data
    const userProfile = context.userProfile || {};
    const deals = context.recentDeals || [];
    
    // Get performance metrics
    const performance = calculatePerformanceMetrics(deals);
    
    // Include document references if available
    const documentReferences = context.availableDocuments || "";
    
    // Calculate goal progress percentage
    const monthlyTarget = userProfile.monthlyTarget || 10000;
    const goalProgress = Math.round((performance.totalProfit / monthlyTarget) * 100);
    const remainingToGoal = Math.max(0, monthlyTarget - performance.totalProfit);
    
    // Update the systemMessage in getAIResponse function
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
${formatLenderDetails(context.lenders || [])}

DEAL HISTORY:
- Total deals in system: ${deals.length}
- Recent deals: ${deals.slice(0, 3).map(d => 
  `${d.vehicle.year || ''} ${d.vehicle.model || 'Unknown'} ($${d.deal?.backEndProfit?.toFixed(2) || '0.00'})`
).join('; ')}

CRUCIAL INSTRUCTIONS FOR HANDLING LENDER INFORMATION:
1. Your PRIMARY source of truth for all lender information is the CUDL Quick Reference Guide - ALWAYS check this source first
2. ONLY use information that explicitly appears in the CUDL Quick Reference Guide when discussing lender guidelines, rates, programs or requirements
3. When referencing lender information, EXPLICITLY cite the CUDL Quick Reference Guide, e.g., "According to the CUDL Quick Reference Guide..."
4. If information being requested isn't in the CUDL Quick Reference Guide, clearly state: "That specific information isn't available in the CUDL Quick Reference Guide for [Lender Name]. I recommend checking their current rate sheet."
5. NEVER make up, guess, or infer information that isn't explicitly stated in the CUDL Quick Reference Guide
6. When multiple lenders could satisfy a customer's needs, prioritize recommendations based on notes in the CUDL Quick Reference Guide
7. Pay particular attention to the lender notes section which contains the most valuable insights

Keep responses direct and actionable, like an experienced finance director who references accurate lender information.`;

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

// Add a more comprehensive lender question preprocessor
function preprocessLenderQuestion(question, lenders) {
  const lenderKeywords = ['rate', 'guideline', 'program', 'tier', 'credit score', 'eligibility', 'lender', 'finance', 'credit union', 'bank', 'approval', 'ltv', 'advance', 'mileage', 'year', 'used', 'new', 'max loan', 'term', 'warranty', 'gap', 'backend', 'flat'];
  
  // Check if question is about lenders
  const isLenderQuestion = lenderKeywords.some(keyword => 
    question.toLowerCase().includes(keyword)
  );
  
  if (isLenderQuestion) {
    return `IMPORTANT: This question appears to be about lender information. Before answering, you MUST:
1. Review the CUDL Quick Reference Guide information FIRST
2. Only provide information explicitly stated in the CUDL Quick Reference Guide
3. Begin your response with "Based on the CUDL Quick Reference Guide..."
4. If the requested information isn't in the CUDL Quick Reference Guide, clearly state this

The question is: ${question}`;
  }
  
  return question;
}
