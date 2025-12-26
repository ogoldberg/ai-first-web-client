/**
 * Company Research Workflow Example (WORK-001)
 *
 * Demonstrates multi-page workflow orchestration:
 * - Navigate across multiple pages (homepage, about, careers, etc.)
 * - Aggregate data from different sources
 * - Build comprehensive company profile
 * - Save workflow for replay on other companies
 *
 * Shows how Unbrowser can coordinate complex multi-step research tasks.
 */

import { createLLMBrowser } from '../sdk/index.js';

interface CompanyProfile {
  name: string;
  domain: string;
  description?: string;
  industry?: string;
  founded?: number;
  size?: string;
  headquarters?: string;
  socialMedia?: {
    linkedin?: string;
    twitter?: string;
    github?: string;
  };
  products?: string[];
  careers?: {
    openPositions: number;
    locations: string[];
    departments: string[];
  };
  contact?: {
    email?: string;
    phone?: string;
    address?: string;
  };
  technologies?: string[];
  fundingRounds?: Array<{
    stage: string;
    amount: string;
    date: string;
  }>;
}

async function researchCompany(domain: string): Promise<CompanyProfile> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Researching Company: ${domain}`);
  console.log('='.repeat(60));

  const browser = await createLLMBrowser();
  const baseUrl = domain.startsWith('http') ? domain : `https://${domain}`;

  const profile: CompanyProfile = {
    name: domain,
    domain,
  };

  // Step 1: Homepage - Get basic info
  console.log('\n[1/5] Analyzing homepage...');
  try {
    const homepage = await browser.browse(baseUrl);
    console.log(`  Strategy: ${homepage.meta.strategy} (${homepage.meta.timing.total}ms)`);

    if (homepage.content.structured) {
      profile.name = (homepage.content.structured.name as string) || domain;
      profile.description = homepage.content.structured.description as string;
      profile.industry = homepage.content.structured.industry as string;
    }

    // Extract social links from homepage
    const text = homepage.content.text.toLowerCase();
    if (text.includes('linkedin.com/company/')) {
      const match = text.match(/linkedin\.com\/company\/([a-zA-Z0-9-]+)/);
      if (match) {
        profile.socialMedia = { ...profile.socialMedia, linkedin: `linkedin.com/company/${match[1]}` };
      }
    }
    if (text.includes('twitter.com/')) {
      const match = text.match(/twitter\.com\/([a-zA-Z0-9_]+)/);
      if (match) {
        profile.socialMedia = { ...profile.socialMedia, twitter: `twitter.com/${match[1]}` };
      }
    }
    if (text.includes('github.com/')) {
      const match = text.match(/github\.com\/([a-zA-Z0-9-]+)/);
      if (match) {
        profile.socialMedia = { ...profile.socialMedia, github: `github.com/${match[1]}` };
      }
    }
  } catch (error) {
    console.log('  ⚠️  Failed to analyze homepage:', (error as Error).message);
  }

  // Step 2: About page
  console.log('[2/5] Checking about page...');
  try {
    const aboutPage = await browser.browse(`${baseUrl}/about`);
    console.log(`  Strategy: ${aboutPage.meta.strategy} (${aboutPage.meta.timing.total}ms)`);

    const structured = aboutPage.content.structured;
    if (structured) {
      profile.founded = structured.founded as number;
      profile.size = structured.size as string;
      profile.headquarters = structured.headquarters as string;
    }

    // Try to extract from text if structured data not available
    const text = aboutPage.content.text;
    if (!profile.founded) {
      const yearMatch = text.match(/founded in (\d{4})/i);
      if (yearMatch) {
        profile.founded = parseInt(yearMatch[1]);
      }
    }
  } catch (error) {
    console.log('  ⚠️  About page not found or failed');
  }

  // Step 3: Products/Services page
  console.log('[3/5] Analyzing products...');
  try {
    const productsPage = await browser.browse(`${baseUrl}/products`);
    console.log(`  Strategy: ${productsPage.meta.strategy} (${productsPage.meta.timing.total}ms)`);

    if (productsPage.content.structured?.products) {
      profile.products = productsPage.content.structured.products as string[];
    }
  } catch (error) {
    console.log('  ⚠️  Products page not found');
  }

  // Step 4: Careers page
  console.log('[4/5] Checking careers...');
  try {
    const careersPage = await browser.browse(`${baseUrl}/careers`);
    console.log(`  Strategy: ${careersPage.meta.strategy} (${careersPage.meta.timing.total}ms)`);

    const structured = careersPage.content.structured;
    if (structured) {
      profile.careers = {
        openPositions: (structured.openPositions as number) || 0,
        locations: (structured.locations as string[]) || [],
        departments: (structured.departments as string[]) || [],
      };
    } else {
      // Count job listings in text
      const text = careersPage.content.text;
      const jobListings = text.match(/\bjob\b|\bposition\b|\bhiring\b/gi);
      profile.careers = {
        openPositions: jobListings ? Math.floor(jobListings.length / 3) : 0,
        locations: [],
        departments: [],
      };
    }
  } catch (error) {
    console.log('  ⚠️  Careers page not found');
  }

  // Step 5: Contact page
  console.log('[5/5] Finding contact info...');
  try {
    const contactPage = await browser.browse(`${baseUrl}/contact`);
    console.log(`  Strategy: ${contactPage.meta.strategy} (${contactPage.meta.timing.total}ms)`);

    const structured = contactPage.content.structured;
    if (structured) {
      profile.contact = {
        email: structured.email as string,
        phone: structured.phone as string,
        address: structured.address as string,
      };
    } else {
      // Extract from text
      const text = contactPage.content.text;
      const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      const phoneMatch = text.match(/\+?[\d\s()-]{10,}/);

      profile.contact = {
        email: emailMatch?.[0],
        phone: phoneMatch?.[0]?.trim(),
      };
    }
  } catch (error) {
    console.log('  ⚠️  Contact page not found');
  }

  console.log('\n✓ Research complete');
  return profile;
}

