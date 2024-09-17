import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Bot, webhookCallback } from "https://deno.land/x/grammy@v1.17.2/mod.ts"

// Replace these lines at the beginning of your file
const supabaseUrl = Deno.env.get('MESTO_SUPABASE_URL')!
const supabaseKey = Deno.env.get('MESTO_SUPABASE_KEY')!
const supabase = createClient(supabaseUrl, supabaseKey)

const botToken = Deno.env.get('MESTO_BOT_TOKEN')!

const bot = new Bot(botToken)

interface UserStats {
  user_id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  message_count: number;
  first_message_date: string;
  last_message_date: string;
  messages_per_day: Record<string, number>;
  messages_per_week: Record<string, number>;
  messages_per_month: Record<string, number>;
  total_characters: number;
  average_message_length: number;
  media_count: number;
  reply_count: number;
  forward_count: number;
  mention_count: number;
  hashtag_count: number;
  link_count: number;
  voice_message_count: number;
  sticker_count: number;
  most_active_hour: number;
  most_used_words: Record<string, number>;
  active_days: string[];
  sentiment_score: number;
  emoji_usage: Record<string, number>;
  topics: Record<string, number>;
  active_hours: Record<string, number>;
  interactions: Record<string, number>;
  total_messages: number;
  new_users: number;
}

let lastUpdateId = 0;

async function getTelegramStats(): Promise<UserStats[]> {
  console.log("Starting getTelegramStats function")
  const userStats: Record<number, UserStats> = {}
  try {
    console.log("Fetching updates")
    const updates = await bot.api.getUpdates({ offset: lastUpdateId + 1, limit: 100 })
    console.log(`Fetched ${updates.length} updates`)

    if (updates.length > 0) {
      lastUpdateId = updates[updates.length - 1].update_id;
    }

    const dailyActiveUsers: Record<string, Set<number>> = {};
    let latestDateStr = '';

    for (const update of updates) {
      if (!update.message) continue

      const message = update.message
      const userId = message.from?.id
      if (!userId) continue

      const messageDate = new Date(message.date * 1000)
      const dateStr = messageDate.toISOString().split('T')[0]
      const weekStr = `${messageDate.getFullYear()}-W${String(getWeek(messageDate)).padStart(2, '0')}`
      const monthStr = `${messageDate.getFullYear()}-${String(messageDate.getMonth() + 1).padStart(2, '0')}`
      latestDateStr = dateStr;

      if (!dailyActiveUsers[dateStr]) {
        dailyActiveUsers[dateStr] = new Set();
      }
      dailyActiveUsers[dateStr].add(userId);

      if (!userStats[userId]) {
        userStats[userId] = {
          user_id: userId,
          username: message.from.username || null,
          first_name: message.from.first_name || null,
          last_name: message.from.last_name || null,
          message_count: 0,
          first_message_date: dateStr,
          last_message_date: dateStr,
          messages_per_day: {},
          messages_per_week: {},
          messages_per_month: {},
          total_characters: 0,
          average_message_length: 0,
          media_count: 0,
          reply_count: 0,
          forward_count: 0,
          mention_count: 0,
          hashtag_count: 0,
          link_count: 0,
          voice_message_count: 0,
          sticker_count: 0,
          most_active_hour: 0,
          most_used_words: {},
          active_days: [],
          sentiment_score: 0,
          emoji_usage: {},
          topics: {},
          active_hours: {},
          interactions: {},
          total_messages: 0,
          new_users: 0,
        }
      }

      const stats = userStats[userId]
      stats.message_count++
      stats.last_message_date = dateStr
      stats.messages_per_day[dateStr] = (stats.messages_per_day[dateStr] || 0) + 1
      stats.messages_per_week[weekStr] = (stats.messages_per_week[weekStr] || 0) + 1
      stats.messages_per_month[monthStr] = (stats.messages_per_month[monthStr] || 0) + 1

      if (!stats.active_days.includes(dateStr)) {
        stats.active_days.push(dateStr);
      }

      if (message.text) {
        stats.total_characters += message.text.length
        const words = message.text.toLowerCase().split(/\s+/)
        words.forEach(word => {
          stats.most_used_words[word] = (stats.most_used_words[word] || 0) + 1
        })
      }

      if (message.photo || message.video || message.document) stats.media_count++
      if (message.reply_to_message) stats.reply_count++
      if (message.forward_date) stats.forward_count++
      if (message.entities) {
        message.entities.forEach(entity => {
          if (entity.type === 'mention') stats.mention_count++
          if (entity.type === 'hashtag') stats.hashtag_count++
          if (entity.type === 'url') stats.link_count++
        })
      }
      if (message.voice) stats.voice_message_count++
      if (message.sticker) stats.sticker_count++

      const hour = messageDate.getHours()
      stats.most_active_hour = hour

      stats.average_message_length = stats.total_characters / stats.message_count

      stats.sentiment_score += getSentimentScore(message.text || '');
      updateEmojiUsage(stats, message.text || '');
      updateTopics(stats, message.text || '');
      updateActiveHours(stats, messageDate);
      updateInteractions(stats, message);
    }

    // Calculate group-level stats
    const totalMessages = Object.values(userStats).reduce((acc, user) => acc + user.message_count, 0);
    const activeUsers = Object.keys(userStats).length;
    const newUsers = Object.values(userStats).filter(user => user.first_message_date === latestDateStr).length;

    // Update group stats in userStats
    Object.values(userStats).forEach(user => {
      user.total_messages = totalMessages;
      user.new_users = newUsers;
    });

    console.log(`Processed stats for ${Object.keys(userStats).length} users`)
  } catch (error) {
    console.error("Error in getTelegramStats:", error)
  }
  
  return Object.values(userStats)
}

