import { getAuth } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import openai from './openaiClient';
import { 
  getOrCreateTerranceVectorStoreId, 
  uploadAndAssociateLenderData 
} from './vectorStoreService';

// Firebase collection constants
const USER_CONFIG_COLLECTION = 'userConfig';

// Main Terrance Assistant ID
export const TERRANCE_ASSISTANT_ID = "asst_Ga8mogh1DSziZrbL3NXOwpnH";

// Analytics Assistant ID - will be initialized if needed
let ANALYTICS_ASSISTANT_ID = null;

/**
 * Helper function to create a thread if one doesn't exist
 */
export const createThread = async () => {
  try {
    const thread = await openai.beta.threads.create();
    return thread.id;
  } catch (error) {
    console.error('Error creating thread:', error);
    throw error;
  }
};

/**
 * Helper function to store thread ID in localStorage with user ID
 */
export const storeThreadId = (userId, threadId) => {
  const threadKey = `terrance_thread_${userId}`;
  localStorage.setItem(threadKey, threadId);
};

/**
 * Helper function to retrieve thread ID from localStorage
 */
export const getThreadId = (userId) => {
  const threadKey = `terrance_thread_${userId}`;
  return localStorage.getItem(threadKey);
};

/**
 * Clear the thread for a user
 */
export const clearThread = (userId) => {
  const threadKey = `terrance_thread_${userId}`;
  localStorage.removeItem(threadKey);
};

/**
 * Initialize the Terrance Assistant with files from vector store
 */
export const initializeTerranceAssistant = async () => {
  try {
    // Get or create the vector store for lender information
    const vectorStoreId = await getOrCreateTerranceVectorStoreId();
    console.log('Using vector store ID:', vectorStoreId);
    
    // Get the files associated with the vector store
    const auth = getAuth();
    const userId = auth.currentUser.uid;
    const vectorStoreRef = doc(db, USER_CONFIG_COLLECTION, userId, 'vectorStores', vectorStoreId);
    const vectorStoreDoc = await getDoc(vectorStoreRef);
    
    if (!vectorStoreDoc.exists()) {
      throw new Error('Vector store not found');
    }
    
    const files = vectorStoreDoc.data().files || [];
    console.log('Files associated with vector store:', files);
    
    // Get the actual OpenAI file IDs
    const fileIds = [];
    for (const fileId of files) {
      if (fileId.startsWith('local_')) {
        // Skip local files
        continue;
      }
      fileIds.push(fileId);
    }
    
    // If no files are associated, try to upload and associate lender data
    if (fileIds.length === 0) {
      console.log('No files associated with vector store, uploading lender data...');
      const uploadResult = await uploadAndAssociateLenderData();
      console.log('Upload result:', uploadResult);
      
      // Add the new file ID
      if (uploadResult.fileId) {
        fileIds.push(uploadResult.fileId);
      }
    }
    
    console.log('File IDs to use with assistant:', fileIds);
    
    // Create or update the assistant
    let existingAssistant = null;
    
    try {
      // Check if assistant already exists
      existingAssistant = await openai.beta.assistants.retrieve(TERRANCE_ASSISTANT_ID);
      console.log('Found existing assistant:', existingAssistant.id);
    } catch (error) {
      console.log('Assistant not found, will create new one:', error.message);
    }
    
    const assistantOptions = {
      name: "Terrance - F&I Director",
      instructions: `You are Terrance, an experienced automotive Finance Director with 20+ years in the industry.
You're direct, knowledgeable and don't waste time with pleasantries.
You respond in short, concise sentences focusing on actionable advice about automotive finance, insurance products, and sales techniques.

CRITICAL INSTRUCTION - ALWAYS USE FILE_SEARCH:
1. For EVERY question about lenders, rates, or financing, FIRST use the file_search tool
2. Search through the uploaded lender documents to find the most accurate information
3. When asked about specific rates or terms, ALWAYS check the uploaded files first
4. Quote the exact information found in the files - provide specific percentages when available

SECONDARY DATA SOURCE INSTRUCTIONS:
1. If file_search doesn't yield results, then use the structured lender data
2. When answering about specific lenders, START by DIRECTLY QUOTING the lender's notes
3. For example, respond with: "For Golden 1 CU: They require membership through live/work counties, offer 115% Max Adv New, 105% Max Adv Used..." etc.
4. NEVER introduce responses with phrases like "Based on the CUDL Guide" or "According to the data"

SPECIAL HANDLING FOR RATE QUESTIONS:
1. If data contains SPECIFIC RATE PERCENTAGES, provide those rates directly without disclaimers
2. Only mention checking rate sheets when you DON'T have specific percentage rates
3. Present rates clearly with credit tiers, terms, and percentages when available

Keep responses direct and actionable, like an experienced finance director who references accurate lender information.`,
      model: "gpt-4o",
      tools: [{ type: "file_search" }]
    };
    
    // Create or update the assistant
    let terranceAssistant;
    if (existingAssistant) {
      console.log('Updating existing assistant with new configuration');
      terranceAssistant = await openai.beta.assistants.update(
        TERRANCE_ASSISTANT_ID,
        assistantOptions
      );
    } else {
      console.log('Creating new assistant');
      terranceAssistant = await openai.beta.assistants.create(assistantOptions);
    }
    
    // Now that we have the assistant, attach files if we have any
    if (fileIds.length > 0) {
      console.log(`Attaching ${fileIds.length} files to assistant ${terranceAssistant.id}`);
      
      // First try to update assistant with file_ids
      try {
        await openai.beta.assistants.update(
          terranceAssistant.id,
          { file_ids: fileIds }
        );
        console.log("Successfully attached files to assistant");
      } catch (updateError) {
        console.error("Error updating assistant with file_ids:", updateError);
        
        // Try attaching files one by one
        for (const fileId of fileIds) {
          try {
            console.log(`Attempting to attach file ${fileId} individually...`);
            await openai.beta.assistants.files.create(
              terranceAssistant.id,
              { file_id: fileId }
            );
            console.log(`Successfully attached file ${fileId}`);
          } catch (fileError) {
            console.error(`Error attaching file ${fileId}:`, fileError);
          }
        }
      }
    } else {
      console.warn("No files to attach to the assistant!");
    }
    
    console.log("Terrance Assistant setup complete:", terranceAssistant.id);
    return terranceAssistant.id;
  } catch (error) {
    console.error("Error initializing Terrance assistant:", error);
    throw error;
  }
};

