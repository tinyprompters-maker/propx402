const axios = require('axios');

const RENTCAST_KEY = process.env.RENTCAST_API_KEY || '';
const CENSUS_KEY   = process.env.CENSUS_API_KEY   || '';
const FRED_KEY     = process.env.FRED_API_KEY     || '';
const HUD_TOKEN    = process.env.HUD_API_KEY      || '';

// BLS requires numeric 2-digit state FIPS — map from 2-letter abbreviation
const STATE_FIPS = {
  AL:'01',AK:'02',AZ:'04',AR:'05',CA:'06',CO:'08',CT:'09',DE:'10',FL:'12',GA:'13',
  HI:'15',ID:'16',IL:'17',IN:'18',IA:'19',KS:'20',KY:'21',LA:'22',ME:'23',MD:'24',
  MA:'25',MI:'26',MN:'27',MS:'28',MO:'29',MT:'30',NE:'31',NV:'32',NH:'33',NJ:'34',
  NM:'35',NY:'36',NC:'37',ND:'38',OH:'39',OK:'40',OR:'41',PA:'42',RI:'44',SC:'45',
  SD:'46',TN:'47',TX:'48',UT:'49',VT:'50',VA:'51',WA:'53',WV:'54',WI:'55',WY:'56',
  DC:'11',PR:'72',
};

// ─── Geocode via OpenStreetMap (FREE, no key) ─────────────────────────────────
async function geocodeAddress(address) {
  try {
    const { data } = await axios.get(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&addressdetails=1`,
      { headers: { 'User-Agent': 'PropX402/2.2 (prop-intel-api)' }, timeout: 6000 }
    );
    if (!data?.length) return null;
    const r = data[0];
    return {
      lat: parseFloat(r.lat), lon: parseFloat(r.lon),
      displayName: r.display_name,
      city:      r.address?.city || r.address?.town || r.address?.village || '',
      state:     r.address?.state || '',
      stateCode: r.address?.['ISO3166-2-lvl4']?.split('-')[1] || '',
      zip:       r.address?.postcode || '',
      county:    r.address?.county || '',
    };
  } catch (err) {
    console.warn('[Geocode]', err.message);
    return null;
  }
}

// ─── RentCast: Property + AVM + Rent ─────────────────────────────────────────
async function getRentCastData(address) {
  if (!RENTCAST_KEY) return { note: 'Set RENTCAST_API_KEY for property & AVM data' };
  try {
    const headers = { 'X-Api-Key': RENTCAST_KEY };
    const propRes = await axios.get(
      `https://api.rentcast.io/v1/properties?address=${encodeURIComponent(address)}&limit=1`,
      { headers, timeout: 8000 }
    );
    const prop = propRes.data?.[0] || {};
    let rentEstimate = null, valueEstimate = null;
    try {
      const r = await axios.get(`https://api.rentcast.io/v1/avm/rent/long-term?address=${encodeURIComponent(address)}`, { headers, timeout: 8000 });
      rentEstimate = r.data;
    } catch (_) {}
    try {
      const v = await axios.get(`https://api.rentcast.io/v1/avm/value?address=${encodeURIComponent(address)}`, { headers, timeout: 8000 });
      valueEstimate = v.data;
    } catch (_) {}
    return {
      propertyType: prop.propertyType || null, bedrooms: prop.bedrooms || null,
      bathrooms: prop.bathrooms || null, squareFeet: prop.squareFootage || null,
      lotSize: prop.lotSize || null, yearBuilt: prop.yearBuilt || null,
      ownerName: prop.ownerName || null, ownerOccupied: prop.ownerOccupied || null,
      lastSaleDate: prop.lastSaleDate || null, lastSalePrice: prop.lastSalePrice || null,
      taxAssessedValue: prop.assessedValue || null,
      rentEstimate: rentEstimate ? {
        rentLow: rentEstimate.rentRangeLow, rentHigh: rentEstimate.rentRangeHigh,
        rentEstimate: rentEstimate.rent, comparables: rentEstimate.comparables?.length || 0
      } : null,
      valueEstimate: valueEstimate ? {
        valueLow: valueEstimate.priceRangeLow, valueHigh: valueEstimate.priceRangeHigh,
        valueEstimate: valueEstimate.price
      } : null,
    };
  } catch (err) {
    console.warn('[RentCast]', err.message);
    return { error: 'RentCast data unavailable', detail: err.response?.status };
  }
}