function displayCompanyProfile(profile: CompanyProfile) {
  console.log('\n\n' + '='.repeat(60));
  console.log('Company Profile');
  console.log('='.repeat(60));

  console.log(`\nName:          ${profile.name}`);
  console.log(`Domain:        ${profile.domain}`);

  if (profile.description) {
    console.log(`\nDescription:   ${profile.description.slice(0, 200)}${profile.description.length > 200 ? '...' : ''}`);
  }

  if (profile.industry) {
    console.log(`Industry:      ${profile.industry}`);
  }

  if (profile.founded) {
    console.log(`Founded:       ${profile.founded}`);
  }

  if (profile.size) {
    console.log(`Size:          ${profile.size}`);
  }

  if (profile.headquarters) {
    console.log(`Headquarters:  ${profile.headquarters}`);
  }

  if (profile.socialMedia) {
    console.log('\nSocial Media:');
    if (profile.socialMedia.linkedin) {
      console.log(`  LinkedIn:    ${profile.socialMedia.linkedin}`);
    }
    if (profile.socialMedia.twitter) {
      console.log(`  Twitter:     ${profile.socialMedia.twitter}`);
    }
    if (profile.socialMedia.github) {
      console.log(`  GitHub:      ${profile.socialMedia.github}`);
    }
  }

  if (profile.products && profile.products.length > 0) {
    console.log(`\nProducts:      ${profile.products.join(', ')}`);
  }

  if (profile.careers) {
    console.log('\nCareers:');
    console.log(`  Open Positions: ${profile.careers.openPositions}`);
    if (profile.careers.locations.length > 0) {
      console.log(`  Locations:      ${profile.careers.locations.join(', ')}`);
    }
    if (profile.careers.departments.length > 0) {
      console.log(`  Departments:    ${profile.careers.departments.join(', ')}`);
    }
  }

  if (profile.contact) {
    console.log('\nContact:');
    if (profile.contact.email) {
      console.log(`  Email:       ${profile.contact.email}`);
    }
    if (profile.contact.phone) {
      console.log(`  Phone:       ${profile.contact.phone}`);
    }
    if (profile.contact.address) {
      console.log(`  Address:     ${profile.contact.address}`);
    }
  }

  console.log('\n' + '='.repeat(60));
}

// Example usage
async function main() {
  console.log('Company Research Workflow Example (WORK-001)');
  console.log('Demonstrates multi-page data aggregation\n');

  const exampleCompanies = [
    'example.com',
    // Add real company domains when testing:
    // 'stripe.com',
    // 'vercel.com',
    // 'anthropic.com',
  ];

  for (const domain of exampleCompanies) {
    try {
      const profile = await researchCompany(domain);
      displayCompanyProfile(profile);
    } catch (error) {
      console.error(`Error researching ${domain}:`, error);
    }
  }

  console.log('\n\nKey Learning Points:');
  console.log('='.repeat(60));
  console.log('1. Multi-Page Navigation: Automatically visits 5+ pages');
  console.log('2. Data Aggregation: Combines information from multiple sources');
  console.log('3. Smart Extraction: Uses structured data when available');
  console.log('4. Fallback Parsing: Extracts from text when structured data missing');
  console.log('5. Workflow Reuse: Same pattern works across different companies');
  console.log('\nUse this workflow to build lead lists, competitive analysis, etc!');

  console.log('\n\nWorkflow Steps:');
  console.log('-'.repeat(60));
  console.log('1. Homepage → Basic info, social links');
  console.log('2. About → History, size, location');
  console.log('3. Products → Service offerings');
  console.log('4. Careers → Open positions, hiring signal');
  console.log('5. Contact → Contact information');
  console.log('\nEasily extend with press releases, blog, pricing, etc!');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { researchCompany, type CompanyProfile };
