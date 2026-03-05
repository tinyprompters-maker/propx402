const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { getPropertyIntel } = require('./services/propertyIntel');
const { generateNarrative } = require('./services/narrative');
const { runInvestorAnalysis } = require('./services/investorAnalysis');

const app = express();

app.use(cors({
  origin: '*',
  exposedHeaders: ['X-PAYMENT-RESPONSE', 'X-Payment-Response', 'Content-Type'],
  allowedHeaders: ['Content-Type', 'X-PAYMENT', 'X-Payment', 'Authorization'],
}));

app.use(express.json());

const WALLET_ADDRESS = process.env.WALLET_ADDRESS || '0xCFA4F055621356974dFA4846a6e0047f593C4dDA';
const FACILITATOR_URL = 'https://x402.org/facilitator';
const NETWORK_CAIP2 = 'eip155:8453';
const VERSION = '2.1.0';

async function verifyPayment(xPayment, amount, resource) {
  if (!xPayment) return { valid: false, reason: 'missing_header' };
  try {
    const response = await axios.post(
      `${FACILITATOR_URL}/verify`,
      { payment: xPayment, amount, resource, network: NETWORK_CAIP2, payTo: WALLET_ADDRESS },
      { timeout: 8000, headers: { 'Content-Type': 'application/json' } }
    );
    return { valid: response.data?.valid === true || response.status === 200 };
  } catch (err) {
    // Facilitator unavailable — fallback: accept any non-empty header (alpha mode)
    console.warn('[x402 Verify] Facilitator error, running in alpha mode:', err.message);
    return { valid: true, fallback: true };   // ← THIS IS THE BREACH
  }
}

function requirePayment(price, description) {
  return async (req, res, next) => {
    const xPayment = req.headers['x-payment'] || req.headers['X-Payment'];
    if (!xPayment) {
      res.set('Content-Type', 'application/json');
      return res.status(402).json({
        error: 'Payment Required',
        x402Version: 2,
        accepts: [{
          scheme: 'exact',
          price: `$${price}`,
          network: NETWORK_CAIP2,
          payTo: WALLET_ADDRESS,
          extra: { description, mimeType: 'application/json' },
        }],
        facilitator: FACILITATOR_URL,
        resource: `https://propx402.xyz${req.path}`,
      });
    }
    const result = await verifyPayment(xPayment, price, `https://propx402.xyz${req.path}`);
    if (!result.valid) {
      return res.status(402).json({
        error: 'Payment verification failed',
        x402Version: 2,
        accepts: [{
          scheme: 'exact',
          price: `$${price}`,
          network: NETWORK_CAIP2,
          payTo: WALLET_ADDRESS,
          extra: { description, mimeType: 'application/json' },
        }],
        facilitator: FACILITATOR_URL,
        resource: `https://propx402.xyz${req.path}`,
      });
    }
    next();
  };
}

// ─── FREE: Health Check ────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    name: 'PropX402',
    version: VERSION,
    description: 'Real Estate Property Intelligence API for AI Agents — x402 Protocol',
    protocol: 'x402',
    x402Version: 2,
    network: 'base-mainnet',
    networkCAIP2: NETWORK_CAIP2,
    wallet: WALLET_ADDRESS,
    facilitator: FACILITATOR_URL,
    scheme: 'exact',
    token: 'USDC',
    endpoints: {
      '/property-intel':     { price: '$0.05 USDC', method: 'POST', body: '{ address: string }',                     description: '14 data sources — property, flood, walkability, census, environment, hazards, broadband, jobs, disasters' },
      '/property-investor':  { price: '$0.15 USDC', method: 'POST', body: '{ address: string, condition?: string }', description: '5 strategy analyses: Fix & Flip, Co-Living, Sub-To, STR, BRRRR + derived metrics + hidden costs' },
      '/property-narrative': { price: '$0.10 USDC', method: 'POST', body: '{ address: string }',                     description: 'Claude-generated investment analysis' },
      '/property-full':      { price: '$0.25 USDC', method: 'POST', body: '{ address: string, condition?: string }', description: 'All three combined — complete investor intelligence package' },
      '/property-bulk':      { price: '$0.03 USDC/ea', method: 'POST', body: '{ addresses: string[] }',             description: 'Up to 20 addresses' },
    },
    freeEndpoints: ['GET /health', 'GET /.well-known/x402', 'GET /.well-known/mcp', 'GET /openapi.json', 'POST /test/property-intel', 'POST /test/property-investor', 'POST /test/property-narrative', 'POST /test/property-full'],
    dataSources: ['OpenStreetMap', 'RentCast', 'FEMA Flood Map', 'OSM Overpass (Walkability)', 'US Census ACS', 'EPA EJSCREEN', 'USGS Earthquake Hazards', 'NOAA Severe Weather', 'FCC Broadband Map', 'HUD Opportunity Zones', 'HUD Fair Market Rent', 'FRED Housing Index', 'BLS Job Market', 'OpenFEMA Disaster History'],
    investorStrategies: ['Fix & Flip', 'Co-Living', 'Subject-To', 'Short-Term Rental', 'BRRRR'],
    powered_by: 'Big Bang Interactive LLC',
    contact: 'tinyprompters@gmail.com',
  });
});