function getSentimentScore(text: string): number {
  // Placeholder for sentiment analysis
  // Implement a proper sentiment analysis algorithm here
  return 0;
}

function updateEmojiUsage(stats: UserStats, text: string) {
  const emojiRegex = /[\p{Emoji_Presentation}\p{Emoji}\u{1F3FB}-\u{1F3FF}\u{1F9B0}-\u{1F9B3}]/gu;
  const emojis = text.match(emojiRegex) || [];
  emojis.forEach(emoji => {
    stats.emoji_usage[emoji] = (stats.emoji_usage[emoji] || 0) + 1;
  });
}

function updateTopics(stats: UserStats, text: string) {
  // Placeholder for topic detection
  // Implement a more sophisticated topic detection algorithm here
  const words = text.toLowerCase().split(/\s+/);
  words.forEach(word => {
    if (word.length > 5) { // Consider words longer than 5 characters as potential topics
      stats.topics[word] = (stats.topics[word] || 0) + 1;
    }
  });
}

function updateActiveHours(stats: UserStats, date: Date) {
  const hour = date.getHours().toString();
  stats.active_hours[hour] = (stats.active_hours[hour] || 0) + 1;
}

function updateInteractions(stats: UserStats, message: any) {
  if (message.reply_to_message) {
    const replyToId = message.reply_to_message.from?.id?.toString();
    if (replyToId) {
      stats.interactions[replyToId] = (stats.interactions[replyToId] || 0) + 1;
    }
  }
}

function getWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1))
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1)/7)
}

async function fetchExistingUserStats(userIds: number[]): Promise<Record<number, UserStats>> {
  const { data, error } = await supabase
    .from('telegram_user_activity')
    .select('*')
    .in('user_id', userIds)

  if (error) {
    console.error("Error fetching existing user stats:", error)
    return {}
  }

  const existingStats: Record<number, UserStats> = {}
  data.forEach((userStat: UserStats) => {
    existingStats[userStat.user_id] = userStat
  })

  return existingStats
}

