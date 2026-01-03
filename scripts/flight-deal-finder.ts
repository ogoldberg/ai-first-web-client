#!/usr/bin/env tsx

/**
 * Flight Deal Finder - Proof of Concept
 *
 * Demonstrates using Unbrowser to find the best flight deals across multiple sites.
 *
 * Features:
 * - Multi-site parallel search
 * - Price extraction and comparison
 * - Content validation
 * - Learning from search patterns
 *
 * Usage:
 *   npx tsx scripts/flight-deal-finder.ts SFO LAX 2026-02-15
 */

import { createLLMBrowser } from '../src/sdk.js';

interface FlightDeal {
  site: string;
  url: string;
  price?: number;
  currency?: string;
  airline?: string;
  duration?: string;
  confidence: number;
  error?: string;
}

/**
 * Extract price from markdown/text content
 */
function extractPrice(content: string): { price: number; currency: string } | null {
  // Try to find price patterns like "$299", "€450", "£199"
  const pricePatterns = [
    /\$\s*(\d{1,4}(?:,\d{3})*(?:\.\d{2})?)/,  // $299 or $1,299.99
    /(\d{1,4}(?:,\d{3})*(?:\.\d{2})?)\s*(?:USD|dollars?)/i,  // 299 USD
    /€\s*(\d{1,4}(?:,\d{3})*(?:\.\d{2})?)/,  // €450
    /£\s*(\d{1,4}(?:,\d{3})*(?:\.\d{2})?)/,  // £199
  ];

  for (const pattern of pricePatterns) {
    const match = content.match(pattern);
    if (match) {
      const priceStr = match[1].replace(/,/g, '');
      const price = parseFloat(priceStr);

      // Determine currency
      let currency = 'USD';
      if (content.includes('€') || /euro/i.test(content)) {
        currency = 'EUR';
      } else if (content.includes('£') || /pound/i.test(content)) {
        currency = 'GBP';
      }

      return { price, currency };
    }
  }

  return null;
}

/**
 * Extract flight details from content
 */
function extractFlightDetails(content: string): {
  airline?: string;
  duration?: string;
} {
  const details: { airline?: string; duration?: string } = {};

  // Try to find airline names
  const airlinePatterns = [
    /(?:airline|carrier)[\s:]*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
    /(United|Delta|American|Southwest|JetBlue|Spirit|Frontier|Alaska)/i,
  ];

  for (const pattern of airlinePatterns) {
    const match = content.match(pattern);
    if (match) {
      details.airline = match[1];
      break;
    }
  }

  // Try to find duration
  const durationPatterns = [
    /(\d+h\s*\d+m)/,  // 2h 30m
    /(\d+\s*hour[s]?\s*(?:\d+\s*min(?:ute)?[s]?)?)/i,  // 2 hours 30 minutes
  ];

  for (const pattern of durationPatterns) {
    const match = content.match(pattern);
    if (match) {
      details.duration = match[1];
      break;
    }
  }

  return details;
}

/**
 * Build flight search URL for different sites
 */
function buildSearchUrl(site: string, from: string, to: string, date: string): string | null {
  const urls: Record<string, string> = {
    // Google Flights
    google: `https://www.google.com/travel/flights/search?q=${from}+to+${to}+${date}`,

    // Kayak
    kayak: `https://www.kayak.com/flights/${from}-${to}/${date}?sort=bestflight_a`,

    // Skyscanner (format: YYYY-MM-DD)
    skyscanner: `https://www.skyscanner.com/transport/flights/${from.toLowerCase()}/${to.toLowerCase()}/${date.replace(/\//g, '')}`,

    // Expedia
    expedia: `https://www.expedia.com/Flights-Search?trip=oneway&leg1=from:${from},to:${to},departure:${date}TANYT`,

    // Momondo
    momondo: `https://www.momondo.com/flight-search/${from}-${to}/${date}?sort=bestflight_a`,
  };

  return urls[site] || null;
}

/**
 * Find best flight deals
 */