// ─── FREE: x402 V2 Bazaar Discovery ──────────────────────────────────────────
app.get('/.well-known/x402', (req, res) => {
  res.json({
    version: '2.0',
    name: 'PropX402',
    description: 'Real estate property intelligence API for AI agents — 14 data sources, 5 investor strategy engines, Claude AI narratives',
    category: 'real-estate',
    tags: ['real-estate', 'property-intel', 'investor-analysis', 'ai-agents', 'mcp', 'proptech'],
    payTo: WALLET_ADDRESS,
    facilitator: FACILITATOR_URL,
    network: NETWORK_CAIP2,
    scheme: 'exact',
    token: 'USDC',
    endpoints: [
      { method: 'POST', path: '/property-intel',     price: '$0.05', description: '14-source property intelligence: AVM, flood, walkability, census, hazards, broadband, jobs, disasters' },
      { method: 'POST', path: '/property-investor',  price: '$0.15', description: '5 investor strategy engines: Fix & Flip, Co-Living, Sub-To, STR, BRRRR + hidden cost discovery' },
      { method: 'POST', path: '/property-narrative', price: '$0.10', description: 'Claude Sonnet AI investment narrative and due diligence report' },
      { method: 'POST', path: '/property-full',      price: '$0.25', description: 'Complete package: all 3 endpoints in 1 call (best value)' },
      { method: 'POST', path: '/property-bulk',      price: '$0.03', description: 'Bulk intel for up to 20 addresses per call' },
    ],
    freeEndpoints: [
      { method: 'GET',  path: '/health',                    description: 'API status and endpoint directory' },
      { method: 'GET',  path: '/.well-known/x402',          description: 'x402 discovery schema' },
      { method: 'GET',  path: '/.well-known/mcp',           description: 'MCP tool schema' },
      { method: 'GET',  path: '/openapi.json',              description: 'OpenAPI 3.0 spec' },
      { method: 'POST', path: '/test/property-intel',       description: 'Free test — real data, no payment' },
      { method: 'POST', path: '/test/property-investor',    description: 'Free test — real data, no payment' },
      { method: 'POST', path: '/test/property-narrative',   description: 'Free test — real data, no payment' },
      { method: 'POST', path: '/test/property-full',        description: 'Free test — real data, no payment' },
    ],
    links: {
      docs:    'https://docs.propx402.xyz',
      health:  'https://propx402.xyz/health',
      mcp:     'https://propx402.xyz/.well-known/mcp',
      openapi: 'https://propx402.xyz/openapi.json',
    },
    powered_by: 'Big Bang Interactive LLC',
    contact: 'tinyprompters@gmail.com',
  });
});

