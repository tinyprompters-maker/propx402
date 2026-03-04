// âââ PropX402 Investor Analysis Engine ââââââââââââââââââââââââââââââââââââââ
// 5 strategy engines + derived metrics + hidden cost discovery

// Historical 30yr mortgage rates by year (FRED data baked in for sub-to calc)
const HISTORICAL_RATES = {
  2024: 6.72, 2023: 6.81, 2022: 5.34, 2021: 2.96, 2020: 3.11,
  2019: 3.94, 2018: 4.54, 2017: 3.99, 2016: 3.65, 2015: 3.85,
  2014: 4.17, 2013: 3.98, 2012: 3.66, 2011: 4.45, 2010: 4.69,
  2009: 5.04, 2008: 6.03, 2007: 6.34, 2006: 6.41, 2005: 5.87,
  2000: 8.05, 1995: 7.93, 1990: 10.13
};

// Landlord-friendliness scores by state (0=hostile, 100=landlord heaven)
const LANDLORD_SCORES = {
  IA: { score: 78, evictionWeeks: 3, rentControl: false, justCause: false, notes: 'Fast eviction, no rent control, landlord-friendly' },
  TX: { score: 85, evictionWeeks: 3, rentControl: false, justCause: false, notes: 'Very landlord-friendly, fast courts' },
  FL: { score: 82, evictionWeeks: 2, rentControl: false, justCause: false, notes: 'Preempts local rent control' },
  AZ: { score: 80, evictionWeeks: 3, rentControl: false, justCause: false, notes: 'Strong landlord protections' },
  IN: { score: 82, evictionWeeks: 2, rentControl: false, justCause: false, notes: 'One of the most landlord-friendly states' },
  OH: { score: 75, evictionWeeks: 4, rentControl: false, justCause: false, notes: 'Moderate, no rent control' },
  IL: { score: 42, evictionWeeks: 8, rentControl: true, justCause: false, notes: 'Chicago has rent control, slow courts' },
  CA: { score: 18, evictionWeeks: 16, rentControl: true, justCause: true, notes: 'AB1482 just cause, statewide rent cap, slow evictions' },
  NY: { score: 15, evictionWeeks: 20, rentControl: true, justCause: true, notes: 'Most tenant-friendly state, extreme protections' },
  OR: { score: 28, evictionWeeks: 12, rentControl: true, justCause: true, notes: 'Statewide rent control, just cause required' },
  WA: { score: 35, evictionWeeks: 10, rentControl: false, justCause: true, notes: 'Just cause eviction, some local rent control' },
  MN: { score: 48, evictionWeeks: 6, rentControl: true, justCause: false, notes: 'Minneapolis rent control, moderate state' },
  GA: { score: 80, evictionWeeks: 3, rentControl: false, justCause: false, notes: 'Very landlord-friendly' },
  NC: { score: 76, evictionWeeks: 4, rentControl: false, justCause: false, notes: 'Landlord-friendly, preempts rent control' },
  DEFAULT: { score: 60, evictionWeeks: 6, rentControl: false, justCause: false, notes: 'State landlord law data not indexed' }
};

// ADU potential by state
const ADU_FRIENDLINESS = {
  CA: { score: 95, notes: 'Mandatory ADU approval, streamlined permitting' },
  OR: { score: 88, notes: 'Statewide ADU rights on all residential lots' },
  WA: { score: 82, notes: 'Strong ADU protections' },
  TX: { score: 70, notes: 'Local control, most cities allow ADUs' },
  FL: { score: 65, notes: 'Varies by municipality' },
  IA: { score: 55, notes: 'Local control â check Cedar Rapids zoning ordinance' },
  DEFAULT: { score: 50, notes: 'Varies by local jurisdiction' }
};

