import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Retrieve credentials from environment variables
const SUPABASE_URL = Deno.env.get('MESTO_SUPABASE_URL')!;
const SUPABASE_KEY = Deno.env.get('MESTO_SUPABASE_KEY')!;
const BOT_TOKEN = Deno.env.get('MESTO_BOT_TOKEN')!;
const CHANNEL_USERNAME = '@mesto_community'; // Your Telegram channel username

// Create Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

let offset = 0; // Initialize offset to track processed updates

serve(async (req) => {
  // Ensure this is a POST request
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const timestamp = new Date().toISOString();

    // Fetch channel information to get the numeric ID
    const channelInfoResponse = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getChat?chat_id=${CHANNEL_USERNAME}`);
    const channelInfoData = await channelInfoResponse.json();

    if (!channelInfoData.ok) {
      throw new Error(`Failed to fetch channel data: ${channelInfoData.description}`);
    }

    const channelId = channelInfoData.result.id; // Use the numeric ID

    // Fetch messages from the discussion group
    const messages = await fetchDiscussionGroupMessages(channelId);

    // Calculate statistics from the messages
    const totalMessages = calculateTotalMessages(messages);
    const messagesPerDay = calculateMessagesPerDay(messages);
    const mostUsedWords = calculateMostUsedWords(messages);
    const activeHours = calculateActiveHours(messages);
    const topics = identifyTopics(messages);
    const averageMessageLength = calculateAverageMessageLength(messages);
    const averageSentimentScore = calculateAverageSentimentScore(messages);
    const averageResponseTime = calculateAverageResponseTime(messages);
    const engagementRate = calculateEngagementRate(messages);

    // Use upsert to handle duplicate key conflicts
    const { data: upsertData, error } = await supabase
      .from('telegram_channel_statistics')
      .upsert({
        user_id: channelId, // Use the numeric ID
        username: channelInfoData.result.title, // Use the actual channel name
        timestamp: timestamp,
        total_messages: totalMessages,
        messages_per_day: messagesPerDay,
        most_used_words: mostUsedWords,
        active_hours: activeHours,
        topics: topics,
        average_message_length: averageMessageLength,
        average_sentiment_score: averageSentimentScore,
        average_response_time: averageResponseTime,
        engagement_rate: engagementRate
      }, { onConflict: 'user_id' }) // Specify the column to check for conflicts
      .select(); // Return the inserted or updated data

    if (error) {
      console.error('Supabase Upsert Error:', error);
      throw new Error(`Failed to insert data into Supabase: ${error.message || JSON.stringify(error)}`);
    }

    return new Response(JSON.stringify({ message: 'Statistics stored successfully', data: upsertData }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200
    });
  } catch (error) {
    console.error('Error:', error.message || error);
    return new Response(JSON.stringify({ error: error.message || 'Unknown error' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
});

// Function to fetch messages from the discussion group
async function fetchDiscussionGroupMessages(channelId) {
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=${offset}`);
  const data = await response.json();

  if (!data.ok) {
    throw new Error(`Failed to fetch messages: ${data.description}`);
  }

  // Log the raw updates for debugging
  console.log('Raw updates:', data.result);

  // Filter messages from the specific discussion group
  const messages = data.result
    .filter(update => update.message && update.message.chat.id === channelId)
    .map(update => ({
      content: update.message.text || '',
      timestamp: update.message.date * 1000, // Convert to milliseconds
      type: update.message.text ? 'comment' : 'emoji' // Simplified logic
    }));

  // Update the offset to the last processed update ID + 1
  if (data.result.length > 0) {
    offset = data.result[data.result.length - 1].update_id + 1;
  }

  // Log the filtered messages for debugging
  console.log('Filtered messages:', messages);

  return messages;
}

function calculateTotalMessages(messages) {
  return messages.length;
}

function calculateMessagesPerDay(messages) {
  const messagesPerDay = {};
  messages.forEach(message => {
    const date = new Date(message.timestamp).toISOString().split('T')[0];
    messagesPerDay[date] = (messagesPerDay[date] || 0) + 1;
  });
  return messagesPerDay;
}

function calculateMostUsedWords(messages) {
  const wordCount = {};
  messages.forEach(message => {
    const words = message.content.split(/\s+/);
    words.forEach(word => {
      wordCount[word] = (wordCount[word] || 0) + 1;
    });
  });
  return Object.entries(wordCount).sort((a, b) => b[1] - a[1]).slice(0, 10);
}

function calculateActiveHours(messages) {
  const hours = Array(24).fill(0);
  messages.forEach(message => {
    const hour = new Date(message.timestamp).getUTCHours();
    hours[hour]++;
  });
  return hours;
}

function identifyTopics(messages) {
  // Implement topic identification logic
  return {};
}

function calculateAverageMessageLength(messages) {
  const totalLength = messages.reduce((sum, message) => sum + message.content.length, 0);
  return messages.length ? totalLength / messages.length : 0;
}

function calculateAverageSentimentScore(messages) {
  // Implement sentiment analysis logic
  return 0;
}

function calculateAverageResponseTime(messages) {
  if (messages.length < 2) return '00:00:00';
  const totalResponseTime = messages.reduce((sum, message, index) => {
    if (index === 0) return sum;
    const prevMessage = messages[index - 1];
    return sum + (new Date(message.timestamp) - new Date(prevMessage.timestamp));
  }, 0);
  const avgResponseTime = totalResponseTime / (messages.length - 1);
  const date = new Date(avgResponseTime);
  return date.toISOString().substr(11, 8);
}

function calculateEngagementRate(messages) {
  // Count comments and emojis as engagement
  const engagementCount = messages.filter(msg => msg.type === "comment" || msg.type === "emoji").length;
  return messages.length ? engagementCount / messages.length : 0; // Example engagement rate calculation
}
