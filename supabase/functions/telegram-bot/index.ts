// // Follow this setup guide to integrate the Deno language server with your editor:
// // https://deno.land/manual/getting_started/setup_your_environment
// // This enables autocomplete, go to definition, etc.

// import { serve } from "https://deno.land/std/http/server.ts";

// console.log(`Function "telegram-bot" up and running!`);

// import { Bot, webhookCallback } from "https://deno.land/x/grammy/mod.ts";


// const bot = new Bot(Deno.env.get("BOT_TOKEN") || "");

// bot.command("start", (ctx) => ctx.reply("Welcome! Bot is up and running."));

// bot.command("ping", (ctx) => ctx.reply(`Pong! ${new Date()} ${Date.now()}`));

// // bot.command("sendpost", (ctx) => ctx.reply(
// //   `Sending post! ${new Date()} ${Date.now()}`
// // ));

// // 
// // await bot.api.sendMessage(
// //   12345,
// //   '<b>Hi!</b> <i>Welcome</i> to <a href="https://grammy.dev">grammY</a>.',
// //   { parse_mode: "HTML" },
// // );

// // async function sendHelloToFoodSharingClubBot() {
// //   await bot.api.sendMessage(FoodSharingClubBot, "<i>Hello!</i>", {
// //     parse_mode: "HTML",
// //   });
// // }

// // async function sendHelloTo12345() {
// //   await bot.api.raw.sendMessage({
// //     chat_id: Deno.env.get("CHAT_ID"),
// //     text: "<i>Hello!</i>",
// //     parse_mode: "HTML",
// //   });
// // }

// // bot.command("test", async (ctx) => {
// //   await ctx.reply("Hi! I can only read messages that explicitly reply to me!", {
// //     // Make Telegram clients automatically show a reply interface to the user.
// //     reply_markup: { force_reply: true },
// //   });
// // });
  

// // await bot.api.sendMessage(
// //   12345,
// //   '<b>Hi!</b> <i>Welcome</i> to <a href="https://grammy.dev">grammY</a>.',
// //   { parse_mode: "HTML" },
// // );

// // Send statistics upon `/stats`
// // bot.command('stats', async ctx => {
// //   const stats = ctx.session

// //   // Format stats to string
// //   const message = `You sent <b>${
// //       stats.messages
// //   } messages</b> since I'm here! You edited messages <b>${
// //       stats.edits
// //   } times</b>—that is <b>${
// //       stats.edits / stats.messages
// //   } edits</b> per message on average!`

// //   // Send message in same chat using `reply` shortcut. Don't forget to `await`!
// //   await ctx.reply(message, { parse_mode: 'HTML' })
// // })

// const handleUpdate = webhookCallback(bot, "std/http");

// serve(async (req) => {
//   try {
//     const url = new URL(req.url);
//     if (url.searchParams.get("secret") !== Deno.env.get("FUNCTION_SECRET")) {
//       return new Response("not allowed", { status: 405 });
//     }

//     return await handleUpdate(req);
//   } catch (err) {
//     console.error(err);
//   }
// });

// // Start the bot.
// // bot.start();

// // sendHelloTo12345()

import { serve } from "https://deno.land/std@0.155.0/http/server.ts";
import { Bot } from "https://deno.land/x/grammy/mod.ts";


// serve((req: Request) => Response.json({ message: "Hello World" }));

// Create bot object
const bot = new Bot("1012227612:AAG7GIYQl37WQee_VNWdAsmZFvuWmjac-bw"); // <-- place your bot token inside this string

// Listen for messages
bot.command("start", (ctx) => ctx.reply("Welcome! Send me a photo!"));
bot.on("message:text", (ctx) => ctx.reply("That is text and not a photo!"));
bot.on("message:photo", (ctx) => ctx.reply("Nice photo! Is that you?"));
bot.on(
    "edited_message",
    (ctx) =>
        ctx.reply("Ha! Gotcha! You just edited this!", {
            reply_to_message_id: ctx.editedMessage.message_id,
        }),
);

// Launch!
bot.start();