// âââ Rehab Cost Estimator âââââââââââââââââââââââââââââââââââââââââââââââââ
function estimateRehab(yearBuilt, squareFeet, condition = 'average') {
  const age = 2025 - (yearBuilt || 1970);
  const sqft = squareFeet || 1200;

  // Base cost per sqft by age
  let baseCostPerSqft;
  if (age < 20) baseCostPerSqft = 8;
  else if (age < 40) baseCostPerSqft = 18;
  else if (age < 60) baseCostPerSqft = 28;
  else if (age < 80) baseCostPerSqft = 38;
  else baseCostPerSqft = 52; // 80+ years, likely needs full systems

  // Condition multiplier
  const conditionMultiplier = { poor: 1.8, fair: 1.3, average: 1.0, good: 0.5, excellent: 0.2 };
  const multiplier = conditionMultiplier[condition] || 1.0;

  const baseRehab = Math.round(baseCostPerSqft * sqft * multiplier);

  // Lead paint flag (pre-1978 = likely lead, pre-1940 = almost certain)
  const leadPaintRisk = yearBuilt < 1940 ? 'Very High' : yearBuilt < 1978 ? 'High' : 'Low';
  const leadAbatementCost = yearBuilt < 1940 ? 8000 : yearBuilt < 1978 ? 4000 : 0;

  // Knob & tube wiring risk (pre-1950)
  const wiringRisk = yearBuilt < 1950 ? 'High â likely knob & tube, budget $8,000â15,000 rewire' : 'Low';

  // Asbestos risk (pre-1980)
  const asbestosRisk = yearBuilt < 1980 ? 'Possible â test before demo, add $2,000â8,000 if found' : 'Low';

  return {
    estimatedRehabLow: Math.round(baseRehab * 0.8),
    estimatedRehabMid: baseRehab + leadAbatementCost,
    estimatedRehabHigh: Math.round(baseRehab * 1.4) + leadAbatementCost,
    leadPaintRisk,
    leadAbatementBudget: leadAbatementCost > 0 ? `$${leadAbatementCost.toLocaleString()} included` : 'Not required',
    wiringRisk,
    asbestosRisk,
    condition,
    sqftUsed: sqft,
    ageOfHome: age
  };
}

// âââ Insurance Cost Estimator âââââââââââââââââââââââââââââââââââââââââââââ
function estimateInsurance(yearBuilt, squareFeet, inFloodZone, tornadoRisk, valueEstimate) {
  const sqft = squareFeet || 1200;
  const age = 2025 - (yearBuilt || 1970);
  const value = valueEstimate || 150000;

  // Base annual premium: 0.5â1.5% of value
  let basePremium = value * 0.008; // 0.8% baseline

  // Age surcharge
  if (age > 80) basePremium *= 1.6;
  else if (age > 60) basePremium *= 1.35;
  else if (age > 40) basePremium *= 1.15;

  // Tornado/hail risk surcharge
  if (tornadoRisk === 'High') basePremium *= 1.4;
  else if (tornadoRisk === 'Moderate') basePremium *= 1.2;

  // Flood insurance (separate policy â NFIP)
  const floodPremium = inFloodZone ? 1200 : 0; // avg NFIP premium

  const annualHazard = Math.round(basePremium / 100) * 100; // round to nearest $100
  const monthly = Math.round((annualHazard + floodPremium) / 12);

  return {
    estimatedMonthlyInsurance: monthly,
    estimatedAnnualHazard: annualHazard,
    floodInsuranceRequired: inFloodZone,
    floodPremiumEstimate: floodPremium > 0 ? `$${floodPremium}/yr (NFIP avg)` : null,
    totalAnnualInsurance: annualHazard + floodPremium,
    insuranceRiskFactors: [
      age > 60 ? `Age (${age} yrs) â surcharge applied` : null,
      tornadoRisk !== 'Low' ? `Tornado/hail risk: ${tornadoRisk}` : null,
      inFloodZone ? 'Flood zone â separate NFIP policy required' : null,
      yearBuilt < 1950 ? 'Pre-1950 construction â knob & tube/asbestos risk increases premium' : null
    ].filter(Boolean),
    note: 'Estimate only â get actual quotes before closing'
  };
}