async function updateTelegramStats() {
  console.log("Updating Telegram stats")
  try {
    const userStats = await getTelegramStats()
    console.log(`Retrieved stats for ${userStats.length} users`)

    if (userStats.length > 0) {
      const userIds = userStats.map(userStat => userStat.user_id)
      const existingStats = await fetchExistingUserStats(userIds)

      console.log("Upserting data into Supabase")
      for (const userStat of userStats) {
        const existingStat = existingStats[userStat.user_id]

        if (existingStat) {
          // Merge new stats with existing stats
          userStat.message_count += existingStat.message_count
          userStat.total_characters += existingStat.total_characters
          userStat.media_count += existingStat.media_count
          userStat.reply_count += existingStat.reply_count
          userStat.forward_count += existingStat.forward_count
          userStat.mention_count += existingStat.mention_count
          userStat.hashtag_count += existingStat.hashtag_count
          userStat.link_count += existingStat.link_count
          userStat.voice_message_count += existingStat.voice_message_count
          userStat.sticker_count += existingStat.sticker_count
          userStat.sentiment_score += existingStat.sentiment_score

          // Merge messages_per_day
          for (const [date, count] of Object.entries(existingStat.messages_per_day)) {
            userStat.messages_per_day[date] = (userStat.messages_per_day[date] || 0) + count
          }

          // Merge messages_per_week
          for (const [week, count] of Object.entries(existingStat.messages_per_week)) {
            userStat.messages_per_week[week] = (userStat.messages_per_week[week] || 0) + count
          }

          // Merge messages_per_month
          for (const [month, count] of Object.entries(existingStat.messages_per_month)) {
            userStat.messages_per_month[month] = (userStat.messages_per_month[month] || 0) + count
          }

          // Merge most_used_words
          for (const [word, count] of Object.entries(existingStat.most_used_words)) {
            userStat.most_used_words[word] = (userStat.most_used_words[word] || 0) + count
          }

          // Merge active_days
          userStat.active_days = Array.from(new Set([...userStat.active_days, ...existingStat.active_days]))

          // Merge emoji_usage
          for (const [emoji, count] of Object.entries(existingStat.emoji_usage)) {
            userStat.emoji_usage[emoji] = (userStat.emoji_usage[emoji] || 0) + count
          }

          // Merge topics
          for (const [topic, count] of Object.entries(existingStat.topics)) {
            userStat.topics[topic] = (userStat.topics[topic] || 0) + count
          }

          // Merge active_hours
          for (const [hour, count] of Object.entries(existingStat.active_hours)) {
            userStat.active_hours[hour] = (userStat.active_hours[hour] || 0) + count
          }

          // Merge interactions
          for (const [userId, count] of Object.entries(existingStat.interactions)) {
            userStat.interactions[userId] = (userStat.interactions[userId] || 0) + count
          }

          // Additional updates to ensure data integrity
          userStat.first_message_date = existingStat.first_message_date < userStat.first_message_date ? existingStat.first_message_date : userStat.first_message_date;
          userStat.last_message_date = existingStat.last_message_date > userStat.last_message_date ? existingStat.last_message_date : userStat.last_message_date;
          userStat.total_messages = Math.max(existingStat.total_messages, userStat.total_messages);
          userStat.new_users = Math.max(existingStat.new_users, userStat.new_users);
        }

        try {
          const { error } = await supabase
            .from('telegram_user_activity')
            .upsert(userStat, { onConflict: 'user_id' })

          if (error) {
            console.error("Supabase upsert error:", error)
          }
        } catch (upsertError) {
          console.error("Error upserting user stat:", upsertError)
        }
      }
      console.log(`Attempted to upsert ${userStats.length} records`)
    } else {
      console.log("No new updates to process")
    }

    return userStats.length
  } catch (error) {
    console.error('Error updating Telegram stats:', error)
    return 0
  }
}

async function continuousUpdateLoop() {
  const maxRuntime = 55 * 1000; // 55 seconds in milliseconds
  const startTime = Date.now();
  let updateCount = 0;

  while (Date.now() - startTime < maxRuntime) {
    try {
      const updatedRecords = await updateTelegramStats();
      updateCount += updatedRecords;
      console.log(`Total updates processed: ${updateCount}`);

      if (updatedRecords === 0) {
        // If no updates, wait for a short time before checking again
        await new Promise(resolve => setTimeout(resolve, 5000)); // 5 seconds
      } else {
        // If updates were processed, wait for a very short time before the next check
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second
      }
    } catch (error) {
      console.error('Error in continuous update loop:', error);
      // Wait for a short time before retrying
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  return updateCount;
}

Deno.serve(async (req) => {
  console.log("Edge function invoked")
  try {
    const totalUpdates = await continuousUpdateLoop();
    return new Response(JSON.stringify({
      message: 'Continuous update completed',
      total_updates_processed: totalUpdates,
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('Edge function error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
