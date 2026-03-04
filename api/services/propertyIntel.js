const axios = require('axios');

const RENTCAST_KEY = process.env.RENTCAST_API_KEY || '';
const CENSUS_KEY = process.env.CENSUS_API_KEY || '';
const FRED_KEY = process.env.FRED_API_KEY || '';

// âââ Geocode via OpenStreetMap (FREE, no key) âââââââââââââââââââââââââââââ
async function geocodeAddress(address) {
  try {
    const { data } = await axios.get(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&addressdetails=1`,
      { headers: { 'User-Agent': 'PropX402/1.0 (prop-intel-api)' }, timeout: 6000 }
    );
    if (!data?.length) return null;
    const r = data[0];
    return {
      lat: parseFloat(r.lat), lon: parseFloat(r.lon),
      displayName: r.display_name,
      city: r.address?.city || r.address?.town || r.address?.village || '',
      state: r.address?.state || '',
      stateCode: r.address?.['ISO3166-2-lvl4']?.split('-')[1] || '',
      zip: r.address?.postcode || '',
      county: r.address?.county || ''
    };
  } catch (err) {
    console.warn('[Geocode]', err.message);
    return null;
  }
}

// âââ RentCast: Property + AVM + Rent âââââââââââââââââââââââââââââââââââââ
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
      } : null
    };
  } catch (err) {
    console.warn('[RentCast]', err.message);
    return { error: 'RentCast data unavailable', detail: err.response?.status };
  }
}

// âââ FEMA Flood Zone (FREE, no key) ââââââââââââââââââââââââââââââââââââââ
async function getFloodZone(lat, lon) {
  try {
    const { data } = await axios.get(
      `https://msc.fema.gov/arcgis/rest/services/NFHL/MapService/query?geometry=${lon},${lat}&geometryType=esriGeometryPoint&spatialRel=esriSpatialRelIntersects&outFields=FLD_ZONE,ZONE_SUBTY,DFIRM_ID&returnGeometry=false&f=json`,
      { timeout: 6000 }
    );
    const f = data?.features?.[0]?.attributes;
    if (!f) return { zone: 'Unknown', riskLevel: 'Unknown', inFloodZone: false };
    const zone = f.FLD_ZONE || 'Unknown';
    const riskMap = { 'A': 'High Risk', 'AE': 'High Risk', 'AH': 'High Risk â Shallow', 'AO': 'High Risk â Sheet Flow', 'X': 'Minimal Risk', 'D': 'Undetermined', 'V': 'Very High â Coastal' };
    return { zone, subtype: f.ZONE_SUBTY || null, riskLevel: riskMap[zone] || `Zone ${zone}`, firmedId: f.DFIRM_ID || null, inFloodZone: !['X', 'D'].includes(zone) };
  } catch (err) {
    console.warn('[FEMA]', err.message);
    return { zone: 'Unavailable', inFloodZone: false };
  }
}

// âââ OSM Overpass: Real Walkability (FREE, no key) ââââââââââââââââââââââââ
async function getOSMWalkability(lat, lon) {
  try {
    const radius = 800;
    const query = `[out:json][timeout:12];(node["amenity"~"restaurant|cafe|fast_food|bar|pub"](around:${radius},${lat},${lon});node["shop"~"supermarket|convenience|grocery|bakery"](around:${radius},${lat},${lon});node["amenity"~"pharmacy|hospital|clinic|doctors"](around:${radius},${lat},${lon});node["amenity"~"bank|atm"](around:${radius},${lat},${lon});node["leisure"~"park|playground|fitness_centre"](around:${radius},${lat},${lon});node["public_transport"~"stop_position|platform"](around:${radius},${lat},${lon});node["amenity"="school"](around:${radius},${lat},${lon});node["amenity"="library"](around:${radius},${lat},${lon}););out count;`;
    const { data } = await axios.post('https://overpass-api.de/api/interpreter', query, { headers: { 'Content-Type': 'text/plain' }, timeout: 14000 });
    const total = parseInt(data?.elements?.[0]?.tags?.total) || 0;
    const walkScore = Math.min(100, Math.round((total / 40) * 100));
    const walkLabel = walkScore >= 90 ? "Walker's Paradise" : walkScore >= 70 ? 'Very Walkable' : walkScore >= 50 ? 'Somewhat Walkable' : walkScore >= 25 ? 'Car-Dependent' : 'Minimal Walkability';
    return { source: 'OpenStreetMap Overpass', radiusMeters: radius, totalAmenitiesNearby: total, walkScore, walkLabel };
  } catch (err) {
    console.warn('[OSM Walk]', err.message);
    return { error: 'Walkability unavailable', walkScore: null };
  }
}