// âââ Sub-To Mortgage Estimator ââââââââââââââââââââââââââââââââââââââââââââ
function estimateSubTo(lastSalePrice, lastSaleDate, currentValue) {
  if (!lastSalePrice || !lastSaleDate) {
    return { available: false, note: 'No sale history available for sub-to analysis' };
  }

  const saleYear = new Date(lastSaleDate).getFullYear();
  const monthsSinceSale = Math.round((Date.now() - new Date(lastSaleDate)) / (1000 * 60 * 60 * 24 * 30));
  const originalRate = HISTORICAL_RATES[saleYear] || HISTORICAL_RATES[Math.max(...Object.keys(HISTORICAL_RATES).filter(k => k <= saleYear).map(Number))] || 4.5;

  // Estimate remaining balance (assuming 20% down, 30yr fixed)
  const estimatedOriginalLoan = lastSalePrice * 0.8;
  const monthlyRate = originalRate / 100 / 12;
  const totalPayments = 360;
  const paymentsMade = Math.min(monthsSinceSale, 360);

  // Remaining balance formula
  const monthlyPayment = estimatedOriginalLoan * (monthlyRate * Math.pow(1 + monthlyRate, totalPayments)) / (Math.pow(1 + monthlyRate, totalPayments) - 1);
  const remainingBalance = estimatedOriginalLoan * Math.pow(1 + monthlyRate, paymentsMade) - monthlyPayment * (Math.pow(1 + monthlyRate, paymentsMade) - 1) / monthlyRate;

  const equityEstimate = (currentValue || lastSalePrice) - remainingBalance;
  const ltv = (remainingBalance / (currentValue || lastSalePrice) * 100).toFixed(1);

  // PITI estimate (P&I + tax estimate + insurance estimate)
  const taxEstimate = (currentValue || lastSalePrice) * 0.012 / 12; // ~1.2% annual tax rate
  const pitiEstimate = monthlyPayment + taxEstimate + 150; // rough insurance

  const viability = equityEstimate > 20000 && originalRate < 5.5 ? 'Strong' :
                    equityEstimate > 10000 && originalRate < 6.5 ? 'Moderate' : 'Weak';

  return {
    available: true,
    originalPurchasePrice: lastSalePrice,
    saleDate: lastSaleDate,
    estimatedOriginalRate: `${originalRate}%`,
    estimatedRemainingBalance: Math.round(remainingBalance),
    estimatedMonthlyPI: Math.round(monthlyPayment),
    estimatedMonthlyPITI: Math.round(pitiEstimate),
    equityCushion: Math.round(equityEstimate),
    currentLTV: `${ltv}%`,
    subToViability: viability,
    rateLockAdvantage: originalRate < 5 ? `ð¥ LOCKED at ${originalRate}% â massive rate advantage vs current market` : `${originalRate}% rate â modest advantage`,
    verdict: viability === 'Strong' ? `Strong sub-to candidate â $${Math.round(remainingBalance).toLocaleString()} balance at ${originalRate}% locked rate` :
             viability === 'Moderate' ? 'Possible sub-to â verify seller motivation and loan balance' :
             'Weak sub-to â low equity or unfavorable rate, not recommended'
  };
}

// âââ Fix & Flip Engine ââââââââââââââââââââââââââââââââââââââââââââââââââââ
function analyzeFixFlip(property, valueEstimate, rehab, insurance) {
  const arv = valueEstimate?.valueHigh || valueEstimate?.valueEstimate * 1.15 || null;
  if (!arv) return { available: false, note: 'Insufficient valuation data' };

  const rehabCost = rehab.estimatedRehabMid;
  const purchasePrice = valueEstimate?.valueLow || valueEstimate?.valueEstimate * 0.85;
  const closingCostsBuy = purchasePrice * 0.02;
  const closingCostsSell = arv * 0.07; // 6% agent + 1% closing
  const holdingMonths = 6;
  const holdingCosts = (insurance.estimatedMonthlyInsurance + (purchasePrice * 0.06 / 12)) * holdingMonths; // insurance + hard money interest est
  const allInCost = purchasePrice + rehabCost + closingCostsBuy + holdingCosts;
  const projectedProfit = arv - allInCost - closingCostsSell;
  const roi = ((projectedProfit / allInCost) * 100).toFixed(1);
  const mao = arv * 0.7 - rehabCost; // Maximum Allowable Offer (70% rule)

  const score = projectedProfit > 30000 ? 85 : projectedProfit > 15000 ? 65 : projectedProfit > 5000 ? 45 : 20;

  return {
    available: true,
    arv, purchasePrice: Math.round(purchasePrice), rehabEstimate: rehabCost,
    closingCostsBuy: Math.round(closingCostsBuy), closingCostsSell: Math.round(closingCostsSell),
    holdingCosts: Math.round(holdingCosts), holdingMonths,
    allInCost: Math.round(allInCost),
    projectedProfit: Math.round(projectedProfit),
    roi: `${roi}%`,
    maximumAllowableOffer: Math.round(mao),
    score,
    verdict: score >= 75 ? 'ð¥ Strong flip candidate' : score >= 55 ? 'â ï¸ Thin margins â proceed carefully' : 'â Not recommended for flip'
  };
}