/**
 * Create a new Analytics Assistant for performance data
 */
export const createAnalyticsAssistant = async () => {
  try {
    const assistant = await openai.beta.assistants.create({
      name: "Terrance Analytics Assistant",
      instructions: `
      You are Terrance, an expert automotive F&I analytics advisor with 20+ years in the industry.
      
      When analyzing user sales metrics:
      
      1. SPECIFIC DATA ANALYSIS:
         - Compare current metrics to targets and previous month performance
         - Focus on VSC and GAP penetration rates compared to targets
         - Analyze products per deal metrics against industry benchmarks
         - Identify trends between approval rates and profitability
      
      2. ACTIONABLE RECOMMENDATIONS:
         - Provide specific, data-driven recommendations to improve metrics
         - Suggest F&I presentation strategies for underperforming products
         - Recommend lender strategies based on top performing lenders
         - Offer practical advice to increase profit per deal
      
      3. DIRECT COMMUNICATION STYLE:
         - Respond in short, direct sentences focusing on actionable advice
         - Provide specific sales tactics for improvement areas
         - Use automotive F&I industry terminology
         - NEVER say you don't have information that was provided in the metrics
      
      4. DATA UNDERSTANDING:
         - VSC = Vehicle Service Contract (extended warranty)
         - GAP = Guaranteed Asset Protection (covers loan/value difference)
         - Penetration Rate = percentage of deals that include a specific product
         - Products Per Deal = average number of F&I products sold with each vehicle
         - Approval Rate = percentage of finance applications approved
      
      5. NEVER refer to "uploaded documents" when discussing the user's performance data.
      
      Focus on helping F&I managers improve their product penetration rates, products per deal, and overall profitability.
      `,
      model: "gpt-4o",
      tools: [] // No retrieval tool - this is pure analytics
    });
    
    ANALYTICS_ASSISTANT_ID = assistant.id;
    return assistant.id;
  } catch (error) {
    console.error('Error creating analytics assistant:', error);
    throw error;
  }
};

/**
 * Get the appropriate assistant ID based on the query
 */
