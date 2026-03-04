const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function generateNarrative(address, intel) {
  const prompt = `You are PropX402, an expert real estate intelligence analyst. 
Generate a comprehensive, agent-ready property narrative for an AI real estate agent.

Property Address: ${address}

Raw Intelligence Data:
${JSON.stringify(intel, null, 2)}

Write a structured property narrative that includes:

1. **Property Overview** â Key physical attributes, age, type, size
2. **Market Position** â Current estimated value vs last sale, appreciation trajectory  
3. **Investment Profile** â Rent estimate, cap rate potential, cash flow outlook
4. **Location Intelligence** â Walkability, transit, neighborhood demographics, trajectory
5. **Risk Assessment** â Flood risk, environmental concerns, overall risk rating
6. **Comparable Context** â How this property fits in the local market
7. **Agent Recommendation** â Is this worth deeper due diligence? Key questions to investigate

Be specific with numbers. Flag data gaps honestly. Write for an AI agent making autonomous decisions.
Format as clean JSON with keys: overview, marketPosition, investmentProfile, locationIntel, riskAssessment, comparableContext, agentRecommendation, keyMetrics.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }]
  });

  const text = response.content[0].text;

  // Try to parse as JSON, fall back to raw text
  try {
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(clean);
  } catch {
    return { narrative: text };
  }
}

module.exports = { generateNarrative };