// âââ Census ACS Demographics (FREE, no key needed) âââââââââââââââââââââââ
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
    const vacancyRate = d.B25002_001E ? ((d.B25002_003E / d.B25002_001E) * 100).toFixed(1) : null;
    return {
      censusTract: `${state}-${county}-${tractId}`,
      population: d.B01003_001E, medianAge: d.B01002_001E,
      medianHouseholdIncome: d.B19013_001E ? `$${d.B19013_001E.toLocaleString()}` : null,
      medianHouseholdIncomeRaw: d.B19013_001E,
      medianHomeValue: d.B25077_001E ? `$${d.B25077_001E.toLocaleString()}` : null,
      medianGrossRent: d.B25064_001E ? `$${d.B25064_001E.toLocaleString()}/mo` : null,
      unemploymentRate: unemploymentRate ? `${unemploymentRate}%` : null,
      vacancyRate: vacancyRate ? `${vacancyRate}%` : null,
      withBachelors: d.B15003_022E, totalHousingUnits: d.B25002_001E,
      _fips: { state, county, tract: tractId }
    };
  } catch (err) {
    console.warn('[Census]', err.message);
    return { error: 'Census data unavailable' };
  }
}

// âââ HUD: Fair Market Rent + Opportunity Zones (FREE, no key) ââââââââââââ
async function getHUDData(zip, state, county) {
  const results = { opportunityZone: null, fairMarketRent: null };
  try {
    const fmrRes = await axios.get(`https://www.huduser.gov/hudapi/public/fmr/statedata/${state}`, { timeout: 6000 });
    const fmrData = fmrRes.data?.data?.basicdata;
    if (Array.isArray(fmrData)) {
      const match = fmrData.find(d =>
        d.countyname?.toLowerCase().includes((county || '').toLowerCase().replace(' county', '')) ||
        d.fips2010?.startsWith(state + county)
      );
      if (match) {
        results.fairMarketRent = {
          studio: match.Efficiency ? `$${match.Efficiency}` : null,
          oneBed: match.One_Bedroom ? `$${match.One_Bedroom}` : null,
          twoBed: match.Two_Bedroom ? `$${match.Two_Bedroom}` : null,
          threeBed: match.Three_Bedroom ? `$${match.Three_Bedroom}` : null,
          fourBed: match.Four_Bedroom ? `$${match.Four_Bedroom}` : null,
          metro: match.areaname, year: match.year
        };
      }
    }
  } catch (err) { console.warn('[HUD FMR]', err.message); }

  try {
    const ozRes = await axios.get(
      `https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/Opportunity_Zones/FeatureServer/0/query?where=ZCTA5CE10='${zip}'&outFields=ZCTA5CE10&returnGeometry=false&f=json`,
      { timeout: 6000 }
    );
    const isOZ = (ozRes.data?.features?.length || 0) > 0;
    results.opportunityZone = {
      isOpportunityZone: isOZ,
      note: isOZ ? 'â Federal Opportunity Zone â significant tax advantages for investors' : 'Not a designated Opportunity Zone'
    };
  } catch (err) {
    console.warn('[HUD OZ]', err.message);
    results.opportunityZone = { note: 'OZ data unavailable' };
  }
  return results;
}