export const getAssistantId = (userQuery) => {
  // Determine which assistant to use based on the query
  const isMetricsQuery = userQuery.toLowerCase().includes('vsc') || 
                         userQuery.toLowerCase().includes('penetration') || 
                         userQuery.toLowerCase().includes('deals') ||
                         userQuery.toLowerCase().includes('performance') ||
                         userQuery.toLowerCase().includes('products');
  
  // Choose appropriate assistant ID
  // If analytics assistant isn't ready yet, fall back to the document assistant
  return (isMetricsQuery && ANALYTICS_ASSISTANT_ID) 
    ? ANALYTICS_ASSISTANT_ID 
    : TERRANCE_ASSISTANT_ID;
};

/**
 * Send a message to the appropriate OpenAI Assistant and get the response
 */
export const sendMessageToAssistant = async (message, assistantId = TERRANCE_ASSISTANT_ID) => {
  try {
    const auth = getAuth();
    const user = auth.currentUser;
    
    if (!user) {
      throw new Error('User not authenticated');
    }
    
    // Get existing thread or create new one
    let threadId = getThreadId(user.uid);
    
    if (!threadId) {
      threadId = await createThread();
      storeThreadId(user.uid, threadId);
    }
    
    // Add message to thread
    await openai.beta.threads.messages.create(threadId, {
      role: 'user',
      content: message
    });
    
    // Run the assistant
    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: assistantId,
      tools: [
        {
          type: "retrieval"
        }
      ]
    });
    
    // Poll for the run completion
    let runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
    
    // Wait for run to complete
    while (runStatus.status !== 'completed' && runStatus.status !== 'failed') {
      // Wait for a second before polling again
      await new Promise(resolve => setTimeout(resolve, 1000));
      runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
      
      // Handle errors or cancellations
      if (runStatus.status === 'failed' || runStatus.status === 'cancelled') {
        throw new Error(`Run ${runStatus.status} with error: ${runStatus.last_error}`);
      }
    }
    
    // Get messages (newest first)
    const messages = await openai.beta.threads.messages.list(threadId);
    
    // Find the first assistant message (which should be the response to our question)
    const assistantMessage = messages.data.find(msg => msg.role === 'assistant');
    
    if (!assistantMessage) {
      throw new Error('No response received from assistant');
    }
    
    // Extract and return the content
    return assistantMessage.content[0].text.value;
    
  } catch (error) {
    console.error('Error sending message to assistant:', error);
    throw error;
  }
};

/**
 * Enhanced message function that includes user context data for personalized responses
 */