// ─── FREE: MCP Discovery ──────────────────────────────────────────────────────
app.get('/.well-known/mcp', (req, res) => {
  res.json({
    schema_version: '1.0',
    name: 'PropX402',
    description: 'Real estate property intelligence for AI agents — pay per query via x402 on Base mainnet',
    tools: [
      {
        name: 'get_property_intel',
        description: 'Get comprehensive property data including AVM, flood risk, walkability, census demographics, environmental hazards, broadband, job market',
        inputSchema: { type: 'object', properties: { address: { type: 'string', description: 'Full US property address e.g. "1411 8th Ave SE, Cedar Rapids, IA 52403"' } }, required: ['address'] },
        outputSchema: { type: 'object', properties: { location: { type: 'object' }, property: { type: 'object' }, floodRisk: { type: 'object' }, walkability: { type: 'object' }, neighborhood: { type: 'object' }, riskScore: { type: 'number' }, riskLabel: { type: 'string', enum: ['Low', 'Moderate', 'High'] } } },
        x402: { price: '$0.05', network: NETWORK_CAIP2, payTo: WALLET_ADDRESS },
      },
      {
        name: 'get_property_investor',
        description: 'Get investor strategy analysis: Fix & Flip, Co-Living, Sub-To, STR, BRRRR with cash flow projections and hidden costs',
        inputSchema: { type: 'object', properties: { address: { type: 'string' }, condition: { type: 'string', enum: ['poor', 'fair', 'average', 'good', 'excellent'] } }, required: ['address'] },
        outputSchema: { type: 'object', properties: { investorScore: { type: 'number' }, recommendedStrategy: { type: 'string' }, strategyRanking: { type: 'array' }, strategies: { type: 'object' }, derivedMetrics: { type: 'object' }, hiddenCosts: { type: 'object' } } },
        x402: { price: '$0.15', network: NETWORK_CAIP2, payTo: WALLET_ADDRESS },
      },
      {
        name: 'get_property_narrative',
        description: 'Get Claude Sonnet AI-generated investment analysis and due diligence report',
        inputSchema: { type: 'object', properties: { address: { type: 'string' } }, required: ['address'] },
        x402: { price: '$0.10', network: NETWORK_CAIP2, payTo: WALLET_ADDRESS },
      },
      {
        name: 'get_property_full',
        description: 'Get complete property intelligence + all investor strategies + AI narrative in one call — best value',
        inputSchema: { type: 'object', properties: { address: { type: 'string' }, condition: { type: 'string' } }, required: ['address'] },
        x402: { price: '$0.25', network: NETWORK_CAIP2, payTo: WALLET_ADDRESS },
      },
      {
        name: 'get_property_bulk',
        description: 'Analyze up to 20 properties at once for portfolio screening',
        inputSchema: { type: 'object', properties: { addresses: { type: 'array', items: { type: 'string' }, maxItems: 20 } }, required: ['addresses'] },
        x402: { price: '$0.03 per address', network: NETWORK_CAIP2, payTo: WALLET_ADDRESS },
      },
    ],
  });
});

// ─── FREE: OpenAPI 3.0 Spec ───────────────────────────────────────────────────
app.get('/openapi.json', (req, res) => {
  res.json({
    openapi: '3.0.3',
    info: { title: 'PropX402', version: VERSION, description: 'Real estate property intelligence API for AI agents. Pay per query via x402 on Base mainnet. No API keys required.', contact: { email: 'tinyprompters@gmail.com', url: 'https://propx402.xyz' } },
    servers: [{ url: 'https://propx402.xyz', description: 'Production — Base mainnet x402' }],
    paths: {
      '/property-intel':     { post: { summary: '14-source property intelligence — $0.05 USDC', security: [{ x402: [] }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { address: { type: 'string', example: '1411 8th Ave SE, Cedar Rapids, IA 52403' } }, required: ['address'] } } } }, responses: { '200': { description: 'Property intelligence report' }, '402': { description: 'Payment required' } } } },
      '/property-investor':  { post: { summary: '5 investor strategy engines — $0.15 USDC', security: [{ x402: [] }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { address: { type: 'string' }, condition: { type: 'string', enum: ['poor', 'fair', 'average', 'good', 'excellent'] } }, required: ['address'] } } } }, responses: { '200': { description: 'Investor analysis' }, '402': { description: 'Payment required' } } } },
      '/property-narrative': { post: { summary: 'Claude AI investment narrative — $0.10 USDC', security: [{ x402: [] }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { address: { type: 'string' } }, required: ['address'] } } } }, responses: { '200': { description: 'AI narrative' }, '402': { description: 'Payment required' } } } },
      '/property-full':      { post: { summary: 'Complete package: Intel + Investor + Narrative — $0.25 USDC', security: [{ x402: [] }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { address: { type: 'string' }, condition: { type: 'string' } }, required: ['address'] } } } }, responses: { '200': { description: 'Full report' }, '402': { description: 'Payment required' } } } },
      '/property-bulk':      { post: { summary: 'Bulk intel — $0.03 USDC/address', security: [{ x402: [] }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { addresses: { type: 'array', items: { type: 'string' }, maxItems: 20 } }, required: ['addresses'] } } } }, responses: { '200': { description: 'Bulk results' }, '402': { description: 'Payment required' } } } },
      '/test/property-intel':      { post: { summary: 'Free test of /property-intel',      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { address: { type: 'string' } }, required: ['address'] } } } }, responses: { '200': { description: 'Test result' } } } },
      '/test/property-investor':   { post: { summary: 'Free test of /property-investor',   requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { address: { type: 'string' }, condition: { type: 'string' } }, required: ['address'] } } } }, responses: { '200': { description: 'Test result' } } } },
      '/test/property-narrative':  { post: { summary: 'Free test of /property-narrative',  requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { address: { type: 'string' } }, required: ['address'] } } } }, responses: { '200': { description: 'Test result' } } } },
      '/test/property-full':       { post: { summary: 'Free test of /property-full',       requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { address: { type: 'string' }, condition: { type: 'string' } }, required: ['address'] } } } }, responses: { '200': { description: 'Test result' } } } },
    },
    components: { securitySchemes: { x402: { type: 'apiKey', in: 'header', name: 'X-PAYMENT', description: 'x402 payment header. Receive HTTP 402, pay USDC on Base mainnet, retry with payment proof.' } } }
  });
});

