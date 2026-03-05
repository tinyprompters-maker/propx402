const https = require('https');

const GEMINI_MODEL = 'gemini-3.1-flash-lite-preview';
const GEMINI_URL   = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

function geminiPost(apiKey, prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature:      0.4,
        maxOutputTokens:  2000,
        responseMimeType: 'application/json',
      },
    });

    const url  = `${GEMINI_URL}?key=${apiKey}`;
    const opts = {
      method:  'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 20000,
    };

    const req = https.request(url, opts, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (data.error) return reject(new Error(`Gemini API error ${data.error.code}: ${data.error.message}`));
          const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          resolve(text);
        } catch (e) {
          reject(new Error('Failed to parse Gemini response'));
        }
      });
    });

    req.on('timeout', () => { req.destroy(); reject(new Error('Gemini request timed out')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function generateNarrative(fullData) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const address = fullData?.location?.address
    || fullData?.location?.formattedAddress
    || 'Unknown address';

  const prompt = `You are PropX402, an expert real estate intelligence analyst.
Generate a comprehensive, agent-ready property narrative for an AI real estate agent.

Property Address: ${address}

Raw Intelligence Data:
${JSON.stringify(fullData, null, 2)}

Write a structured property narrative that includes:

1. **Property Overview** — Key physical attributes, age, type, size
2. **Market Position** — Current estimated value vs last sale, appreciation trajectory
3. **Investment Profile** — Rent estimate, cap rate potential, cash flow outlook
4. **Location Intelligence** — Walkability, transit, neighborhood demographics, trajectory
5. **Risk Assessment** — Flood risk, environmental concerns, overall risk rating
6. **Comparable Context** — How this property fits in the local market
7. **Agent Recommendation** — Is this worth deeper due diligence? Key questions to investigate

Be specific with numbers. Flag data gaps honestly. Write for an AI agent making autonomous decisions.

Respond ONLY with a valid JSON object (no markdown, no backticks) with these exact keys:
overview, marketPosition, investmentProfile, locationIntel, riskAssessment, comparableContext, agentRecommendation, keyMetrics`;

  const text = await geminiPost(apiKey, prompt);

  try {
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(clean);
  } catch {
    return { narrative: text };
  }
}

module.exports = { generateNarrative };