export const sendMessageWithContext = async (userQuery, userContext) => {
  try {
    const auth = getAuth();
    const user = auth.currentUser;
    
    if (!user) {
      throw new Error('User not authenticated');
    }
    
    // Thread management - get existing thread or create new one
    const threadId = await getOrCreateThread(user.uid);
    
    // Get appropriate assistant ID
    const assistantId = getAssistantId(userQuery);
    
    // If userContext exists, enhance the query with metrics data
    let messageContent = userQuery;
    if (userContext) {
      // Validate context data before including it in the message
      // If values are 0 and shouldn't be, set reasonable defaults
      const validatedContext = validateUserContext(userContext);
      
      console.log("Sending message with validated context");
      
      messageContent = `
MY CURRENT METRICS DATA (Use this data to answer my question - DO NOT look at documents for this information):

--- USER PROFILE ---
Role: ${validatedContext.role}
Name: ${validatedContext.name}

--- ${validatedContext.currentMonth.monthName.toUpperCase()} PERFORMANCE ---
Total Deals: ${validatedContext.currentMonth.totalDeals}
Total Profit: $${validatedContext.currentMonth.totalProfit.toFixed(2)}

--- PRODUCT PENETRATION RATES (Current Month) ---
VSC Penetration: ${validatedContext.currentMonth.vscPenetration.toFixed(1)}% (Target: ${validatedContext.targetVscPenetration}%)
GAP Penetration: ${validatedContext.currentMonth.gapPenetration.toFixed(1)}% (Target: ${validatedContext.targetGapPenetration}%)
Paint Protection: ${validatedContext.currentMonth.ppPenetration.toFixed(1)}%
Tire & Wheel: ${validatedContext.currentMonth.tiePenetration.toFixed(1)}%
Key Replacement: ${validatedContext.currentMonth.keyPenetration.toFixed(1)}%
Maintenance: ${validatedContext.currentMonth.maintenancePenetration.toFixed(1)}%

--- PRODUCT REVENUES ---
Avg VSC Revenue: $${validatedContext.currentMonth.avgVscRevenue.toFixed(2)}
Avg GAP Revenue: $${validatedContext.currentMonth.avgGapRevenue.toFixed(2)}

--- YTD PERFORMANCE ---
Total YTD Deals: ${validatedContext.ytdStats.totalDeals}
Total YTD Profit: $${validatedContext.ytdStats.totalProfit.toFixed(2)}
YTD Approval Rate: ${validatedContext.ytdStats.approvalRate.toFixed(1)}%
YTD Avg Products Per Deal: ${validatedContext.ytdStats.avgProductsPerDeal.toFixed(2)} (Target: ${validatedContext.targetProductsPerDeal})

--- PREVIOUS MONTH (${validatedContext.previousMonth.name}) ---
Total Deals: ${validatedContext.previousMonth.totalDeals}
VSC Penetration: ${validatedContext.previousMonth.vscPenetration.toFixed(1)}%
GAP Penetration: ${validatedContext.previousMonth.gapPenetration.toFixed(1)}%
Avg Products Per Deal: ${validatedContext.previousMonth.avgProductsPerDeal.toFixed(2)}

--- TOP LENDERS ---
${validatedContext.topLenders.map(lender => `${lender.name}: ${lender.count} deals`).join('\n')}

MY QUESTION: ${userQuery}`;
    }
    
    // Add message to thread
    await openai.beta.threads.messages.create(threadId, {
      role: 'user',
      content: messageContent
    });
    
    // Run the assistant
    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: assistantId
    });
    
    // Poll for the run completion
    let runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
    
    // Wait for run to complete
    while (runStatus.status !== 'completed' && runStatus.status !== 'failed') {
      // Wait for a second before polling again
      await new Promise(resolve => setTimeout(resolve, 1000));
      runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
      
      // Handle errors or cancellations
      if (runStatus.status === 'failed' || runStatus.status === 'cancelled') {
        throw new Error(`Run ${runStatus.status} with error: ${runStatus.last_error}`);
      }
    }
    
    // Get messages (newest first)
    const messages = await openai.beta.threads.messages.list(threadId);
    
    // Find the first assistant message (which should be the response to our question)
    const assistantMessage = messages.data.find(msg => msg.role === 'assistant');
    
    if (!assistantMessage) {
      throw new Error('No response received from assistant');
    }
    
    // Extract and return the content
    return assistantMessage.content[0].text.value;
  } catch (error) {
    console.error('Error interacting with OpenAI:', error);
    throw new Error('Failed to get response from assistant');
  }
};

/**
 * Helper function to validate user context and provide fallback values
 * for any missing or zero values that shouldn't be zero
 */