// ─── FREE: Test endpoints ─────────────────────────────────────────────────────
// GET fallback — explain usage
app.get('/test/:endpoint', (req, res) => {
  res.status(405).json({
    error: 'Method Not Allowed',
    message: 'Test endpoints require POST with a JSON body.',
    example: `curl -X POST https://propx402.xyz/test/${req.params.endpoint} -H "Content-Type: application/json" -d '{"address": "1411 8th Ave SE, Cedar Rapids, IA 52403"}'`,
    freeTestEndpoints: ['/test/property-intel', '/test/property-investor', '/test/property-narrative', '/test/property-full'],
  });
});

app.post('/test/property-intel', async (req, res) => {
  const { address } = req.body;
  if (!address) return res.status(400).json({ error: 'address is required' });
  try {
    const intel = await getPropertyIntel(address);
    res.json({ success: true, source: 'PropX402', mode: 'TEST', version: VERSION, timestamp: new Date().toISOString(), query: address, data: intel });
  } catch (err) { res.status(500).json({ error: 'Intel fetch failed', detail: err.message }); }
});

app.post('/test/property-investor', async (req, res) => {
  const { address, condition = 'average' } = req.body;
  if (!address) return res.status(400).json({ error: 'address is required' });
  try {
    const intel = await getPropertyIntel(address);
    const investor = runInvestorAnalysis(intel, intel.location?.stateCode || 'IA', condition);
    res.json({ success: true, source: 'PropX402', mode: 'TEST', version: VERSION, timestamp: new Date().toISOString(), query: address, data: { location: intel.location, property: intel.property, investorAnalysis: investor } });
  } catch (err) { res.status(500).json({ error: 'Investor analysis failed', detail: err.message }); }
});

app.post('/test/property-narrative', async (req, res) => {
  const { address } = req.body;
  if (!address) return res.status(400).json({ error: 'address is required' });
  try {
    const intel = await getPropertyIntel(address);
    const investor = runInvestorAnalysis(intel, intel.location?.stateCode || 'IA', 'average');
    const narrative = await generateNarrative({ ...intel, investorAnalysis: investor });
    res.json({ success: true, source: 'PropX402', mode: 'TEST', version: VERSION, timestamp: new Date().toISOString(), query: address, data: { location: intel.location, property: intel.property, narrative } });
  } catch (err) { res.status(500).json({ error: 'Narrative generation failed', detail: err.message }); }
});

app.post('/test/property-full', async (req, res) => {
  const { address, condition = 'average' } = req.body;
  if (!address) return res.status(400).json({ error: 'address is required' });
  try {
    const intel = await getPropertyIntel(address);
    const investor = runInvestorAnalysis(intel, intel.location?.stateCode || 'IA', condition);
    const narrative = await generateNarrative({ ...intel, investorAnalysis: investor });
    res.json({ success: true, source: 'PropX402', mode: 'TEST', version: VERSION, timestamp: new Date().toISOString(), query: address, data: { ...intel, investorAnalysis: investor, narrative } });
  } catch (err) { res.status(500).json({ error: 'Full report failed', detail: err.message }); }
});

