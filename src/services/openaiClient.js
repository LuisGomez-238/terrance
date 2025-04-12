import OpenAI from 'openai';

// Initialize OpenAI client (singleton pattern)
const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true // Only for development, remove for production
});

export default openai; 