// âââ Co-Living Engine âââââââââââââââââââââââââââââââââââââââââââââââââââââ
function analyzeCoLiving(property, rentEstimate, medianIncome) {
  const bedrooms = property?.bedrooms || 2;
  const traditionalRent = rentEstimate?.rentEstimate || 0;
  if (!traditionalRent) return { available: false, note: 'Rent estimate required' };

  // Co-living premium: each room rents for ~65-75% of full unit rent
  const coLivingRatePerRoom = Math.round(traditionalRent * 0.68);
  const totalCoLivingRent = coLivingRatePerRoom * bedrooms;
  const premium = (((totalCoLivingRent - traditionalRent) / traditionalRent) * 100).toFixed(1);
  const breakEvenOccupancy = Math.ceil((traditionalRent / totalCoLivingRent) * 100);

  // Income compatibility (co-living works in high-cost or young-professional areas)
  const incomeSignal = medianIncome > 60000 ? 'Good demand signal â market can support co-living' : 'Moderate â co-living demand may be limited';

  const score = parseFloat(premium) > 25 ? 78 : parseFloat(premium) > 15 ? 62 : parseFloat(premium) > 5 ? 48 : 30;

  return {
    available: true,
    bedrooms,
    estimatedPerRoomRent: coLivingRatePerRoom,
    totalCoLivingMonthly: totalCoLivingRent,
    traditionalRent,
    rentalPremium: `+${premium}%`,
    breakEvenOccupancy: `${breakEvenOccupancy}%`,
    annualCoLivingRevenue: totalCoLivingRent * 12,
    annualTraditionalRevenue: traditionalRent * 12,
    additionalAnnualRevenue: (totalCoLivingRent - traditionalRent) * 12,
    incomeSignal,
    score,
    verdict: score >= 70 ? 'â Good co-living opportunity' : score >= 50 ? 'â ï¸ Modest upside â evaluate market demand' : 'â Limited co-living premium in this area'
  };
}

