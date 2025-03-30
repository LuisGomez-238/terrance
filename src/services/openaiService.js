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

// Update the formatLenderDetails function to highlight rate information in lender notes
const formatLenderDetails = (lenders) => {
  if (!lenders || lenders.length === 0) {
    return "No lender information available.";
  }

  // First, add the general reference information with source priority clarified
  let formattedInfo = `LENDER DATA SOURCES:
- PRIORITY 1: Firestore lender data - ALWAYS use this when available
- PRIORITY 2: CUDL Quick Reference Guide - only use for lenders not in Firestore
- All lender information is organized with the highest priority data first
- Credit unions serving ALL California counties include: American First CU, CoastHills CU, First Tech FCU, Golden 1 CU, KeyPoint CU, Kinecta FCU, LBS Financial, Matadors Community FCU, Nuvision CU, Patelco CU, Premier America CU, RIZE CU, San Diego County CU, Sea Air CU, Sea West FCU, Self-Help CU, Technology CU, UNCLE CU, Valley Strong CU
- Remember that new member eligibility is subject to review by each credit union

`;

  // Group lenders by source type for clarity
  const firestoreLenders = lenders.filter(l => l.sourceType === 'Firestore Database');
  const cudlLenders = lenders.filter(l => l.sourceType === 'CUDL Quick Reference Guide');
  
  // Add a note about prioritization
  formattedInfo += `PRIORITIZED LENDER DATA:\n`;
  formattedInfo += `- Firestore Database Lenders (Priority 1): ${firestoreLenders.length}\n`;
  formattedInfo += `- CUDL Quick Reference Guide Lenders (Priority 2): ${cudlLenders.length}\n\n`;
  
  // Format the lender details, starting with Firestore lenders
  const allLenderDetails = [...firestoreLenders, ...cudlLenders].map(lender => {
    // Extract notes and create a structured format with key details highlighted
    const notes = lender.notes || 'No detailed notes available for this lender.';
    const source = lender.sourceType || 'Unknown Source';
    
    // Create a section specifically for the most important guidelines extracted from notes
    let keyGuidelines = "";
    if (notes.includes('|')) {
      // Break down pipe-separated notes into bullet points for clarity
      keyGuidelines = notes.split('|').map(item => item.trim()).filter(item => item).map(item => `  • ${item}`).join('\n');
    }
    
    // Extract and highlight any rate-related information in the notes
    let rateInfo = "";
    const rateKeywords = ['rate', 'apr', 'interest', '%', 'percent', 'tier', 'score', 'fico'];
    
    if (notes) {
      const notesLower = notes.toLowerCase();
      const hasRateInfo = rateKeywords.some(keyword => notesLower.includes(keyword));
      
      if (hasRateInfo) {
        rateInfo = "\nRATE-SPECIFIC INFORMATION (EXTRACTED FROM NOTES):\n";
        notes.split('|').forEach(part => {
          if (rateKeywords.some(keyword => part.toLowerCase().includes(keyword))) {
            rateInfo += `  • ${part.trim()}\n`;
          }
        });
      }
    }
    
    return `
LENDER: ${lender.name.toUpperCase()} (${lender.type || 'Standard'})
----------------------------------------
SOURCE: ${source}
!!! CRITICAL LENDER NOTES !!!
${notes}
${keyGuidelines ? '\nKEY GUIDELINES BREAKDOWN:\n' + keyGuidelines : ''}
${rateInfo}
----------------------------------------
`;
  }).join('\n\n');
  
  return formattedInfo + allLenderDetails;
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
    const lenders = context.lenders || [];
    
    // Add debugging for lender data
    console.log(`Processing question with ${lenders.length} lenders available`);
    if (lenders.length > 0) {
      console.log("Sample lender data:", lenders[0].name, "has notes:", !!lenders[0].notes);
    }
    
    // Check if the question might contain a lender name not in our list
    const possibleLenderWords = question.toLowerCase().split(/\s+/).filter(word => word.length > 3);
    console.log("Possible lender words in question:", possibleLenderWords);
    
    // Preprocess the question to detect lender inquiries
    const processedQuestion = preprocessLenderQuestion(question, lenders);
    
    // Get performance metrics
    const performance = calculatePerformanceMetrics(deals);
    
    // Include document references if available
    const documentReferences = context.availableDocuments || "";
    
    // Calculate goal progress percentage
    const monthlyTarget = userProfile.monthlyTarget || 10000;
    const goalProgress = Math.round((performance.totalProfit / monthlyTarget) * 100);
    const remainingToGoal = Math.max(0, monthlyTarget - performance.totalProfit);
    
    // Keep and update THIS system message inside the function
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

CRUCIAL INSTRUCTIONS FOR LENDER INFORMATION:
1. ALWAYS PRIORITIZE FIRESTORE LENDER DATA over CUDL Quick Reference Guide data
2. For lenders with data in Firestore, use ONLY that data and ignore CUDL Quick Reference Guide
3. Use CUDL Quick Reference Guide ONLY for lenders not found in Firestore
4. Always START your response with the specific lender information, NOT with reference to the source
5. Example: "For Golden 1 CU: They require membership through live/work counties, offer 115% Max Adv New..." 
6. NEVER introduce responses with phrases like "Based on Firestore" or "According to the CUDL Guide"

SPECIAL HANDLING FOR RATE QUESTIONS:
1. If Firestore data contains SPECIFIC RATE PERCENTAGES, provide those rates directly and DO NOT add any disclaimers
2. Only use the disclaimer "Regarding rates specifically, current rates aren't listed..." when you DON'T have specific rate information
3. When providing rates from Firestore, present them clearly with credit tiers, terms, and percentages
4. If you don't have current rates, then say: "Current rates aren't listed in our data. Please check their latest rate sheet or contact them directly."

LENDER INFORMATION:
${formatLenderDetails(lenders)}

DEAL HISTORY:
- Total deals in system: ${deals.length}
- Recent deals: ${deals.slice(0, 3).map(d => 
  `${d.vehicle.year || ''} ${d.vehicle.model || 'Unknown'} ($${d.deal?.backEndProfit?.toFixed(2) || '0.00'})`
).join('; ')}

Keep responses direct and actionable, like an experienced finance director who references accurate lender information.`;

    // Log system message for debugging (remove in production)
    console.log("System message:", systemMessage);

    // Using the new SDK method for creating chat completions
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: processedQuestion }
      ],
      temperature: 0.7,
      max_tokens: 1200
    });

    if (response.choices && response.choices.length > 0) {
      let aiResponse = response.choices[0].message.content;
      
      // Post-process the response for lender questions
      aiResponse = enhanceLenderResponse(aiResponse, question, lenders);
      
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

// Update enhanceLenderResponse to remove the rate disclaimer when rates are already provided
function enhanceLenderResponse(response, question, lenders) {
  // Apply text normalization to better detect lender mentions
  const normalizedQuestion = question.toLowerCase().replace(/\bto\b|\bat\b|\bfor\b/, '');
  
  // Check if this is a rate question
  const rateKeywords = ['rate', 'apr', 'interest', '%', 'financing', 'tier', 'score', 'month'];
  const isRateQuestion = rateKeywords.some(keyword => normalizedQuestion.includes(keyword));
  
  // If the response already includes specific rates (e.g., percentages), remove the disclaimer
  if (isRateQuestion && 
      (response.match(/\d+\.\d+%/) || // Matches patterns like 5.74%
       response.match(/tier.+\d+(\.\d+)?%/i))) { // Matches "tier... X.XX%"
    
    // Remove the standard rate disclaimer paragraph if rates are already provided
    const disclaimerPattern = /Regarding rates specifically, current rates aren't listed.+check their latest rate sheet.+depend on credit tier, loan term, and vehicle specifics\./s;
    return response.replace(disclaimerPattern, '');
  }
  
  // Remove any technical implementation details from the response
  if (response.includes("notes are stored in firestore") || 
      response.includes("lenders collection")) {
    return response.replace(/notes are stored in firestore lenders collection/i, 
      "I don't have complete information for this lender.");
  }
  
  // The rest of the function can remain unchanged
  return response;
}

// Enhance the preprocessLenderQuestion function for prioritization
function preprocessLenderQuestion(question, lenders) {
  // Log lender information to debug
  console.log(`preprocessLenderQuestion received ${lenders.length} lenders`);
  
  // Group lenders by source for prioritization
  const firestoreLenders = lenders.filter(l => l.sourceType === 'Firestore Database');
  const cudlLenders = lenders.filter(l => l.sourceType === 'CUDL Quick Reference Guide');
  
  console.log(`Lenders breakdown: ${firestoreLenders.length} Firestore, ${cudlLenders.length} CUDL`);
  
  // Normalize the question for better matching
  const normalizedQuestion = question.toLowerCase().replace(/\bto\b|\bat\b|\bfor\b/, '');
  
  // Build lender name map with prioritization (Firestore first)
  const lenderNameMap = {};
  
  // First add Firestore lenders (PRIORITY)
  firestoreLenders.forEach(lender => {
    const name = lender.name.toLowerCase();
    lenderNameMap[name] = lender;
    
    // Add variations without "credit union" or "cu" for better matching
    if (name.includes('credit union')) {
      lenderNameMap[name.replace('credit union', '').trim()] = lender;
    }
    if (name.includes('cu')) {
      lenderNameMap[name.replace('cu', '').trim()] = lender;
    }
  });
  
  // Then add CUDL lenders (only if not already in map)
  cudlLenders.forEach(lender => {
    const name = lender.name.toLowerCase();
    if (!lenderNameMap[name]) {
      lenderNameMap[name] = lender;
      
      // Add variations without "credit union" or "cu" for better matching
      if (name.includes('credit union') && !lenderNameMap[name.replace('credit union', '').trim()]) {
        lenderNameMap[name.replace('credit union', '').trim()] = lender;
      }
      if (name.includes('cu') && !lenderNameMap[name.replace('cu', '').trim()]) {
        lenderNameMap[name.replace('cu', '').trim()] = lender;
      }
    }
  });
  
  // Check if any specific lender is mentioned using the name map
  const mentionedLenders = [];
  const lenderKeys = Object.keys(lenderNameMap);
  
  for (const key of lenderKeys) {
    if (normalizedQuestion.includes(key)) {
      const lender = lenderNameMap[key];
      if (!mentionedLenders.includes(lender.name.toLowerCase())) {
        mentionedLenders.push(lender.name.toLowerCase());
      }
    }
  }
  
  // Additional check for partial matches (e.g., "noble" for "Noble Credit Union")
  if (mentionedLenders.length === 0) {
    for (const lender of lenders) {
      const nameParts = lender.name.toLowerCase().split(/\s+/);
      for (const part of nameParts) {
        // Only consider meaningful name parts (typically 3+ chars)
        if (part.length >= 3 && normalizedQuestion.includes(part)) {
          mentionedLenders.push(lender.name.toLowerCase());
          break;
        }
      }
    }
  }
  
  // Rate-related keywords
  const rateKeywords = ['rate', 'apr', 'interest', 'percent', '%', 'financing', 
    'tier', 'score', 'fico', 'points', 'buy rate', 'sell rate', 'current rate', 'offering'];
  
  // Check if question is about rates specifically
  const isRateQuestion = rateKeywords.some(keyword => 
    normalizedQuestion.includes(keyword)
  );
  
  // Other keywords for general lender questions
  const lenderKeywords = ['guideline', 'program', 'eligibility', 
    'lender', 'finance', 'credit union', 'bank', 'approval', 'ltv', 'advance', 
    'mileage', 'year', 'used', 'new', 'max loan', 'term', 'warranty', 'gap', 
    'backend', 'flat', 'county', 'restriction', 'limit', 'requirement'];
  
  // Check if question is about lenders generally
  const isLenderQuestion = lenderKeywords.some(keyword => 
    normalizedQuestion.includes(keyword)
  );
  
  // For debugging
  console.log(`Detected lenders: ${mentionedLenders.join(', ')}`);
  console.log(`Is rate question: ${isRateQuestion}`);
  
  if (mentionedLenders.length > 0 && isRateQuestion) {
    // Special handling for specific lender rate questions
    return `CRITICAL INSTRUCTION: This is a RATE QUESTION about ${mentionedLenders.join(', ')}. 

FIRST: Search carefully through all lenders data and locate exact information for ${mentionedLenders.join(', ')}.

Start your response with comprehensive information about this lender:
"For ${mentionedLenders.join(', ')}: [insert detailed info including any specific rate percentages if available]"

IMPORTANT:
- If you find SPECIFIC RATE PERCENTAGES in the data, DO NOT add any disclaimer about rates not being available
- Only add "Regarding rates specifically, current rates aren't listed..." if you DON'T find specific percentage rates
- Present all information in a clear, organized manner focusing on what's most relevant to the question

The question is: ${question}`;
  } else if (mentionedLenders.length > 0) {
    // Special handling for specific lender mentions (non-rate questions)
    return `CRITICAL INSTRUCTION: This question is about ${mentionedLenders.join(', ')}. 

DO NOT start your response with "Based on the CUDL Quick Reference Guide" or similar phrases.
INSTEAD, respond by DIRECTLY starting with the lender information:

"For ${mentionedLenders.join(', ')}: [insert their specific notes here]"

Pay special attention to:
1. Dealer type requirements
2. County eligibility 
3. Maximum advances for new/used vehicles
4. Vehicle age and mileage limits
5. Other key requirements

ONLY AFTER sharing the specific information, you may mention it comes from the CUDL Quick Reference Guide.

The question is: ${question}`;
  } else if (isRateQuestion) {
    // Special handling for general rate questions
    return `IMPORTANT: This appears to be a question about RATES. Before answering:
1. Look for rate-specific information in the CUDL Quick Reference Guide lender notes
2. Rate information in lender notes takes PRIORITY over any other sources
3. Begin your response with "Based on the CUDL Quick Reference Guide lender notes:"
4. If insufficient rate data is available in the lender notes, clearly state this limitation

The rate question is: ${question}`;
  } else if (isLenderQuestion) {
    return `IMPORTANT: This appears to be a general lender question.

DO NOT introduce your response with "Based on the CUDL Quick Reference Guide" or similar phrasing.
INSTEAD, go directly to the relevant lender information and share it directly.

Begin with phrases like:
- "Most credit unions require..." 
- "Typical requirements include..."
- "The lenders serving this area are..."

Only AFTER sharing the specific information should you mention it comes from the reference guide.

The question is: ${question}`;
  }
  
  return question;
}