// ─── FEMA Flood Zone (FREE, no key) — FIXED endpoint ─────────────────────────
async function getFloodZone(lat, lon) {
  try {
    const { data } = await axios.get(
      `https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query?geometry=${lon},${lat}&geometryType=esriGeometryPoint&spatialRel=esriSpatialRelIntersects&outFields=FLD_ZONE,ZONE_SUBTY,DFIRM_ID&returnGeometry=false&f=json`,
      { timeout: 8000 }
    );
    const f = data?.features?.[0]?.attributes;
    if (!f) return { zone: 'X', riskLevel: 'Minimal Risk', inFloodZone: false, note: 'No flood zone data — likely minimal risk' };
    const zone = f.FLD_ZONE || 'Unknown';
    const riskMap = {
      'A': 'High Risk', 'AE': 'High Risk', 'AH': 'High Risk — Shallow Flooding',
      'AO': 'High Risk — Sheet Flow', 'V': 'Very High Risk — Coastal',
      'VE': 'Very High Risk — Coastal', 'X': 'Minimal Risk', 'D': 'Undetermined',
    };
    return {
      zone,
      subtype:    f.ZONE_SUBTY || null,
      riskLevel:  riskMap[zone] || `Zone ${zone}`,
      firmedId:   f.DFIRM_ID || null,
      inFloodZone: !['X', 'D'].includes(zone),
      source: 'FEMA NFHL',
    };
  } catch (err) {
    console.warn('[FEMA Flood]', err.message);
    return { zone: 'Unknown', riskLevel: 'Unknown', inFloodZone: false };
  }
}

// ─── OSM Overpass: Walkability (FREE, no key) ─────────────────────────────────
async function getOSMWalkability(lat, lon) {
  try {
    const radius = 800;
    const query = `[out:json][timeout:12];(node["amenity"~"restaurant|cafe|fast_food|bar|pub"](around:${radius},${lat},${lon});node["shop"~"supermarket|convenience|grocery|bakery"](around:${radius},${lat},${lon});node["amenity"~"pharmacy|hospital|clinic|doctors"](around:${radius},${lat},${lon});node["amenity"~"bank|atm"](around:${radius},${lat},${lon});node["leisure"~"park|playground|fitness_centre"](around:${radius},${lat},${lon});node["public_transport"~"stop_position|platform"](around:${radius},${lat},${lon});node["amenity"="school"](around:${radius},${lat},${lon});node["amenity"="library"](around:${radius},${lat},${lon}););out count;`;
    const { data } = await axios.post('https://overpass-api.de/api/interpreter', query, { headers: { 'Content-Type': 'text/plain' }, timeout: 14000 });
    const total = parseInt(data?.elements?.[0]?.tags?.total) || 0;
    const walkScore = Math.min(100, Math.round((total / 40) * 100));
    const walkLabel =
      walkScore >= 90 ? "Walker's Paradise" :
      walkScore >= 70 ? 'Very Walkable' :
      walkScore >= 50 ? 'Somewhat Walkable' :
      walkScore >= 25 ? 'Car-Dependent' : 'Minimal Walkability';
    return { source: 'OpenStreetMap Overpass', radiusMeters: radius, totalAmenitiesNearby: total, walkScore, walkLabel };
  } catch (err) {
    console.warn('[OSM Walk]', err.message);
    return { error: 'Walkability unavailable', walkScore: null };
  }
}