// âââ STR Engine âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
function analyzeSTR(property, rentEstimate, walkability, medianIncome, tornadoRisk, stateCode) {
  const traditionalRent = rentEstimate?.rentEstimate || 0;
  const sqft = property?.squareFeet || 1200;
  const bedrooms = property?.bedrooms || 2;
  if (!traditionalRent) return { available: false, note: 'Rent estimate required' };

  // STR nightly rate estimate
  // Based on: LTR rent, walkability premium, income area premium
  const walkPremium = walkability?.walkScore > 70 ? 1.4 : walkability?.walkScore > 40 ? 1.15 : 0.95;
  const incomePremium = medianIncome > 80000 ? 1.2 : medianIncome > 60000 ? 1.05 : 0.9;
  const baseNightly = (traditionalRent / 30) * 2.8 * walkPremium * incomePremium;

  // Occupancy estimate (walkable = higher occupancy)
  const occupancyRate = walkability?.walkScore > 70 ? 0.72 : walkability?.walkScore > 40 ? 0.58 : 0.45;
  const annualSTRRevenue = Math.round(baseNightly * 365 * occupancyRate);
  const annualLTRRevenue = traditionalRent * 12;
  const strPremium = (((annualSTRRevenue - annualLTRRevenue) / annualLTRRevenue) * 100).toFixed(1);

  // STR expense estimate (higher than LTR)
  const strExpenses = annualSTRRevenue * 0.35; // platform fees, cleaning, supplies
  const strNOI = annualSTRRevenue - strExpenses;
  const ltrNOI = annualLTRRevenue * 0.75; // 25% expense ratio for LTR

  // Risk flags
  const riskFlags = [];
  if (walkability?.walkScore < 30) riskFlags.push('â ï¸ Low walkability â STR demand may be limited');
  if (tornadoRisk === 'High') riskFlags.push('â ï¸ High storm risk â guests may avoid during season');
  riskFlags.push('â ï¸ Verify local STR ordinance before purchasing â regulations vary');

  const strWins = strNOI > ltrNOI;
  const score = parseFloat(strPremium) > 40 ? 82 : parseFloat(strPremium) > 20 ? 65 : parseFloat(strPremium) > 0 ? 48 : 25;

  return {
    available: true,
    estimatedNightlyRate: Math.round(baseNightly),
    estimatedOccupancy: `${Math.round(occupancyRate * 100)}%`,
    projectedAnnualRevenue: annualSTRRevenue,
    projectedAnnualExpenses: Math.round(strExpenses),
    projectedAnnualNOI: Math.round(strNOI),
    vsLTRAnnualNOI: Math.round(ltrNOI),
    strPremiumVsLTR: `${strPremium}%`,
    strWinsVsLTR: strWins,
    riskFlags,
    score,
    verdict: score >= 75 ? 'ð¥ STR strongly outperforms LTR' : score >= 55 ? 'â STR viable â verify local ordinance' : strWins ? 'â ï¸ Modest STR upside â LTR may be safer' : 'â LTR outperforms STR in this location'
  };
}

// âââ BRRRR Engine âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
function analyzeBRRRR(property, valueEstimate, rentEstimate, rehab, insurance) {
  const arv = valueEstimate?.valueHigh || null;
  const rehabCost = rehab.estimatedRehabMid;
  const monthlyRent = rentEstimate?.rentEstimate || 0;
  if (!arv || !monthlyRent) return { available: false, note: 'Insufficient data for BRRRR analysis' };

  const purchasePrice = valueEstimate?.valueLow || valueEstimate?.valueEstimate * 0.85;
  const allInCost = purchasePrice + rehabCost;

  // Refi at 75% LTV of ARV
  const refinanceAmount = arv * 0.75;
  const cashLeftInDeal = Math.max(0, allInCost - refinanceAmount);
  const cashPulledOut = Math.max(0, refinanceAmount - allInCost);

  // Post-refi cash flow
  const refiRate = 7.5; // current market rate estimate
  const monthlyRate = refiRate / 100 / 12;
  const refiPayment = refinanceAmount * (monthlyRate * Math.pow(1 + monthlyRate, 360)) / (Math.pow(1 + monthlyRate, 360) - 1);

  const monthlyTaxes = (arv * 0.012) / 12;
  const monthlyExpenses = monthlyRent * 0.1 + insurance.estimatedMonthlyInsurance + monthlyTaxes; // 10% vacancy+maintenance + insurance + tax
  const monthlyNOI = monthlyRent - monthlyExpenses;
  const monthlyCashFlow = monthlyNOI - refiPayment;
  const annualCashFlow = monthlyCashFlow * 12;

  const cocReturn = cashLeftInDeal > 0 ? ((annualCashFlow / cashLeftInDeal) * 100).toFixed(1) : 'â (infinite â full refi)';
  const pullsAllCashOut = cashLeftInDeal === 0;

  const score = pullsAllCashOut ? 90 : cashLeftInDeal < 10000 ? 78 : cashLeftInDeal < 25000 ? 60 : 40;

  return {
    available: true,
    purchasePrice: Math.round(purchasePrice),
    rehabEstimate: rehabCost,
    totalCostBasis: Math.round(allInCost),
    arvPostRehab: arv,
    refinanceAt75LTV: Math.round(refinanceAmount),
    cashLeftInDeal: Math.round(cashLeftInDeal),
    cashPulledOut: Math.round(cashPulledOut),
    pullsAllCashOut,
    monthlyRefiPayment: Math.round(refiPayment),
    monthlyNOI: Math.round(monthlyNOI),
    monthlyCashFlow: Math.round(monthlyCashFlow),
    annualCashFlow: Math.round(annualCashFlow),
    cashOnCashReturn: cocReturn,
    score,
    verdict: score >= 85 ? 'ð¥ Excellent BRRRR â pulls most/all cash out' : score >= 65 ? 'â Good BRRRR â strong equity play' : score >= 45 ? 'â ï¸ Moderate BRRRR â cash stays in deal' : 'â Weak BRRRR â too much cash trapped'
  };
}