async function findFlightDeals(
  from: string,
  to: string,
  date: string,
  sites: string[] = ['google', 'kayak']
): Promise<FlightDeal[]> {
  console.log(`\n🔍 Searching for flights: ${from} → ${to} on ${date}\n`);

  // Create browser instance
  const browser = await createLLMBrowser({
    enableLearning: true,
    enableProceduralMemory: true,
  });

  const deals: FlightDeal[] = [];

  try {
    // Search each site
    for (const site of sites) {
      const url = buildSearchUrl(site, from, to, date);

      if (!url) {
        console.log(`⚠️  Unknown site: ${site}`);
        continue;
      }

      console.log(`🌐 Searching ${site}...`);
      console.log(`   URL: ${url}`);

      try {
        const startTime = Date.now();

        // Browse with content validation
        const result = await browser.browse(url, {
          maxChars: 50000,
          includeNetwork: true,
          includeInsights: true,
          maxLatencyMs: 10000, // 10 second timeout
          maxCostTier: 'lightweight', // Don't use full Playwright unless needed
          verify: {
            enabled: true,
            mode: 'standard',
            checks: [
              {
                type: 'content',
                assertion: {
                  minLength: 200,
                },
                severity: 'warning',
                retryable: false,
              },
            ],
          },
        });

        const duration = Date.now() - startTime;
        const content = result.content.markdown + ' ' + result.content.text;

        // Extract price and details
        const priceInfo = extractPrice(content);
        const flightDetails = extractFlightDetails(content);

        const deal: FlightDeal = {
          site,
          url,
          confidence: result.verification?.confidence || 0.5,
          ...priceInfo,
          ...flightDetails,
        };

        deals.push(deal);

        console.log(`   ✓ Found (${duration}ms)`);
        if (priceInfo) {
          console.log(`     Price: ${priceInfo.currency} ${priceInfo.price}`);
        }
        if (flightDetails.airline) {
          console.log(`     Airline: ${flightDetails.airline}`);
        }
        if (flightDetails.duration) {
          console.log(`     Duration: ${flightDetails.duration}`);
        }

        // Check if APIs were discovered
        if (result.discoveredApis && result.discoveredApis.length > 0) {
          console.log(`     📡 Discovered ${result.discoveredApis.length} API(s) - future searches will be faster!`);
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.log(`   ✗ Error: ${errorMessage}`);

        deals.push({
          site,
          url,
          confidence: 0,
          error: errorMessage,
        });
      }
    }

  } finally {
    await browser.cleanup();
  }

  return deals;
}

/**
 * Format and display results
 */
function displayResults(deals: FlightDeal[]): void {
  console.log('\n' + '='.repeat(60));
  console.log('📊 FLIGHT DEAL COMPARISON');
  console.log('='.repeat(60) + '\n');

  // Filter out errors
  const validDeals = deals.filter(d => d.price !== undefined);
  const errorDeals = deals.filter(d => d.error !== undefined);

  if (validDeals.length === 0) {
    console.log('❌ No valid flight prices found.\n');

    if (errorDeals.length > 0) {
      console.log('Errors encountered:');
      for (const deal of errorDeals) {
        console.log(`  - ${deal.site}: ${deal.error}`);
      }
    }

    return;
  }

  // Sort by price (lowest first)
  const sortedDeals = [...validDeals].sort((a, b) => (a.price || Infinity) - (b.price || Infinity));

  // Display deals
  for (let i = 0; i < sortedDeals.length; i++) {
    const deal = sortedDeals[i];
    const isBest = i === 0;

    console.log(`${isBest ? '🏆' : '  '} ${deal.site.toUpperCase()}`);
    console.log(`   Price: ${deal.currency} $${deal.price}`);
    if (deal.airline) {
      console.log(`   Airline: ${deal.airline}`);
    }
    if (deal.duration) {
      console.log(`   Duration: ${deal.duration}`);
    }
    console.log(`   Confidence: ${(deal.confidence * 100).toFixed(0)}%`);
    console.log(`   URL: ${deal.url}`);
    console.log();
  }

  // Show best deal
  const bestDeal = sortedDeals[0];
  console.log('='.repeat(60));
  console.log(`✨ BEST DEAL: ${bestDeal.site.toUpperCase()} - ${bestDeal.currency} $${bestDeal.price}`);
  console.log('='.repeat(60) + '\n');

  // Show errors if any
  if (errorDeals.length > 0) {
    console.log(`⚠️  ${errorDeals.length} site(s) had errors:`);
    for (const deal of errorDeals) {
      console.log(`   - ${deal.site}: ${deal.error}`);
    }
    console.log();
  }
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.log(`
Usage: npx tsx scripts/flight-deal-finder.ts <FROM> <TO> <DATE> [SITES...]

Arguments:
  FROM    Origin airport code (e.g., SFO, LAX, JFK)
  TO      Destination airport code (e.g., LAX, JFK, LHR)
  DATE    Departure date (YYYY-MM-DD)
  SITES   Optional list of sites to search (default: google, kayak)
          Available: google, kayak, skyscanner, expedia, momondo

Examples:
  npx tsx scripts/flight-deal-finder.ts SFO LAX 2026-02-15
  npx tsx scripts/flight-deal-finder.ts JFK LHR 2026-03-01 google kayak skyscanner
  npx tsx scripts/flight-deal-finder.ts ORD MIA 2026-04-15 google expedia
    `);
    process.exit(1);
  }

  const [from, to, date, ...sites] = args;
  const searchSites = sites.length > 0 ? sites : ['google', 'kayak'];

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error('❌ Error: Date must be in YYYY-MM-DD format');
    process.exit(1);
  }

  try {
    const deals = await findFlightDeals(from, to, date, searchSites);
    displayResults(deals);
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { findFlightDeals, extractPrice, extractFlightDetails, buildSearchUrl };