// âââ FRED: State Housing Price Index (FREE key at fred.stlouisfed.org) ââââ
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
    const latest = parseFloat(obs[0].value);
    const yearAgo = parseFloat(obs[Math.min(4, obs.length - 1)].value);
    const appreciation = (((latest - yearAgo) / yearAgo) * 100).toFixed(2);
    return {
      statePriceIndex: latest.toFixed(1),
      yearOverYearAppreciation: `${appreciation}%`,
      trend: parseFloat(appreciation) > 0 ? 'Appreciating' : 'Depreciating',
      lastUpdated: obs[0].date, source: 'Federal Reserve (FRED)'
    };
  } catch (err) {
    console.warn('[FRED]', err.message);
    return { error: 'FRED data unavailable' };
  }
}

// âââ USGS Earthquake Hazard (FREE, no key) ââââââââââââââââââââââââââââââââ
async function getUSGSHazards(lat, lon) {
  try {
    const { data } = await axios.get(
      `https://earthquake.usgs.gov/ws/designmaps/nehrp-2020.json?latitude=${lat}&longitude=${lon}&riskCategory=II&siteClass=D&title=PropX402`,
      { timeout: 8000 }
    );
    const pga = data?.response?.data?.pga;
    const level = pga > 0.5 ? 'Very High' : pga > 0.2 ? 'High' : pga > 0.1 ? 'Moderate' : pga > 0.04 ? 'Low' : 'Very Low';
    return { earthquakeHazard: { peakGroundAcceleration: pga ? pga.toFixed(3) : null, riskLevel: level, source: 'USGS NEHRP 2020' } };
  } catch (err) {
    console.warn('[USGS]', err.message);
    return { earthquakeHazard: { riskLevel: 'Data unavailable' } };
  }
}

// âââ EPA Environmental Justice (FREE, no key) ââââââââââââââââââââââââââââ
async function getEnvironmentalData(lat, lon) {
  try {
    const { data } = await axios.get(
      `https://ejscreen.epa.gov/mapper/ejscreenRESTbroker.aspx?namestr=&geometry={"x":${lon},"y":${lat},"spatialReference":{"wkid":4326}}&distance=1&unit=9035&areatype=&areaid=&f=pjson`,
      { timeout: 8000 }
    );
    const props = data?.data?.properties;
    if (!props) return { note: 'EPA data not available for location' };
    return {
      airQualityPercentile: props.P_PM25 ? `${props.P_PM25.toFixed(0)}th percentile` : null,
      superfundProximityPercentile: props.P_PNPL ? `${props.P_PNPL.toFixed(0)}th percentile` : null,
      hazardousWastePercentile: props.P_TSDF ? `${props.P_TSDF.toFixed(0)}th percentile` : null,
      ejIndex: props.EJSCREEN_SCORE_20 ? props.EJSCREEN_SCORE_20.toFixed(1) : null,
      source: 'EPA EJSCREEN'
    };
  } catch (err) {
    console.warn('[EPA]', err.message);
    return { note: 'Environmental data temporarily unavailable' };
  }
}

// âââ Master Aggregator ââââââââââââââââââââââââââââââââââââââââââââââââââââ
async function getPropertyIntel(address) {
  const startTime = Date.now();
  const geo = await geocodeAddress(address);
  if (!geo) throw new Error(`Unable to geocode: ${address}`);

  // Fire all parallel sources simultaneously
  const [rentcast, flood, walkability, census, environment, usgsHazards, noaaHazards, broadband, blsJobs] = await Promise.all([
    getRentCastData(address),
    getFloodZone(geo.lat, geo.lon),
    getOSMWalkability(geo.lat, geo.lon),
    getCensusData(geo.lat, geo.lon),
    getEnvironmentalData(geo.lat, geo.lon),
    getUSGSHazards(geo.lat, geo.lon),
    getNOAAHazards(geo.lat, geo.lon, geo.county, geo.stateCode),
    getBroadbandData(geo.lat, geo.lon),
    getBLSData(geo.stateCode)
  ]);

  // Sequential: need census FIPS first, and state for disaster lookup
  const [hud, marketTrends, disasterHistory] = await Promise.all([
    getHUDData(geo.zip, census._fips?.state, geo.county),
    getFREDData(geo.stateCode),
    getDisasterHistory(geo.stateCode, geo.county)
  ]);

  // Enhanced Risk Score
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
    location: { address: geo.displayName, lat: geo.lat, lon: geo.lon, city: geo.city, state: geo.state, stateCode: geo.stateCode, zip: geo.zip, county: geo.county },
    property: rentcast,
    floodRisk: flood,
    walkability,
    neighborhood: census,
    environment,
    naturalHazards: { ...usgsHazards, ...noaaHazards },
    infrastructure: { broadband },
    hudIntelligence: hud,
    marketTrends,
    jobMarket: blsJobs,
    disasterHistory,
    riskScore: Math.min(riskScore, 100),
    riskLabel: riskScore < 20 ? 'Low' : riskScore < 50 ? 'Moderate' : 'High',
    meta: {
      processingMs: Date.now() - startTime,
      dataSources: ['OpenStreetMap', 'RentCast', 'FEMA Flood Map', 'OSM Overpass (Walkability)', 'US Census ACS', 'EPA EJSCREEN', 'USGS Earthquake Hazards', 'NOAA Severe Weather', 'FCC Broadband Map', 'HUD Opportunity Zones', 'HUD Fair Market Rent', 'FRED Housing Index', 'BLS Job Market', 'OpenFEMA Disaster History'],
      protocol: 'x402', network: 'base-mainnet'
    }
  };
}