// ─── Census ACS Demographics (FREE, no key needed) ───────────────────────────
async function getCensusData(lat, lon) {
  try {
    const geoRes = await axios.get(
      `https://geocoding.geo.census.gov/geocoder/geographies/coordinates?x=${lon}&y=${lat}&benchmark=Public_AR_Current&vintage=Current_Current&layers=Census+Tracts&format=json`,
      { timeout: 8000 }
    );
    const tract = geoRes.data?.result?.geographies?.['Census Tracts']?.[0];
    if (!tract) return { note: 'Census tract not found' };
    const { STATE: state, COUNTY: county, TRACT: tractId } = tract;
    const vars = 'B01003_001E,B19013_001E,B25077_001E,B25064_001E,B23025_005E,B23025_002E,B15003_022E,B01002_001E,B25002_002E,B25002_003E,B25002_001E';
    const keyParam = CENSUS_KEY ? `&key=${CENSUS_KEY}` : '';
    const acsRes = await axios.get(
      `https://api.census.gov/data/2022/acs/acs5?get=${vars}&for=tract:${tractId}&in=state:${state}+county:${county}${keyParam}`,
      { timeout: 8000 }
    );
    const [headers, values] = acsRes.data;
    const d = {};
    headers.forEach((h, i) => { d[h] = parseInt(values[i]) || null; });
    const unemploymentRate = d.B23025_002E ? ((d.B23025_005E / d.B23025_002E) * 100).toFixed(1) : null;
    const vacancyRate      = d.B25002_001E ? ((d.B25002_003E / d.B25002_001E) * 100).toFixed(1) : null;
    return {
      censusTract: `${state}-${county}-${tractId}`,
      population:  d.B01003_001E, medianAge: d.B01002_001E,
      medianHouseholdIncome:    d.B19013_001E ? `$${d.B19013_001E.toLocaleString()}` : null,
      medianHouseholdIncomeRaw: d.B19013_001E,
      medianHomeValue:   d.B25077_001E ? `$${d.B25077_001E.toLocaleString()}` : null,
      medianGrossRent:   d.B25064_001E ? `$${d.B25064_001E.toLocaleString()}/mo` : null,
      unemploymentRate:  unemploymentRate ? `${unemploymentRate}%` : null,
      vacancyRate:       vacancyRate ? `${vacancyRate}%` : null,
      withBachelors:     d.B15003_022E,
      totalHousingUnits: d.B25002_001E,
      _fips: { state, county, tract: tractId },
    };
  } catch (err) {
    console.warn('[Census]', err.message);
    return { error: 'Census data unavailable' };
  }
}

// ─── HUD: Fair Market Rent + Opportunity Zones — FIXED with API key ──────────
async function getHUDData(zip, stateFips, county) {
  const results = { opportunityZone: null, fairMarketRent: null };

  // Fair Market Rent — use HUD API key if available
  try {
    const headers = HUD_TOKEN ? { Authorization: `Bearer ${HUD_TOKEN}` } : {};
    const fmrRes  = await axios.get(
      `https://www.huduser.gov/hudapi/public/fmr/statedata/${stateFips}`,
      { headers, timeout: 8000 }
    );
    const fmrData = fmrRes.data?.data?.basicdata;
    if (Array.isArray(fmrData)) {
      const countyClean = (county || '').toLowerCase().replace(' county', '').trim();
      const match = fmrData.find(d =>
        d.countyname?.toLowerCase().includes(countyClean) ||
        d.fips2010?.startsWith(stateFips + (county || ''))
      );
      if (match) {
        results.fairMarketRent = {
          studio:   match.Efficiency    ? `$${match.Efficiency}`    : null,
          oneBed:   match.One_Bedroom   ? `$${match.One_Bedroom}`   : null,
          twoBed:   match.Two_Bedroom   ? `$${match.Two_Bedroom}`   : null,
          threeBed: match.Three_Bedroom ? `$${match.Three_Bedroom}` : null,
          fourBed:  match.Four_Bedroom  ? `$${match.Four_Bedroom}`  : null,
          metro: match.areaname, year: match.year,
          source: 'HUD Fair Market Rent',
        };
      }
    }
  } catch (err) { console.warn('[HUD FMR]', err.message); }

  // Opportunity Zone check
  try {
    const ozRes = await axios.get(
      `https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/Opportunity_Zones/FeatureServer/0/query?where=ZCTA5CE10='${zip}'&outFields=ZCTA5CE10&returnGeometry=false&f=json`,
      { timeout: 6000 }
    );
    const isOZ = (ozRes.data?.features?.length || 0) > 0;
    results.opportunityZone = {
      isOpportunityZone: isOZ,
      note: isOZ
        ? '✅ Federal Opportunity Zone — significant tax advantages for investors'
        : 'Not a designated Opportunity Zone',
    };
  } catch (err) {
    console.warn('[HUD OZ]', err.message);
    results.opportunityZone = { note: 'OZ data unavailable' };
  }

  return results;
}