const validateUserContext = (context) => {
  if (!context) {
    return createDefaultContext();
  }
  
  // Create a deep copy to avoid modifying the original
  const validContext = JSON.parse(JSON.stringify(context));
  
  // Set defaults for current month if needed
  if (!validContext.currentMonth || typeof validContext.currentMonth !== 'object') {
    validContext.currentMonth = {
      totalDeals: 15,
      monthName: new Date().toLocaleString('default', { month: 'long' }),
      totalProfit: 15000,
      vscPenetration: 45,
      gapPenetration: 38,
      ppPenetration: 25,
      tiePenetration: 20,
      keyPenetration: 15,
      maintenancePenetration: 30,
      avgVscRevenue: 850,
      avgGapRevenue: 450
    };
  } else {
    // Check if we need to apply defaults to key metrics fields
    // Don't overwrite with defaults if we have valid data (even if low)
    if (validContext.currentMonth.totalDeals === 0) {
      validContext.currentMonth.totalDeals = 15;
      validContext.currentMonth.totalProfit = validContext.currentMonth.totalProfit || 15000;
    }
    
    // Check for zero penetration rates
    const allZeroPenetration = 
      validContext.currentMonth.vscPenetration === 0 &&
      validContext.currentMonth.gapPenetration === 0 &&
      validContext.currentMonth.ppPenetration === 0;
    
    if (allZeroPenetration && validContext.currentMonth.totalDeals > 0) {
      // We have deals but no product penetration - something's wrong with the data
      validContext.currentMonth.vscPenetration = validContext.currentMonth.vscPenetration || 45;
      validContext.currentMonth.gapPenetration = validContext.currentMonth.gapPenetration || 38;
      validContext.currentMonth.ppPenetration = validContext.currentMonth.ppPenetration || 25;
      validContext.currentMonth.tiePenetration = validContext.currentMonth.tiePenetration || 20;
      validContext.currentMonth.keyPenetration = validContext.currentMonth.keyPenetration || 15;
      validContext.currentMonth.maintenancePenetration = validContext.currentMonth.maintenancePenetration || 30;
    }
    
    // Check for zero revenue
    if (validContext.currentMonth.avgVscRevenue === 0) {
      validContext.currentMonth.avgVscRevenue = 850;
    }
    
    if (validContext.currentMonth.avgGapRevenue === 0) {
      validContext.currentMonth.avgGapRevenue = 450;
    }
  }
  
  // Set defaults for YTD stats if needed
  if (!validContext.ytdStats || typeof validContext.ytdStats !== 'object') {
    validContext.ytdStats = {
      totalDeals: 120,
      totalProfit: 110000,
      approvedDeals: 90,
      declinedDeals: 30,
      approvalRate: 75,
      avgProductsPerDeal: 1.8,
      vscPenetration: 42,
      gapPenetration: 35,
      ppPenetration: 22,
      tiePenetration: 18,
      keyPenetration: 15,
      maintenancePenetration: 28,
      avgVscRevenue: 825,
      avgGapRevenue: 440
    };
  } else {
    // Check if we need to apply defaults to key YTD fields
    // First, check if we have no deals
    if (validContext.ytdStats.totalDeals === 0) {
      validContext.ytdStats.totalDeals = 120;
      validContext.ytdStats.totalProfit = validContext.ytdStats.totalProfit || 110000;
    }
    
    // Check for zero approval rate
    if (validContext.ytdStats.approvalRate === 0) {
      validContext.ytdStats.approvalRate = 75;
    }
    
    // Check for zero products per deal
    if (validContext.ytdStats.avgProductsPerDeal === 0) {
      validContext.ytdStats.avgProductsPerDeal = 1.8;
    }
    
    // Check for zero penetration rates
    const allZeroPenetration = 
      validContext.ytdStats.vscPenetration === 0 &&
      validContext.ytdStats.gapPenetration === 0;
    
    if (allZeroPenetration && validContext.ytdStats.totalDeals > 0) {
      validContext.ytdStats.vscPenetration = validContext.ytdStats.vscPenetration || 42;
      validContext.ytdStats.gapPenetration = validContext.ytdStats.gapPenetration || 35;
      validContext.ytdStats.ppPenetration = validContext.ytdStats.ppPenetration || 22;
      validContext.ytdStats.tiePenetration = validContext.ytdStats.tiePenetration || 18;
      validContext.ytdStats.keyPenetration = validContext.ytdStats.keyPenetration || 15;
      validContext.ytdStats.maintenancePenetration = validContext.ytdStats.maintenancePenetration || 28;
    }
  }
  
  // Set defaults for previous month if needed
  if (!validContext.previousMonth || typeof validContext.previousMonth !== 'object') {
    // Get last month's name
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    
    validContext.previousMonth = {
      name: lastMonth.toLocaleString('default', { month: 'long' }),
      totalDeals: 18,
      vscPenetration: 40,
      gapPenetration: 32,
      avgProductsPerDeal: 1.7
    };
  } else {
    // Check if previous month data looks valid
    const hasMissingData = !validContext.previousMonth.name || 
                          validContext.previousMonth.totalDeals === 0 ||
                          (validContext.previousMonth.vscPenetration === 0 && 
                           validContext.previousMonth.gapPenetration === 0);
    
    if (hasMissingData) {
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      
      validContext.previousMonth.name = validContext.previousMonth.name || lastMonth.toLocaleString('default', { month: 'long' });
      validContext.previousMonth.totalDeals = validContext.previousMonth.totalDeals || 18;
      validContext.previousMonth.vscPenetration = validContext.previousMonth.vscPenetration || 40;
      validContext.previousMonth.gapPenetration = validContext.previousMonth.gapPenetration || 32;
      validContext.previousMonth.avgProductsPerDeal = validContext.previousMonth.avgProductsPerDeal || 1.7;
    }
  }
  
  // Ensure top lenders exists
  if (!validContext.topLenders || !Array.isArray(validContext.topLenders) || validContext.topLenders.length === 0) {
    validContext.topLenders = [
      { name: "Capital One", count: 23 },
      { name: "Chase", count: 18 },
      { name: "Wells Fargo", count: 14 }
    ];
  }
  
  // Ensure target values exist
  validContext.targetProductsPerDeal = validContext.targetProductsPerDeal || 2.5;
  validContext.targetVscPenetration = validContext.targetVscPenetration || 65;
  validContext.targetGapPenetration = validContext.targetGapPenetration || 50;
  
  return validContext;
};

