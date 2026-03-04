const express = require('express');
const cors = require('cors');
const { paymentMiddleware } = require('x402-express');
const { getPropertyIntel } = require('./services/propertyIntel');
const { generateNarrative } = require('./services/narrative');
const { runInvestorAnalysis } = require('./services/investorAnalysis');

const app = express();
app.use(cors());
app.use(express.json());

const WALLET_ADDRESS = process.env.WALLET_ADDRESS || '0xYourWalletAddressHere';
const PRICE_PER_QUERY = process.env.PRICE_PER_QUERY || '0.05';

// âââ x402 Payment Middleware ââââââââââââââââââââââââââââââââââââââââââââ
app.use(
  paymentMiddleware(
    WALLET_ADDRESS,
    {
      '/property-intel':     { price: `$${PRICE_PER_QUERY}`,  network: 'base-mainnet', description: 'PropX402 â Property Intelligence Report' },
      '/property-investor':  { price: '$0.15',                network: 'base-mainnet', description: 'PropX402 â Investor Strategy Analysis (5 strategies)' },
      '/property-narrative': { price: '$0.10',                network: 'base-mainnet', description: 'PropX402 â AI Investment Narrative (Claude)' },
      '/property-full':      { price: '$0.25',                network: 'base-mainnet', description: 'PropX402 â Full Report: Intel + Investor + Narrative' },
      '/property-bulk':      { price: '$0.03',                network: 'base-mainnet', description: 'PropX402 â Bulk Property Intel (per address)' },
    },
    { url: 'https://x402.org/facilitator' }
  )
);

// âââ FREE: Health Check ââââââââââââââââââââââââââââââââââââââââââââââââââ
app.get('/health', (req, res) => {
  res.json({
    status: 'online', name: 'PropX402', version: '2.0.0',
    description: 'Real Estate Property Intelligence API for AI Agents â x402 Protocol',
    protocol: 'x402', network: 'base-mainnet',
    endpoints: {
      '/property-intel':     { price: '$0.05 USDC', method: 'POST', body: '{ address: string }', description: '14 data sources â property, flood, walkability, census, environment, hazards, broadband, jobs, disasters' },
      '/property-investor':  { price: '$0.15 USDC', method: 'POST', body: '{ address: string, condition?: string }', description: '5 strategy analyses: Fix & Flip, Co-Living, Sub-To, STR, BRRRR + derived metrics + hidden costs' },
      '/property-narrative': { price: '$0.10 USDC', method: 'POST', body: '{ address: string }', description: 'Claude-generated investment analysis' },
      '/property-full':      { price: '$0.25 USDC', method: 'POST', body: '{ address: string, condition?: string }', description: 'All three combined â complete investor intelligence package' },
      '/property-bulk':      { price: '$0.03 USDC/ea', method: 'POST', body: '{ addresses: string[] }', description: 'Up to 20 addresses' },
    },
    dataSources: ['OpenStreetMap', 'RentCast', 'FEMA', 'OSM Overpass', 'US Census ACS', 'EPA EJSCREEN', 'USGS', 'NOAA', 'FCC Broadband', 'HUD', 'FRED', 'BLS', 'OpenFEMA'],
    investorStrategies: ['Fix & Flip', 'Co-Living', 'Subject-To', 'Short-Term Rental', 'BRRRR'],
    powered_by: 'Big Bang Interactive LLC'
  });
});

// âââ FREE: Test endpoints (no payment) ââââââââââââââââââââââââââââââââââ
app.post('/test/property-intel', async (req, res) => {
  const { address } = req.body;
  if (!address) return res.status(400).json({ error: 'address is required' });
  try {
    const intel = await getPropertyIntel(address);
    res.json({ success: true, source: 'PropX402', mode: 'TEST', timestamp: new Date().toISOString(), query: address, data: intel });
  } catch (err) {
    res.status(500).json({ error: 'Intel fetch failed', detail: err.message });
  }
});

app.post('/test/property-investor', async (req, res) => {
  const { address, condition = 'average' } = req.body;
  if (!address) return res.status(400).json({ error: 'address is required' });
  try {
    const intel = await getPropertyIntel(address);
    const stateCode = intel.location?.stateCode || 'IA';
    const investor = runInvestorAnalysis(intel, stateCode, condition);
    res.json({ success: true, source: 'PropX402', mode: 'TEST', timestamp: new Date().toISOString(), query: address, data: { location: intel.location, property: intel.property, investorAnalysis: investor } });
  } catch (err) {
    res.status(500).json({ error: 'Investor analysis failed', detail: err.message });
  }
});

app.post('/test/property-full', async (req, res) => {
  const { address, condition = 'average' } = req.body;
  if (!address) return res.status(400).json({ error: 'address is required' });
  try {
    const intel = await getPropertyIntel(address);
    const stateCode = intel.location?.stateCode || 'IA';
    const investor = runInvestorAnalysis(intel, stateCode, condition);
    res.json({ success: true, source: 'PropX402', mode: 'TEST', timestamp: new Date().toISOString(), query: address, data: { ...intel, investorAnalysis: investor } });
  } catch (err) {
    res.status(500).json({ error: 'Full report failed', detail: err.message });
  }
});