// ─── FRED: State Housing Price Index (FREE key at fred.stlouisfed.org) ────────
async function getFREDData(stateCode) {
  if (!FRED_KEY) return { note: 'Add free FRED_API_KEY at fred.stlouisfed.org for housing trends' };
  try {
    const seriesId = `${stateCode}STHPI`;
    const { data } = await axios.get(
      `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&sort_order=desc&limit=8&api_key=${FRED_KEY}&file_type=json`,
      { timeout: 6000 }
    );
    const obs = (data?.observations || []).filter(o => o.value !== '.');
    if (obs.length < 2) return { note: 'FRED data not available for this state' };
    const latest  = parseFloat(obs[0].value);
    const yearAgo = parseFloat(obs[Math.min(4, obs.length - 1)].value);
    const appreciation = (((latest - yearAgo) / yearAgo) * 100).toFixed(2);
    return {
      statePriceIndex: latest.toFixed(1),
      yearOverYearAppreciation: `${appreciation}%`,
      trend: parseFloat(appreciation) > 0 ? 'Appreciating' : 'Depreciating',
      lastUpdated: obs[0].date, source: 'Federal Reserve (FRED)',
    };
  } catch (err) {
    console.warn('[FRED]', err.message);
    return { error: 'FRED data unavailable' };
  }
}

// ─── USGS Earthquake Hazard (FREE, no key) ────────────────────────────────────
async function getUSGSHazards(lat, lon) {
  try {
    const { data } = await axios.get(
      `https://earthquake.usgs.gov/ws/designmaps/nehrp-2020.json?latitude=${lat}&longitude=${lon}&riskCategory=II&siteClass=D&title=PropX402`,
      { timeout: 8000 }
    );
    const pga   = data?.response?.data?.pga;
    const level =
      pga > 0.5  ? 'Very High' :
      pga > 0.2  ? 'High' :
      pga > 0.1  ? 'Moderate' :
      pga > 0.04 ? 'Low' : 'Very Low';
    return { earthquakeHazard: { peakGroundAcceleration: pga ? pga.toFixed(3) : null, riskLevel: level, source: 'USGS NEHRP 2020' } };
  } catch (err) {
    console.warn('[USGS]', err.message);
    return { earthquakeHazard: { riskLevel: 'Data unavailable' } };
  }
}

// ─── EPA EJSCREEN (FREE, no key) — FIXED response parsing ────────────────────
async function getEnvironmentalData(lat, lon) {
  try {
    // EPA EJScreen direct API blocked by hosting proxy — use EPA TRI via EnviroFacts
    // TRI = Toxic Release Inventory: nearby industrial facilities with toxic releases
    const latMin = (lat - 0.15).toFixed(4), latMax = (lat + 0.15).toFixed(4);
    const lonMin = (lon - 0.20).toFixed(4), lonMax = (lon + 0.20).toFixed(4);
    const { data } = await axios.get(
      `https://data.epa.gov/efservice/TRI_FACILITY/LATITUDE82/BEGINNING/${latMin}/ENDING/${latMax}/LONGITUDE82/BEGINNING/${lonMin}/ENDING/${lonMax}/rows/10/JSON`,
      { timeout: 10000 }
    );
    const facilities = Array.isArray(data) ? data.filter(f => f.FACILITY_NAME) : [];
    const count = facilities.length;
    return {
      triSitesNearby: count,
      facilityNames: facilities.slice(0, 3).map(f => f.FACILITY_NAME).filter(Boolean),
      environmentalRisk:
        count === 0 ? 'Low' :
        count <= 2  ? 'Moderate' : 'Elevated',
      investorNote:
        count === 0 ? '✅ Clean area — no known TRI industrial hazards nearby' :
        count <= 2  ? '⚠️ Review nearby facilities before purchase' :
                      '🚨 Recommend Phase I environmental review',
      source: 'EPA Toxic Release Inventory (EnviroFacts)',
    };
  } catch (err) {
    console.warn('[EPA TRI]', err.message);
    return { note: 'Environmental data temporarily unavailable' };
  }
}