module.exports = { getPropertyIntel };

// âââ NOAA Tornado/Severe Weather Risk (FREE, no key) âââââââââââââââââââââ
async function getNOAAHazards(lat, lon, county, state) {
  try {
    // NOAA Storm Prediction Center â county tornado risk
    const { data } = await axios.get(
      `https://api.weather.gov/points/${lat},${lon}`,
      { headers: { 'User-Agent': 'PropX402/1.0 (prop-intel-api)' }, timeout: 6000 }
    );
    const zone = data?.properties?.county;
    const forecastZone = data?.properties?.forecastZone;

    // Get county tornado history from SPC (Storm Prediction Center)
    // Iowa/Midwest tornado risk by state (static fallback based on NOAA climatology)
    const tornadoRiskByState = {
      OK: 'Very High', KS: 'Very High', TX: 'Very High', NE: 'High',
      SD: 'High', ND: 'Moderate', IA: 'Moderate', MO: 'Moderate',
      MS: 'High', AL: 'High', AR: 'Moderate', TN: 'Moderate',
      IL: 'Moderate', IN: 'Moderate', OH: 'Low', FL: 'Moderate',
      GA: 'Low', NC: 'Low', CA: 'Very Low', NY: 'Very Low',
      WA: 'Very Low', OR: 'Very Low', MT: 'Low', WY: 'Low'
    };

    const tornadoRisk = tornadoRiskByState[state] || 'Low';

    // Hail risk (correlated with tornado risk in most areas)
    const hailRisk = ['Very High', 'High'].includes(tornadoRisk) ? 'High' :
                     tornadoRisk === 'Moderate' ? 'Moderate' : 'Low';

    return {
      tornadoRisk: { riskLevel: tornadoRisk, source: 'NOAA Climatology' },
      hailRisk: { riskLevel: hailRisk },
      weatherZone: zone || null,
      insuranceImpact: tornadoRisk === 'Very High' ? 'Major premium impact â 40%+ surcharge expected' :
                       tornadoRisk === 'High' ? 'Significant premium impact â 25%+ surcharge expected' :
                       tornadoRisk === 'Moderate' ? 'Moderate premium impact â 15-20% surcharge' : 'Minimal weather impact on insurance'
    };
  } catch (err) {
    console.warn('[NOAA]', err.message);
    return { tornadoRisk: { riskLevel: 'Unknown' }, hailRisk: { riskLevel: 'Unknown' } };
  }
}

