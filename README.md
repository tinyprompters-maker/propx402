# PropX402 🏠⚡

**Real estate property intelligence API for AI agents — pay per query via x402 on Base mainnet.**

No API keys. No subscriptions. AI agents send a request, get a 402, pay $0.05–$0.25 in USDC, get data.

Live at **[propx402.xyz](https://propx402.xyz)** · Built by [Big Bang Interactive LLC](https://bigbanginteractive.io)

---

## What it does

- **14 data sources** aggregated in parallel: AVM, flood risk, walkability, Census ACS, EPA EJSCREEN, USGS hazards, NOAA disasters, FCC broadband, HUD Opportunity Zones, FRED economic data, BLS job market, OpenFEMA
- **5 investor strategy engines**: Fix & Flip, Co-Living, Subject-To, Short-Term Rental (STR), BRRRR — each with cash flow projections, hidden cost discovery, regulatory intel
- **Claude AI narratives**: Sonnet-powered investment analysis and due diligence reports

---

## Endpoints

| Endpoint | Price | Description |
|---|---|---|
| `POST /property-intel` | $0.05 | 14-source property intelligence |
| `POST /property-investor` | $0.15 | 5 investor strategy analyses |
| `POST /property-narrative` | $0.10 | Claude AI investment narrative |
| `POST /property-full` | $0.25 | All three in one call (best value) |
| `POST /property-bulk` | $0.03/ea | Up to 20 addresses |

**Free:** `GET /health` · `GET /.well-known/x402` · `GET /.well-known/mcp` · `GET /openapi.json` · `POST /test/*`

---

## Quick Start — Free Test (no payment required)

```bash
curl -X POST https://propx402.xyz/test/property-intel \
  -H "Content-Type: application/json" \
  -d '{"address": "1411 8th Ave SE, Cedar Rapids, IA 52403"}'
```

```bash
curl -X POST https://propx402.xyz/test/property-full \
  -H "Content-Type: application/json" \
  -d '{"address": "1411 8th Ave SE, Cedar Rapids, IA 52403", "condition": "average"}'
```

---

## Production Usage (x402)

```javascript
import { wrapFetchWithPayment } from '@x402/fetch';
import { ExactEvmScheme } from '@x402/evm/exact/client';

const wallet = // your Base wallet signer
const x402Fetch = wrapFetchWithPayment(fetch, [
  { network: 'eip155:8453', scheme: new ExactEvmScheme(wallet) }
]);

const res = await x402Fetch('https://propx402.xyz/property-intel', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ address: '1411 8th Ave SE, Cedar Rapids, IA 52403' })
});
const data = await res.json();
```

---

## Claude Desktop / MCP Integration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "propx402": {
      "command": "npx",
      "args": ["mcp-remote", "https://propx402.xyz/.well-known/mcp"]
    }
  }
}
```

---

## Environment Setup

```bash
cp .env.example .env
# Fill in your keys, then:
npm install
npm start
```

See `.env.example` for all required variables.

---

## x402 Discovery

- **Health:** https://propx402.xyz/health
- **x402 Bazaar:** https://propx402.xyz/.well-known/x402
- **MCP Schema:** https://propx402.xyz/.well-known/mcp
- **OpenAPI:** https://propx402.xyz/openapi.json

---

*PropX402 · Big Bang Interactive LLC · Cedar Rapids, IA · [@ChuckYouSuck](https://x.com/ChuckYouSuck)*