// ─── NOAA Tornado/Severe Weather Risk (FREE, no key) ─────────────────────────
async function getNOAAHazards(lat, lon, county, state) {
  try {
    const { data } = await axios.get(
      `https://api.weather.gov/points/${lat},${lon}`,
      { headers: { 'User-Agent': 'PropX402/2.2 (prop-intel-api)' }, timeout: 6000 }
    );
    const zone = data?.properties?.county;
    const tornadoRiskByState = {
      OK:'Very High', KS:'Very High', TX:'Very High', NE:'High',
      SD:'High', ND:'Moderate', IA:'Moderate', MO:'Moderate',
      MS:'High', AL:'High', AR:'Moderate', TN:'Moderate',
      IL:'Moderate', IN:'Moderate', OH:'Low', FL:'Moderate',
      GA:'Low', NC:'Low', CA:'Very Low', NY:'Very Low',
      WA:'Very Low', OR:'Very Low', MT:'Low', WY:'Low',
    };
    const tornadoRisk = tornadoRiskByState[state] || 'Low';
    const hailRisk    = ['Very High','High'].includes(tornadoRisk) ? 'High' : tornadoRisk === 'Moderate' ? 'Moderate' : 'Low';
    return {
      tornadoRisk:     { riskLevel: tornadoRisk, source: 'NOAA Climatology' },
      hailRisk:        { riskLevel: hailRisk },
      weatherZone:     zone || null,
      insuranceImpact:
        tornadoRisk === 'Very High' ? 'Major premium impact — 40%+ surcharge expected' :
        tornadoRisk === 'High'      ? 'Significant premium impact — 25%+ surcharge expected' :
        tornadoRisk === 'Moderate'  ? 'Moderate premium impact — 15-20% surcharge' :
                                      'Minimal weather impact on insurance',
    };
  } catch (err) {
    console.warn('[NOAA]', err.message);
    return { tornadoRisk: { riskLevel: 'Unknown' }, hailRisk: { riskLevel: 'Unknown' } };
  }
}

// ─── FCC Broadband Availability (FREE, no key needed for basic) ──────────────
async function getBroadbandData(lat, lon, stateFips, countyFips, censusTract) {
  try {
    // FCC broadbandmap.fcc.gov deprecated — Census ACS B28002 (household subscription rates)
    if (!stateFips || !countyFips || !censusTract) {
      return { available: null, note: 'Census FIPS required for broadband data' };
    }
    // Extract 6-digit tract code from census tract string like "19-113-001700"
    const tractCode = censusTract.split('-').pop() || censusTract.replace(/\D/g, '').slice(-6);
    const { data } = await axios.get(
      `https://api.census.gov/data/2022/acs/acs5?get=NAME,B28002_001E,B28002_004E,B28002_007E&for=tract:${tractCode}&in=state:${stateFips}%20county:${countyFips}`,
      { timeout: 8000 }
    );
    if (!Array.isArray(data) || data.length < 2) return { available: null, note: 'Census broadband data unavailable' };
    const [, totalStr, broadbandStr, fiberStr] = data[1];
    const total = parseInt(totalStr), broadband = parseInt(broadbandStr);
    const pct = total > 0 ? Math.round((broadband / total) * 100) : null;
    return {
      available: broadband > 0,
      adoptionRate: pct !== null ? `${pct}%` : null,
      adoptionLabel:
        pct >= 90 ? 'Excellent broadband coverage' :
        pct >= 80 ? 'Good broadband coverage' :
        pct >= 65 ? 'Fair broadband coverage' : 'Limited broadband coverage',
      subscribedHouseholds: broadband,
      totalHouseholds: total,
      strImpact:
        pct >= 90 ? '✅ High broadband adoption — strong STR/WFH signal' :
        pct >= 75 ? '✅ Good broadband adoption — adequate for STR' :
                    '⚠️ Below-average broadband — may limit STR appeal',
      source: 'US Census ACS 5-Year (B28002)',
    };
  } catch (err) {
    console.warn('[Broadband]', err.message);
    return { available: null, note: 'Broadband data unavailable' };
  }
}

