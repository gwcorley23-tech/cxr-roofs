import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const rateLimitMap = new Map();
function isRateLimited(ip) {
  const now = Date.now();
  const window = 600_000; // 10 min
  const max = 5;
  const timestamps = (rateLimitMap.get(ip) || []).filter(t => now - t < window);
  if (timestamps.length >= max) return true;
  timestamps.push(now);
  rateLimitMap.set(ip, timestamps);
  return false;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
  if (isRateLimited(ip)) return res.status(429).json({ error: "Too many photo uploads. Please wait before trying again." });

  const { image } = req.body;
  if (!image || !image.startsWith("data:image/")) {
    return res.status(400).json({ error: "Valid image required" });
  }

  const match = image.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) return res.status(400).json({ error: "Invalid image format" });

  const [, mediaType, base64Data] = match;

  try {
    const msg = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64Data }
          },
          {
            type: "text",
            text: `You are an expert roofing estimator for CXR Roofing, a veteran-owned Texas company. Analyze this roof photo for damage, wear, and insurance claim eligibility.

Respond ONLY with a valid JSON object, no markdown, no extra text:
{
  "overallCondition": "excellent|good|fair|poor|critical",
  "damageLevel": 0-10,
  "damageTypes": ["hail","wind","missing shingles","granule loss","flashing","gutters","ridge","soffit","fascia","storm debris"],
  "affectedAreas": ["front slope","rear slope","ridge","valleys","eaves","chimney flashing","gutters"],
  "estimatedAge": "X-Y years",
  "urgency": "immediate|within 30 days|within 90 days|routine maintenance",
  "insuranceClaim": true or false,
  "claimNotes": "one sentence on why claim is/isn't recommended",
  "talkingPoints": ["finding 1", "finding 2", "finding 3"],
  "estimatedRepairRange": { "low": 0, "high": 0 },
  "summary": "2-3 sentence plain English assessment",
  "reply": "A conversational response from Zach at CXR Roofing — warm, direct, Texas-style, no markdown. Reference what you actually see in the photo. Tell them what it means, whether they should call insurance, and what the next step is. 3-5 sentences max."
}`
          }
        ]
      }]
    });

    const text = msg.content.find(c => c.type === "text")?.text || "";
    let assessment;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      assessment = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    } catch {
      return res.status(502).json({ error: "Could not parse AI response", reply: "I had trouble reading that photo clearly. Try texting it directly to (903) 258-1210 and we'll take a look." });
    }

    return res.status(200).json(assessment);
  } catch (err) {
    console.error("Analyze API error:", err);
    return res.status(500).json({ error: "Analysis failed", reply: "Had trouble analyzing that one. Text the photo to (903) 258-1210 and I'll take a look personally." });
  }
}
