import "https://deno.land/x/dotenv/load.ts";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { Bot, webhookCallback } from "https://deno.land/x/grammy@v1.14.1/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const botToken = Deno.env.get('BOT_TOKEN');
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const GROUP_ID = Deno.env.get('GROUP_ID');

console.log('Environment variables loaded');
console.log('BOT_TOKEN:', botToken?.substring(0, 5) + '...');
console.log('SUPABASE_URL:', supabaseUrl);
console.log('GROUP_ID:', GROUP_ID);

if (!botToken || !supabaseUrl || !supabaseKey || !GROUP_ID) {
  throw new Error("Missing required environment variables");
}

const supabase = createClient(supabaseUrl, supabaseKey);
const bot = new Bot(botToken);

console.log('Supabase client and bot initialized');

bot.on('message', async (ctx) => {
  console.log('Received message:', ctx.message);
  const userId = ctx.from.id;
  const username = ctx.from.username || ctx.from.first_name;
  const messageDate = new Date(ctx.message.date * 1000);

  console.log(`Processing message from user ${userId} (${username}) at ${messageDate}`);

  // Update telegram_user_activity
  const { error } = await supabase
    .from('telegram_user_activity')
    .upsert({ 
      user_id: userId, 
      username: username,
      message_count: 1,
      last_message_date: messageDate,
      messages_per_day: {
        [messageDate.toISOString().split('T')[0]]: 1
      },
    }, { 
      onConflict: 'user_id',
      update: { 
        message_count: supabase.rpc('increment', { column: 'message_count', amount: 1 }),
        last_message_date: messageDate,
        messages_per_day: supabase.rpc('jsonb_set', {
          field: 'messages_per_day',
          path: `{${messageDate.toISOString().split('T')[0]}}`,
          value: `(coalesce(messages_per_day->'${messageDate.toISOString().split('T')[0]}', '0')::int + 1)::text::jsonb`
        })
      }
    });

  if (error) console.error('Error updating telegram_user_activity:', error);
  else console.log(`Updated activity for user ${userId}`);
});

const handler = webhookCallback(bot, 'std/http');

serve(async (req) => {
  console.log('Received request:', req.method, req.url);
  console.log('Headers:', Object.fromEntries(req.headers));
  
  if (req.method === 'POST') {
    try {
      console.log('Received POST request');
      const body = await req.json();
      console.log('Request body:', JSON.stringify(body));

      // Create a new request with the same body to pass to the handler
      const newReq = new Request(req.url, {
        method: req.method,
        headers: req.headers,
        body: JSON.stringify(body),
      });

      return await handler(newReq);
    } catch (err) {
      console.error('Error processing webhook:', err);
      return new Response(`Error processing webhook: ${err.message}`, { status: 500 });
    }
  }
  console.log('Received non-POST request');
  return new Response('Expected a POST request', { status: 405 });
});