// âââ Derived Investment Metrics ââââââââââââââââââââââââââââââââââââââââââââ
function derivedMetrics(property, valueEstimate, rentEstimate, insurance, census) {
  const price = valueEstimate?.valueEstimate || null;
  const monthlyRent = rentEstimate?.rentEstimate || null;
  const sqft = property?.squareFeet || null;
  if (!price || !monthlyRent) return { note: 'Insufficient data for derived metrics' };

  const annualRent = monthlyRent * 12;
  const annualExpenses = monthlyRent * 0.45 * 12; // 45% expense ratio (taxes, ins, maintenance, vacancy)
  const annualNOI = annualRent - annualExpenses;

  const capRate = ((annualNOI / price) * 100).toFixed(2);
  const grm = (price / annualRent).toFixed(1);
  const onePercentRatio = ((monthlyRent / price) * 100).toFixed(2);
  const onePercentPasses = parseFloat(onePercentRatio) >= 1.0;
  const ppsf = sqft ? Math.round(price / sqft) : null;
  const neighborhoodPPSF = census?.medianHomeValue ? Math.round(parseInt(census.medianHomeValue.replace(/[$,]/g, '')) / 1400) : null;

  // DSCR (using 25% down conventional loan)
  const loanAmount = price * 0.75;
  const loanRate = 7.5 / 100 / 12;
  const monthlyPayment = loanAmount * (loanRate * Math.pow(1 + loanRate, 360)) / (Math.pow(1 + loanRate, 360) - 1);
  const dscr = (monthlyRent * 0.75 / monthlyPayment).toFixed(2); // NOI / debt service

  // Monthly cash flow estimate (25% down conventional)
  const monthlyExpenses = monthlyRent * 0.35 + insurance.estimatedMonthlyInsurance;
  const monthlyCashFlow = monthlyRent - monthlyExpenses - monthlyPayment;

  return {
    capRate: `${capRate}%`,
    capRateRating: parseFloat(capRate) >= 8 ? 'ð¥ Excellent' : parseFloat(capRate) >= 6 ? 'â Good' : parseFloat(capRate) >= 4 ? 'â ï¸ Average' : 'â Poor',
    grossRentMultiplier: parseFloat(grm),
    grmRating: parseFloat(grm) <= 8 ? 'ð¥ Excellent' : parseFloat(grm) <= 12 ? 'â Good' : parseFloat(grm) <= 16 ? 'â ï¸ Average' : 'â Poor',
    onePercentRule: { ratio: `${onePercentRatio}%`, passes: onePercentPasses, label: onePercentPasses ? 'â Passes 1% rule' : 'â Fails 1% rule' },
    debtServiceCoverageRatio: parseFloat(dscr),
    dscrRating: parseFloat(dscr) >= 1.25 ? 'â Bankable DSCR' : parseFloat(dscr) >= 1.0 ? 'â ï¸ Breakeven' : 'â Negative DSCR',
    pricePerSqFt: ppsf,
    neighborhoodMedianPPSF: neighborhoodPPSF,
    valueVsNeighborhood: ppsf && neighborhoodPPSF ? (ppsf < neighborhoodPPSF ? `â ${Math.round((1 - ppsf/neighborhoodPPSF)*100)}% below neighborhood median â potential upside` : `â ï¸ ${Math.round((ppsf/neighborhoodPPSF - 1)*100)}% above neighborhood median`) : null,
    estimatedMonthlyCashFlow: Math.round(monthlyCashFlow),
    estimatedAnnualCashFlow: Math.round(monthlyCashFlow * 12),
    cashFlowRating: monthlyCashFlow > 300 ? 'ð¥ Strong cash flow' : monthlyCashFlow > 100 ? 'â Positive cash flow' : monthlyCashFlow > -100 ? 'â ï¸ Near breakeven' : 'â Negative cash flow',
    assumptionNote: '25% down, 7.5% rate, 30yr fixed. Adjust for your financing.'
  };
}