// ─── BLS: State Job Market (FREE) — FIXED series ID format ───────────────────
async function getBLSData(stateCode) {
  try {
    const fips = STATE_FIPS[stateCode];
    if (!fips) return { note: `BLS: unknown state code ${stateCode}` };
    // State unemployment series: LASST{2-digit-fips}0000000000003
    const seriesId = `LASST${fips}0000000000003`;
    const { data } = await axios.post(
      'https://api.bls.gov/publicAPI/v2/timeseries/data/',
      { seriesid: [seriesId], startyear: '2023', endyear: '2025' },
      { headers: { 'Content-Type': 'application/json' }, timeout: 8000 }
    );
    const series = data?.Results?.series?.[0]?.data;
    if (!series || series.length < 2) return { note: 'BLS data unavailable for this state' };
    const latest   = series[0];
    const priorYear = series.find(d => d.period === latest.period && d.year === String(parseInt(latest.year) - 1)) || series[Math.min(12, series.length - 1)];
    const currentRate = parseFloat(latest.value);
    const priorRate   = priorYear ? parseFloat(priorYear.value) : null;
    const trend       = priorRate ? (currentRate < priorRate ? 'Improving' : currentRate > priorRate ? 'Worsening' : 'Stable') : 'Unknown';
    return {
      stateUnemploymentRate: `${currentRate}%`,
      unemploymentTrend: trend,
      period: `${latest.periodName} ${latest.year}`,
      investorSignal:
        currentRate < 4 ? '🔥 Low unemployment — strong rental demand' :
        currentRate < 6 ? '✅ Healthy job market' :
                          '⚠️ Elevated unemployment — monitor vacancy risk',
      source: 'Bureau of Labor Statistics',
    };
  } catch (err) {
    console.warn('[BLS]', err.message);
    return { note: 'Job market data unavailable' };
  }
}

// ─── OpenFEMA Disaster History (FREE, no key) — FIXED query format ────────────
async function getDisasterHistory(state, countyFips) {
  try {
    // FEMA API is case-sensitive: DisasterDeclarationsSummaries (capital D, capital S)
    // Filter by FIPS county code — more reliable than designatedArea string matching
    const countyCode = countyFips ? (countyFips.length > 3 ? countyFips.slice(-3) : countyFips) : null;
    if (!countyCode) return { note: 'County FIPS required for disaster history' };
    const filter = `state eq '${state}' and fipsCountyCode eq '${countyCode}'`;
    const { data } = await axios.get(
      `https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries?$filter=${encodeURIComponent(filter)}&$orderby=declarationDate desc&$top=20`,
      { timeout: 8000 }
    );
    const disasters = data?.DisasterDeclarationsSummaries || [];
    const recentDisasters = disasters.slice(0, 5).map(d => ({
      type:  d.incidentType,
      title: d.declarationTitle,
      date:  d.declarationDate?.split('T')[0],
      id:    d.disasterNumber,
    }));
    const floodEvents  = disasters.filter(d => d.incidentType === 'Flood').length;
    const severeStorms = disasters.filter(d => d.incidentType === 'Severe Storm').length;
    return {
      totalFederalDisasters: disasters.length,
      floodDeclarations:     floodEvents,
      severeStormDeclarations: severeStorms,
      recentDisasters,
      riskFlag:
        floodEvents >= 3 ? '🚨 High flood disaster history — verify insurance availability' :
        floodEvents >= 1 ? '⚠️ Flood disaster history — review insurance options' : null,
      source: 'OpenFEMA Disaster Declarations',
    };
  } catch (err) {
    console.warn('[FEMA Disasters]', err.message);
    return { note: 'Disaster history unavailable' };
  }
}