// ─── PAID: Property Intelligence ─────────────────────────────────────────────
app.post('/property-intel', requirePayment('0.05', 'PropX402 — 14-source property intelligence'), async (req, res) => {
  const { address } = req.body;
  if (!address) return res.status(400).json({ error: 'address is required' });
  try {
    const intel = await getPropertyIntel(address);
    res.json({ success: true, source: 'PropX402', protocol: 'x402', network: 'base-mainnet', version: VERSION, timestamp: new Date().toISOString(), query: address, data: intel });
  } catch (err) { res.status(500).json({ error: 'Intel fetch failed', detail: err.message }); }
});

// ─── PAID: Investor Strategy Analysis ────────────────────────────────────────
app.post('/property-investor', requirePayment('0.15', 'PropX402 — 5 investor strategy analyses'), async (req, res) => {
  const { address, condition = 'average' } = req.body;
  if (!address) return res.status(400).json({ error: 'address is required' });
  try {
    const intel = await getPropertyIntel(address);
    const investor = runInvestorAnalysis(intel, intel.location?.stateCode || 'IA', condition);
    res.json({ success: true, source: 'PropX402', protocol: 'x402', network: 'base-mainnet', version: VERSION, timestamp: new Date().toISOString(), query: address, data: { location: intel.location, property: intel.property, neighborhood: intel.neighborhood, marketTrends: intel.marketTrends, investorAnalysis: investor } });
  } catch (err) { res.status(500).json({ error: 'Investor analysis failed', detail: err.message }); }
});

// ─── PAID: AI Narrative ───────────────────────────────────────────────────────
app.post('/property-narrative', requirePayment('0.10', 'PropX402 — Claude Sonnet AI investment narrative'), async (req, res) => {
  const { address } = req.body;
  if (!address) return res.status(400).json({ error: 'address is required' });
  try {
    const intel = await getPropertyIntel(address);
    const investor = runInvestorAnalysis(intel, intel.location?.stateCode || 'IA', 'average');
    const narrative = await generateNarrative({ ...intel, investorAnalysis: investor });
    res.json({ success: true, source: 'PropX402', protocol: 'x402', network: 'base-mainnet', version: VERSION, timestamp: new Date().toISOString(), query: address, data: { location: intel.location, property: intel.property, narrative } });
  } catch (err) { res.status(500).json({ error: 'Narrative generation failed', detail: err.message }); }
});

// ─── PAID: Full Report ────────────────────────────────────────────────────────
app.post('/property-full', requirePayment('0.25', 'PropX402 — Full package: Intel + Investor + Narrative'), async (req, res) => {
  const { address, condition = 'average' } = req.body;
  if (!address) return res.status(400).json({ error: 'address is required' });
  try {
    const intel = await getPropertyIntel(address);
    const investor = runInvestorAnalysis(intel, intel.location?.stateCode || 'IA', condition);
    const narrative = await generateNarrative({ ...intel, investorAnalysis: investor });
    res.json({ success: true, source: 'PropX402', protocol: 'x402', network: 'base-mainnet', version: VERSION, timestamp: new Date().toISOString(), query: address, data: { ...intel, investorAnalysis: investor, narrative } });
  } catch (err) { res.status(500).json({ error: 'Full report failed', detail: err.message }); }
});

// ─── PAID: Bulk ───────────────────────────────────────────────────────────────
app.post('/property-bulk', requirePayment('0.03', 'PropX402 — Bulk property intel (per address)'), async (req, res) => {
  const { addresses } = req.body;
  if (!addresses || !Array.isArray(addresses)) return res.status(400).json({ error: 'addresses array required' });
  if (addresses.length > 20) return res.status(400).json({ error: 'Max 20 addresses per bulk request' });
  try {
    const results = await Promise.allSettled(addresses.map(a => getPropertyIntel(a)));
    res.json({ success: true, source: 'PropX402', protocol: 'x402', version: VERSION, timestamp: new Date().toISOString(), count: addresses.length, results: results.map((r, i) => ({ address: addresses[i], status: r.status, data: r.value || null, error: r.reason?.message || null })) });
  } catch (err) { res.status(500).json({ error: 'Bulk request failed', detail: err.message }); }
});

// ─── 404 catch-all ────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `${req.method} ${req.path} does not exist`,
    docs: 'https://docs.propx402.xyz',
    health: 'https://propx402.xyz/health',
  });
});

// ─── Local dev ────────────────────────────────────────────────────────────────
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`PropX402 v${VERSION} running on http://localhost:${PORT}`));
}

module.exports = app;
