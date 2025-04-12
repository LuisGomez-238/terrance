import { sendMessageToAssistant } from '../src/services/assistantService';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { query, vectorStoreId, assistantId, userId } = req.body;
    
    if (!query || !assistantId || !userId) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    const response = await sendMessageToAssistant(query, assistantId, vectorStoreId);
    
    return res.status(200).json({ response });
  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: 'Failed to process request' });
  }
} 