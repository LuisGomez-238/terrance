import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

// Your OpenAI API key should be stored in environment variables
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

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

// Main function to get response from OpenAI
export const getAIResponse = async (message, context, userId) => {
  // Create system message with Terrance's personality
  const systemMessage = `You are Terrance, an experienced automotive Finance Director with 20+ years in the industry. 
  You're direct, knowledgeable and don't waste time with pleasantries. 
  You respond in short, concise sentences focusing on actionable advice about automotive finance, insurance products, and sales techniques.
  
  Context information:
  - Dealership: Kia dealership
  - User role: Finance Manager
  - Available lenders: ${context.lenders.map(l => l.name).join(', ')}
  - Recent deal count: ${context.recentDeals.length}
  - Average backend profit: $${Math.round(context.recentDeals.reduce((sum, deal) => sum + deal.deal.backEndProfit, 0) / Math.max(context.recentDeals.length, 1))}
  
  Keep responses brief and direct - like an experienced F&I director who's busy but willing to help with specific questions.`;

  // Format conversation for OpenAI
  const formattedMessages = [
    { role: 'system', content: systemMessage }
  ];
  
  // Add user message
  formattedMessages.push({ role: 'user', content: message });
  
  try {
    // Get your API key from environment variables
    const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
    
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }
    
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini', // or use gpt-3.5-turbo for a less expensive option
        messages: formattedMessages,
        max_tokens: 500, // Limit response length
        temperature: 0.7, // Adjust for more direct responses
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error?.message || 'Error connecting to OpenAI');
    }
    
    const aiResponse = data.choices[0]?.message?.content || 'No response from AI';
    
    // Store chat history in Firestore if userId is provided
    if (userId) {
      await storeChatHistory(userId, [
        { role: 'user', content: message },
        { role: 'assistant', content: aiResponse }
      ]);
    }
    
    return aiResponse;
  } catch (error) {
    console.error('OpenAI API error:', error);
    return `System error: ${error.message}. Try again or check your API key configuration.`;
  }
};