// âââ Master Investor Analysis ââââââââââââââââââââââââââââââââââââââââââââââ
function runInvestorAnalysis(propertyData, stateCode = 'IA', condition = 'average') {
  const { property, floodRisk, walkability, neighborhood, naturalHazards, marketTrends } = propertyData;

  // rentEstimate and valueEstimate live inside property (from RentCast)
  const rentEstimate = property?.rentEstimate || null;
  const valueEstimate = property?.valueEstimate || null;

  const tornadoRisk = naturalHazards?.tornadoRisk?.riskLevel || 'Unknown';
  const medianIncome = neighborhood?.medianHouseholdIncomeRaw || 75000;
  const inFloodZone = floodRisk?.inFloodZone || false;

  // Build component analyses
  const rehab = estimateRehab(property?.yearBuilt, property?.squareFeet, condition);
  const insurance = estimateInsurance(property?.yearBuilt, property?.squareFeet, inFloodZone, tornadoRisk, valueEstimate?.valueEstimate);
  const landlord = LANDLORD_SCORES[stateCode] || LANDLORD_SCORES.DEFAULT;
  const aduPotential = ADU_FRIENDLINESS[stateCode] || ADU_FRIENDLINESS.DEFAULT;

  const fixFlip = analyzeFixFlip(property, valueEstimate, rehab, insurance);
  const coLiving = analyzeCoLiving(property, rentEstimate, medianIncome);
  const subTo = estimateSubTo(property?.lastSalePrice, property?.lastSaleDate, valueEstimate?.valueEstimate);
  const str = analyzeSTR(property, rentEstimate, walkability, medianIncome, tornadoRisk, stateCode);
  const brrrr = analyzeBRRRR(property, valueEstimate, rentEstimate, rehab, insurance);
  const metrics = derivedMetrics(property, valueEstimate, rentEstimate, insurance, neighborhood);

  // Rank strategies
  const strategies = [
    { name: 'Fix & Flip', score: fixFlip.score || 0 },
    { name: 'Co-Living', score: coLiving.score || 0 },
    { name: 'Sub-To', score: subTo.available ? (subTo.subToViability === 'Strong' ? 75 : subTo.subToViability === 'Moderate' ? 50 : 25) : 0 },
    { name: 'Short-Term Rental', score: str.score || 0 },
    { name: 'BRRRR', score: brrrr.score || 0 }
  ].sort((a, b) => b.score - a.score);

  const topStrategy = strategies[0];
  const investorScore = Math.round(strategies.slice(0, 3).reduce((sum, s) => sum + s.score, 0) / 3);

  return {
    investorScore,
    investorScoreLabel: investorScore >= 75 ? 'ð¥ High Opportunity' : investorScore >= 55 ? 'â Good Opportunity' : investorScore >= 35 ? 'â ï¸ Moderate Opportunity' : 'â Limited Opportunity',
    recommendedStrategy: topStrategy.name,
    strategyRanking: strategies,
    hiddenCosts: {
      estimatedInsurance: insurance,
      rehabEstimate: rehab,
      leadPaintWarning: rehab.leadPaintRisk !== 'Low' ? `â ï¸ Lead paint risk: ${rehab.leadPaintRisk} â built ${property?.yearBuilt || 'unknown'}. Budget $${rehab.leadAbatementBudget} for abatement if renovating.` : null,
      wiringWarning: rehab.wiringRisk.startsWith('High') ? `â ï¸ ${rehab.wiringRisk}` : null
    },
    strategies: {
      fixAndFlip: fixFlip,
      coLiving,
      subjectTo: subTo,
      shortTermRental: str,
      brrrr
    },
    derivedMetrics: metrics,
    regulatoryIntelligence: {
      landlordScore: landlord,
      aduPotential,
      marketTrend: marketTrends?.trend || 'Unknown',
      appreciation: marketTrends?.yearOverYearAppreciation || null
    }
  };
}

module.exports = { runInvestorAnalysis };