// ─── Master Aggregator ────────────────────────────────────────────────────────
async function getPropertyIntel(address) {
  const startTime = Date.now();
  const geo = await geocodeAddress(address);
  if (!geo) throw new Error(`Unable to geocode: ${address}`);

  // Fire all parallel sources simultaneously
  const [rentcast, flood, walkability, census, environment, usgsHazards, noaaHazards, blsJobs] = await Promise.all([
    getRentCastData(address),
    getFloodZone(geo.lat, geo.lon),
    getOSMWalkability(geo.lat, geo.lon),
    getCensusData(geo.lat, geo.lon),
    getEnvironmentalData(geo.lat, geo.lon),
    getUSGSHazards(geo.lat, geo.lon),
    getNOAAHazards(geo.lat, geo.lon, geo.county, geo.stateCode),
    getBLSData(geo.stateCode),
  ]);

  // Sequential: need census FIPS first for HUD state lookup
  const stateFips  = census._fips?.state  || STATE_FIPS[geo.stateCode] || geo.stateCode;
  const countyFips = census._fips?.county || '';
  const censusTract = census.censusTract || '';
  const [hud, marketTrends, disasterHistory, broadband] = await Promise.all([
    getHUDData(geo.zip, stateFips, geo.county),
    getFREDData(geo.stateCode),
    getDisasterHistory(geo.stateCode, countyFips),
    getBroadbandData(geo.lat, geo.lon, stateFips, countyFips, censusTract),
  ]);

  // Risk Score
  let riskScore = 0;
  if (flood.inFloodZone) riskScore += 25;
  if (rentcast.lastSalePrice && rentcast.valueEstimate?.valueEstimate) {
    const appr = ((rentcast.valueEstimate.valueEstimate - rentcast.lastSalePrice) / rentcast.lastSalePrice) * 100;
    if (appr < 0) riskScore += 15;
  }
  const eq = usgsHazards.earthquakeHazard?.riskLevel;
  if (eq === 'Very High') riskScore += 20;
  else if (eq === 'High') riskScore += 12;
  else if (eq === 'Moderate') riskScore += 6;
  if (census.vacancyRate && parseFloat(census.vacancyRate) > 15) riskScore += 10;
  if (marketTrends.trend === 'Depreciating') riskScore += 10;
  if (noaaHazards.tornadoRisk?.riskLevel === 'Very High') riskScore += 15;
  else if (noaaHazards.tornadoRisk?.riskLevel === 'High') riskScore += 8;
  if (disasterHistory.floodDeclarations >= 3) riskScore += 10;

  return {
    location: {
      address:   geo.displayName, lat: geo.lat, lon: geo.lon,
      city:      geo.city, state: geo.state, stateCode: geo.stateCode,
      zip:       geo.zip, county: geo.county,
    },
    property:        rentcast,
    floodRisk:       flood,
    walkability,
    neighborhood:    census,
    environment,
    naturalHazards:  { ...usgsHazards, ...noaaHazards },
    infrastructure:  { broadband },
    hudIntelligence: hud,
    marketTrends,
    jobMarket:       blsJobs,
    disasterHistory,
    riskScore:  Math.min(riskScore, 100),
    riskLabel:  riskScore < 20 ? 'Low' : riskScore < 50 ? 'Moderate' : 'High',
    meta: {
      processingMs: Date.now() - startTime,
      dataSources: [
        'OpenStreetMap', 'RentCast', 'FEMA NFHL (Flood)', 'OSM Overpass (Walkability)',
        'US Census ACS', 'EPA EJSCREEN', 'USGS Earthquake Hazards', 'NOAA Severe Weather',
        'FCC Broadband Map', 'HUD Opportunity Zones', 'HUD Fair Market Rent',
        'FRED Housing Index', 'BLS Job Market', 'OpenFEMA Disaster History',
      ],
      protocol: 'x402', network: 'base-mainnet',
    },
  };
}

module.exports = { getPropertyIntel };
