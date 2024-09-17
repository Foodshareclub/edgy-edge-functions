import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Database } from "./types.ts";

console.log("Hello from `resend` function!");

type UserRecord = Database["auth"]["Tables"]["users"]["Row"];
interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  record: null | UserRecord;
  schema: "public";
  old_record: null | UserRecord;
}

const emailTemplate = (isDeleted: boolean, email: string) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${isDeleted ? "Sorry to see you go" : "Welcome to Foodshare.club"}</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      color: #363a57;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .container {
      background-color: #f3f2f5;
      border-radius: 8px;
      padding: 20px;
    }
    h1 {
      color: #363a57;
      text-align: center;
    }
    .logo {
      text-align: center;
      margin-bottom: 20px;
    }
    .cta-button {
      display: block;
      background-color: #ff2d55;
      color: white;
      padding: 10px 20px;
      text-decoration: none;
      border-radius: 8px;
      margin: 20px auto;
      text-align: center;
      font-weight: bold;
    }
    .footer {
      background-color: #ff2d55;
      color: white;
      text-align: center;
      padding: 20px;
      border-radius: 8px;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">
      <img src="https://i.ibb.co/d6sMFKD/Cover.png" alt="Foodshare Logo" width="504" style="max-width: 100%; height: auto;">
    </div>
    <h1>${isDeleted ? "We're Sad to See You Go" : "Welcome to Foodshare.club!"}</h1>
    <p>Hey ${email},</p>
    ${isDeleted 
      ? `<p>We're very sad to see you go. Your presence in our community will be missed. If there's anything we could have done better, please don't hesitate to let us know.</p>
         <p>Remember, you're always welcome back if you change your mind!</p>`
      : `<p>We're thrilled to have you join the Foodshare.club community! Get ready to embark on a journey of delicious discoveries and meaningful connections.</p>
         <p>Here's what you can do next:</p>
         <ul>
           <li>Complete your profile</li>
           <li>Explore local food sharing opportunities</li>
           <li>Connect with other food enthusiasts</li>
         </ul>`
    }
    <a href="${isDeleted ? 'https://eu-submit.jotform.com/231016600816041' : 'https://foodshare.club/food'}" class="cta-button">
      ${isDeleted ? 'Give Feedback' : 'Get Started'}
    </a>
    <p>Best regards,<br>The Foodshare Team</p>
  </div>
  <div class="footer">
    <p>&copy; Foodshare LLC © <span id="year">2024</span> USA 20231394981. All Rights Reserved.</p>
    <p>4632 Winding Way, Sacramento CA 95841</p>
    <p>If you have any questions please contact us at support@foodshare.club</p>
    <p>
      <a href="https://foodshare.club/" style="color: white;">Visit Us</a> | 
      <a href="https://app.gitbook.com/o/S1q71czYZ02oMxTaZgTT/s/XbVLvP6lx1ACYUl8wUUI/" style="color: white;">Privacy Policy</a> | 
      <a href="https://app.gitbook.com/o/S1q71czYZ02oMxTaZgTT/s/XbVLvP6lx1ACYUl8wUUI/terms-of-use" style="color: white;">Terms of Use</a>
    </p>
  </div>
</body>
</html>
`;

serve(async (req) => {
  try {
    const payload: WebhookPayload = await req.json();
    const newUser = payload.record;
    const deletedUser = payload.old_record;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
      },
      body: JSON.stringify({
        from: "Foodshare <support@foodshare.club>",
        to: [deletedUser?.email ?? newUser?.email],
        subject: deletedUser ? "Sorry to see you go" : "Welcome to Foodshare.club",
        html: emailTemplate(!!deletedUser, deletedUser?.email ?? newUser?.email ?? ""),
      }),
    });

    if (!res.ok) {
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        const errorData = await res.json();
        console.error("Error response from Resend API:", errorData);
        throw new Error(`Resend API error: ${JSON.stringify(errorData)}`);
      } else {
        const textContent = await res.text();
        console.error("Unexpected response from Resend API:", textContent);
        throw new Error(`Unexpected response from Resend API: ${res.status} ${res.statusText}`);
      }
    }

    const data = await res.json();
    console.log({ data });

    return new Response(JSON.stringify({ message: "Email sent successfully" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in resend function:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});