// âââ FREE: MCP Discovery âââââââââââââââââââââââââââââââââââââââââââââââââ
app.get('/.well-known/mcp', (req, res) => {
  res.json({
    schema_version: '1.0', name: 'PropX402', description: 'Real estate property intelligence for AI agents',
    tools: [
      { name: 'get_property_intel', description: 'Get comprehensive property data including flood risk, walkability, demographics, hazards, broadband, job market', inputSchema: { type: 'object', properties: { address: { type: 'string' } }, required: ['address'] } },
      { name: 'get_property_investor', description: 'Get investor strategy analysis: Fix & Flip, Co-Living, Sub-To, STR, BRRRR with cash flow projections and hidden costs', inputSchema: { type: 'object', properties: { address: { type: 'string' }, condition: { type: 'string', enum: ['poor', 'fair', 'average', 'good', 'excellent'] } }, required: ['address'] } },
      { name: 'get_property_full', description: 'Get complete property intelligence + all investor strategies + AI narrative in one call', inputSchema: { type: 'object', properties: { address: { type: 'string' }, condition: { type: 'string' } }, required: ['address'] } },
      { name: 'get_property_bulk', description: 'Analyze up to 20 properties at once', inputSchema: { type: 'object', properties: { addresses: { type: 'array', items: { type: 'string' } } }, required: ['addresses'] } }
    ]
  });
});

// âââ PAID: Property Intelligence âââââââââââââââââââââââââââââââââââââââââ
app.post('/property-intel', async (req, res) => {
  const { address } = req.body;
  if (!address) return res.status(400).json({ error: 'address is required' });
  try {
    const intel = await getPropertyIntel(address);
    res.json({ success: true, source: 'PropX402', protocol: 'x402', network: 'base-mainnet', timestamp: new Date().toISOString(), query: address, data: intel });
  } catch (err) {
    res.status(500).json({ error: 'Intel fetch failed', detail: err.message });
  }
});

// âââ PAID: Investor Strategy Analysis ââââââââââââââââââââââââââââââââââââ
app.post('/property-investor', async (req, res) => {
  const { address, condition = 'average' } = req.body;
  if (!address) return res.status(400).json({ error: 'address is required' });
  try {
    const intel = await getPropertyIntel(address);
    const stateCode = intel.location?.stateCode || 'IA';
    const investor = runInvestorAnalysis(intel, stateCode, condition);
    res.json({ success: true, source: 'PropX402', protocol: 'x402', network: 'base-mainnet', timestamp: new Date().toISOString(), query: address, data: { location: intel.location, property: intel.property, neighborhood: intel.neighborhood, marketTrends: intel.marketTrends, investorAnalysis: investor } });
  } catch (err) {
    res.status(500).json({ error: 'Investor analysis failed', detail: err.message });
  }
});

// âââ PAID: AI Narrative âââââââââââââââââââââââââââââââââââââââââââââââââââ
app.post('/property-narrative', async (req, res) => {
  const { address } = req.body;
  if (!address) return res.status(400).json({ error: 'address is required' });
  try {
    const intel = await getPropertyIntel(address);
    const stateCode = intel.location?.stateCode || 'IA';
    const investor = runInvestorAnalysis(intel, stateCode, 'average');
    const narrative = await generateNarrative({ ...intel, investorAnalysis: investor });
    res.json({ success: true, source: 'PropX402', protocol: 'x402', network: 'base-mainnet', timestamp: new Date().toISOString(), query: address, data: { location: intel.location, property: intel.property, narrative } });
  } catch (err) {
    res.status(500).json({ error: 'Narrative generation failed', detail: err.message });
  }
});

// âââ PAID: Full Report (Intel + Investor + Narrative) ââââââââââââââââââââ
app.post('/property-full', async (req, res) => {
  const { address, condition = 'average' } = req.body;
  if (!address) return res.status(400).json({ error: 'address is required' });
  try {
    const intel = await getPropertyIntel(address);
    const stateCode = intel.location?.stateCode || 'IA';
    const investor = runInvestorAnalysis(intel, stateCode, condition);
    const narrative = await generateNarrative({ ...intel, investorAnalysis: investor });
    res.json({ success: true, source: 'PropX402', protocol: 'x402', network: 'base-mainnet', timestamp: new Date().toISOString(), query: address, data: { ...intel, investorAnalysis: investor, narrative } });
  } catch (err) {
    res.status(500).json({ error: 'Full report failed', detail: err.message });
  }
});

// âââ PAID: Bulk âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
app.post('/property-bulk', async (req, res) => {
  const { addresses } = req.body;
  if (!addresses || !Array.isArray(addresses)) return res.status(400).json({ error: 'addresses array required' });
  if (addresses.length > 20) return res.status(400).json({ error: 'Max 20 addresses per bulk request' });
  try {
    const results = await Promise.allSettled(addresses.map(a => getPropertyIntel(a)));
    res.json({ success: true, source: 'PropX402', protocol: 'x402', timestamp: new Date().toISOString(), count: addresses.length, results: results.map((r, i) => ({ address: addresses[i], status: r.status, data: r.value || null, error: r.reason?.message || null })) });
  } catch (err) {
    res.status(500).json({ error: 'Bulk request failed', detail: err.message });
  }
});

module.exports = app;
api/index.js
