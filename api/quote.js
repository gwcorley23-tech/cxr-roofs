import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

// Simple rate limiter — 5 quote submissions per IP per 10 minutes
const rateLimitMap = new Map();
function isRateLimited(ip) {
  const now = Date.now();
  const window = 600_000;
  const max = 5;
  const timestamps = (rateLimitMap.get(ip) || []).filter(t => now - t < window);
  if (timestamps.length >= max) return true;
  timestamps.push(now);
  rateLimitMap.set(ip, timestamps);
  return false;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: "Too many requests. Please call us directly at (903) 258-1210." });
  }

  const { name, phone, city, service } = req.body;

  if (!name || !phone) {
    return res.status(400).json({ error: "Name and phone are required." });
  }

  const timestamp = new Date().toLocaleString("en-US", { timeZone: "America/Chicago" });

  try {
    await resend.emails.send({
      from: "CXR Roofing Website <onboarding@resend.dev>",
      to: ["info@cxrroofing.com"],
      subject: `New Quote Request — ${name} — ${service || "General Inquiry"}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f9f9f9;border-radius:8px;">
          <div style="background:#b51515;padding:16px 24px;border-radius:6px 6px 0 0;">
            <h2 style="color:#fff;margin:0;font-size:20px;">New Quote Request — CXR Roofing</h2>
          </div>
          <div style="background:#fff;padding:24px;border-radius:0 0 6px 6px;border:1px solid #e5e5e5;">
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;color:#666;width:120px;font-weight:bold;">Name</td><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;">${name}</td></tr>
              <tr><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;color:#666;font-weight:bold;">Phone</td><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;"><a href="tel:${phone.replace(/\D/g,"")}" style="color:#b51515;">${phone}</a></td></tr>
              <tr><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;color:#666;font-weight:bold;">City</td><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;">${city || "Not provided"}</td></tr>
              <tr><td style="padding:10px 0;color:#666;font-weight:bold;">Service</td><td style="padding:10px 0;">${service || "Not specified"}</td></tr>
            </table>
            <div style="margin-top:20px;padding:14px;background:#fff8f8;border-left:3px solid #b51515;border-radius:4px;">
              <p style="margin:0;color:#333;font-size:14px;">⏱ Received: ${timestamp} (CT) — Goal: call back within 1 hour</p>
            </div>
          </div>
        </div>
      `,
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Resend error:", err);
    return res.status(500).json({ error: "Failed to send. Please call us at (903) 258-1210." });
  }
}