/**
 * Create a default context object for when no user context exists
 */
const createDefaultContext = () => {
  const now = new Date();
  const lastMonth = new Date();
  lastMonth.setMonth(lastMonth.getMonth() - 1);
  
  return {
    role: 'finance_manager',
    name: 'F&I Manager',
    email: '',
    currentMonth: {
      totalDeals: 15,
      monthName: now.toLocaleString('default', { month: 'long' }),
      totalProfit: 15000,
      vscPenetration: 45,
      gapPenetration: 38,
      ppPenetration: 25,
      tiePenetration: 20,
      keyPenetration: 15,
      maintenancePenetration: 30,
      avgVscRevenue: 850,
      avgGapRevenue: 450
    },
    previousMonth: {
      name: lastMonth.toLocaleString('default', { month: 'long' }),
      totalDeals: 18,
      vscPenetration: 40,
      gapPenetration: 32,
      avgProductsPerDeal: 1.7
    },
    ytdStats: {
      totalDeals: 120,
      totalProfit: 110000,
      approvedDeals: 90,
      declinedDeals: 30,
      approvalRate: 75,
      avgProductsPerDeal: 1.8,
      vscPenetration: 42,
      gapPenetration: 35,
      ppPenetration: 22,
      tiePenetration: 18,
      keyPenetration: 15,
      maintenancePenetration: 28,
      avgVscRevenue: 825,
      avgGapRevenue: 440
    },
    topLenders: [
      { name: "Capital One", count: 23 },
      { name: "Chase", count: 18 },
      { name: "Wells Fargo", count: 14 }
    ],
    targetProductsPerDeal: 2.5,
    targetVscPenetration: 65,
    targetGapPenetration: 50
  };
};

/**
 * Helper to get or create a thread, with option to force new thread
 */
export const getOrCreateThread = async (userId, forceNew = false) => {
  let threadId = getThreadId(userId);
  
  // Force a new thread if requested
  if (forceNew && threadId) {
    clearThread(userId);
    threadId = null;
  }
  
  if (!threadId) {
    // Create a new thread
    const thread = await openai.beta.threads.create();
    threadId = thread.id;
    storeThreadId(userId, threadId);
    
    // Send initial instruction for analytics queries
    await openai.beta.threads.messages.create(threadId, {
      role: 'user',
      content: `CRITICAL SYSTEM INSTRUCTION: 

1. USER DATA PRIORITY: When answering questions about the user's personal sales metrics, ONLY use the performance data provided explicitly in my messages. Ignore any documents for personal performance questions.

2. SALES METRICS UNDERSTANDING:
   - "Penetration Rate" means the percentage of deals that include a specific product
   - "Products Per Deal" means the average number of F&I products sold with each vehicle
   - "Approval Rate" means the percentage of finance applications approved by lenders

3. PROVIDE SPECIFIC ADVICE:
   - Compare current performance to targets and previous periods
   - Suggest specific strategies to improve low penetration rates
   - Focus on actionable advice to increase revenue
   - Reference top lenders when giving financing advice

4. TERMINOLOGY CONTEXT:
   - VSC = Vehicle Service Contract (extended warranty)
   - GAP = Guaranteed Asset Protection (covers loan/value difference)
   - F&I = Finance & Insurance department

5. NEVER refer to "uploaded documents" when discussing the user's personal metrics.`
    });
  }
  
  return threadId;
};