// âââ FCC Broadband Availability (FREE, no key) ââââââââââââââââââââââââââââ
async function getBroadbandData(lat, lon) {
  try {
    const { data } = await axios.get(
      `https://broadbandmap.fcc.gov/api/public/map/listAvailability?latitude=${lat}&longitude=${lon}&location_id=&unit_id=&addr=&city=&zip=&state=&category=Residential&speed=25&tech=300&limit=25&offset=0`,
      { headers: { 'User-Agent': 'PropX402/1.0' }, timeout: 6000 }
    );

    const providers = data?.data || [];
    const maxDownload = providers.reduce((max, p) => Math.max(max, p.max_advertised_download_speed || 0), 0);
    const hasGigabit = providers.some(p => (p.max_advertised_download_speed || 0) >= 940);
    const hasFiber = providers.some(p => p.technology_code === 50); // 50 = fiber
    const providerCount = new Set(providers.map(p => p.brand_name)).size;

    return {
      available: providers.length > 0,
      maxDownloadMbps: maxDownload,
      hasGigabit,
      hasFiber,
      providerCount,
      strImpact: hasGigabit ? 'â Gigabit available â premium STR/WFH signal' : hasFiber ? 'â Fiber available â strong tenant appeal' : maxDownload >= 100 ? 'â Fast broadband â adequate for STR' : 'â ï¸ Limited broadband â may limit STR appeal and WFH tenants',
      source: 'FCC Broadband Map'
    };
  } catch (err) {
    console.warn('[FCC Broadband]', err.message);
    return { available: null, note: 'Broadband data unavailable' };
  }
}

// âââ BLS: Local Job Market (FREE, no key for basic) ââââââââââââââââââââââ
async function getBLSData(stateCode) {
  try {
    // BLS State unemployment rate â public API no key needed
    const { data } = await axios.get(
      `https://api.bls.gov/publicAPI/v2/timeseries/data/LASST${stateCode}0000000000003`,
      { timeout: 6000 }
    );
    const series = data?.Results?.series?.[0]?.data;
    if (!series || series.length < 2) return { note: 'BLS data unavailable' };

    const latest = series[0];
    const yearAgo = series.find(d => d.period === latest.period && d.year === String(parseInt(latest.year) - 1)) || series[12];

    const currentRate = parseFloat(latest.value);
    const priorRate = yearAgo ? parseFloat(yearAgo.value) : null;
    const trend = priorRate ? (currentRate < priorRate ? 'Improving' : currentRate > priorRate ? 'Worsening' : 'Stable') : 'Unknown';

    return {
      stateUnemploymentRate: `${currentRate}%`,
      unemploymentTrend: trend,
      period: `${latest.periodName} ${latest.year}`,
      investorSignal: currentRate < 4 ? 'ð¥ Low unemployment â strong rental demand' : currentRate < 6 ? 'â Healthy job market' : 'â ï¸ Elevated unemployment â monitor vacancy risk',
      source: 'Bureau of Labor Statistics'
    };
  } catch (err) {
    console.warn('[BLS]', err.message);
    return { note: 'Job market data unavailable' };
  }
}

// âââ OpenFEMA Disaster History (FREE, no key) âââââââââââââââââââââââââââââ
async function getDisasterHistory(state, county) {
  try {
    const countyClean = (county || '').replace(' County', '').replace(' county', '').trim();
    const { data } = await axios.get(
      `https://www.fema.gov/api/open/v2/disasterDeclarationsSummaries?state=${state}&designatedArea=${encodeURIComponent(countyClean.toUpperCase())}+%28County%29&$orderby=declarationDate desc&$top=10`,
      { timeout: 6000 }
    );
    const disasters = data?.DisasterDeclarationsSummaries || [];
    const recentDisasters = disasters.slice(0, 5).map(d => ({
      type: d.incidentType, title: d.declarationTitle, date: d.declarationDate?.split('T')[0], id: d.disasterNumber
    }));

    const floodEvents = disasters.filter(d => d.incidentType === 'Flood').length;
    const severeStorms = disasters.filter(d => d.incidentType === 'Severe Storm').length;

    return {
      totalFederalDisasters: disasters.length,
      floodDeclarations: floodEvents,
      severeStormDeclarations: severeStorms,
      recentDisasters,
      riskFlag: floodEvents >= 3 ? 'ð¨ High flood disaster history â verify insurance availability' : floodEvents >= 1 ? 'â ï¸ Flood disaster history â review insurance options' : null,
      source: 'OpenFEMA Disaster Declarations'
    };
  } catch (err) {
    console.warn('[FEMA Disasters]', err.message);
    return { note: 'Disaster history unavailable' };
  }
}
