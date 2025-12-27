/**
 * Example 13: JSON Schema Validation (FEAT-001)
 *
 * Demonstrates schema validation for API responses. This feature ensures
 * that extracted data matches expected structure, catching API contract
 * changes early.
 *
 * Use cases:
 * - Type-safe API integration
 * - API contract validation
 * - Regression testing
 * - Data quality assurance
 *
 * Run: node examples/13-schema-validation.mjs
 */

import { createLLMBrowser } from 'llm-browser/sdk';

async function main() {
  const browser = await createLLMBrowser();

  console.log('=== Schema Validation Examples ===\n');

  // Example 1: E-commerce Product Validation
  console.log('1. Validating E-commerce Product Data\n');

  const productSchema = {
    type: 'object',
    properties: {
      id: { type: 'string', pattern: '^[0-9]+$' },
      name: { type: 'string', minLength: 1 },
      price: { type: 'number', minimum: 0 },
      currency: { type: 'string', enum: ['USD', 'EUR', 'GBP'] },
      inStock: { type: 'boolean' },
      rating: {
        type: 'number',
        minimum: 0,
        maximum: 5,
      },
    },
    required: ['id', 'name', 'price', 'currency', 'inStock'],
  };

  try {
    const result = await browser.browse('https://example-store.com/products/123', {
      verify: {
        enabled: true,
        mode: 'standard',
        validateSchema: true,
        schema: productSchema,
      },
    });

    if (result.verification?.passed) {
      console.log('✓ Product data matches schema');
      console.log('  ID:', result.content.structuredData?.id);
      console.log('  Name:', result.content.structuredData?.name);
      console.log('  Price:', result.content.structuredData?.price, result.content.structuredData?.currency);
    } else {
      console.log('✗ Schema validation failed:');
      result.verification?.schemaErrors?.forEach(error => {
        console.log(`  ${error.path}: ${error.message}`);
      });
    }
  } catch (error) {
    console.log('Example product URL not available:', error.message);
  }

  console.log('\n---\n');

  // Example 2: API Pagination Response Validation
  console.log('2. Validating API Pagination Response\n');

  const paginationSchema = {
    type: 'object',
    properties: {
      data: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
          },
          required: ['id', 'title'],
        },
      },
      pagination: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1 },
          perPage: { type: 'integer', minimum: 1 },
          total: { type: 'integer', minimum: 0 },
          hasMore: { type: 'boolean' },
        },
        required: ['page', 'total', 'hasMore'],
      },
    },
    required: ['data', 'pagination'],
  };

  try {
    const result = await browser.browse('https://api.example.com/v1/posts?page=1', {
      verify: {
        enabled: true,
        mode: 'standard',
        validateSchema: true,
        schema: paginationSchema,
      },
    });

    if (result.verification?.passed) {
      console.log('✓ API response matches pagination schema');
      const data = result.content.structuredData;
      console.log(`  Items: ${data?.data?.length || 0}`);
      console.log(`  Page: ${data?.pagination?.page}/${Math.ceil(data?.pagination?.total / data?.pagination?.perPage)}`);
      console.log(`  Has more: ${data?.pagination?.hasMore}`);
    } else {
      console.log('✗ Schema validation failed:');
      result.verification?.schemaErrors?.forEach(error => {
        console.log(`  ${error.path}: ${error.message} (${error.keyword})`);
      });
    }
  } catch (error) {
    console.log('Example API URL not available:', error.message);
  }

  console.log('\n---\n');

  // Example 3: User Profile Validation with Nested Objects
  console.log('3. Validating Nested User Profile Data\n');

  const userProfileSchema = {
    type: 'object',
    properties: {
      user: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          username: { type: 'string', minLength: 3, maxLength: 20 },
          email: {
            type: 'string',
            pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
          },
          profile: {
            type: 'object',
            properties: {
              bio: { type: 'string', maxLength: 500 },
              location: { type: 'string' },
              website: { type: 'string' },
            },
          },
          stats: {
            type: 'object',
            properties: {
              followers: { type: 'integer', minimum: 0 },
              following: { type: 'integer', minimum: 0 },
              posts: { type: 'integer', minimum: 0 },
            },
          },
        },
        required: ['id', 'username', 'email'],
      },
    },
    required: ['user'],
  };

  try {
    const result = await browser.browse('https://example-social.com/api/users/johndoe', {
      verify: {
        enabled: true,
        mode: 'thorough',
        validateSchema: true,
        schema: userProfileSchema,
      },
    });

    if (result.verification?.passed) {
      console.log('✓ User profile matches schema');
      const user = result.content.structuredData?.user;
      console.log(`  Username: @${user?.username}`);
      console.log(`  Email: ${user?.email}`);
      console.log(`  Followers: ${user?.stats?.followers || 0}`);
      console.log(`  Bio: ${user?.profile?.bio?.substring(0, 50) || 'N/A'}...`);
    } else {
      console.log('✗ Schema validation failed:');
      result.verification?.schemaErrors?.forEach(error => {
        console.log(`  ${error.path}: ${error.message}`);
      });
    }
  } catch (error) {
    console.log('Example user URL not available:', error.message);
  }

  console.log('\n---\n');

  // Example 4: Catching API Contract Changes
  console.log('4. Detecting API Contract Changes\n');

  // Original schema (v1 of API)
  const originalSchema = {
    type: 'object',
    properties: {
      status: { type: 'string' },
      result: {
        type: 'object',
        properties: {
          temperature: { type: 'number' },
          humidity: { type: 'number' },
        },
        required: ['temperature', 'humidity'],
      },
    },
    required: ['status', 'result'],
  };

  try {
    const result = await browser.browse('https://api.weather-example.com/current', {
      verify: {
        enabled: true,
        mode: 'standard',
        validateSchema: true,
        schema: originalSchema,
      },
    });

    if (!result.verification?.passed) {
      console.log('⚠ API contract changed! Schema validation failed:');
      console.log('\nExpected schema:');
      console.log('  status: string');
      console.log('  result.temperature: number');
      console.log('  result.humidity: number');
      console.log('\nValidation errors:');
      result.verification?.schemaErrors?.forEach(error => {
        console.log(`  ${error.path}: ${error.message}`);
      });
      console.log('\nAction: Update schema or investigate API changes');
    } else {
      console.log('✓ API contract unchanged, schema valid');
    }
  } catch (error) {
    console.log('Example weather API not available:', error.message);
  }

  console.log('\n---\n');

  // Example 5: Strict vs. Flexible Validation
  console.log('5. Strict vs. Flexible Schema Validation\n');

  // Strict schema - exact structure required
  const strictSchema = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      age: { type: 'integer' },
    },
    required: ['name', 'age'],
    additionalProperties: false, // No extra fields allowed
  };

  // Flexible schema - allows extra fields
  const flexibleSchema = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      age: { type: 'integer' },
    },
    required: ['name', 'age'],
    additionalProperties: true, // Extra fields allowed
  };

  console.log('Strict schema (additionalProperties: false):');
  console.log('  ✓ Catches unexpected fields (API added new field)');
  console.log('  ✗ Breaks when API adds optional fields');

  console.log('\nFlexible schema (additionalProperties: true):');
  console.log('  ✓ Tolerates optional fields');
  console.log('  ✗ Misses unexpected fields');

  console.log('\nRecommendation: Use strict for critical APIs, flexible for evolving APIs');

  console.log('\n---\n');

  // Example 6: Schema Validation + Content Checks
  console.log('6. Combining Schema Validation with Content Checks\n');

  const hybridOptions = {
    enabled: true,
    mode: 'standard',
    validateSchema: true,
    schema: {
      type: 'object',
      properties: {
        price: { type: 'number', minimum: 0 },
        title: { type: 'string' },
      },
      required: ['price', 'title'],
    },
    checks: [
      {
        type: 'content',
        assertion: {
          excludesText: 'out of stock',
          minLength: 100,
        },
        severity: 'warning',
        retryable: false,
      },
    ],
  };

  console.log('Benefits of combining:');
  console.log('  1. Schema ensures type safety');
  console.log('  2. Content checks validate business logic');
  console.log('  3. Together: comprehensive validation');

  console.log('\n=== Schema Validation Complete ===\n');

  console.log('Key Takeaways:');
  console.log('  ✓ Schema validation catches type errors early');
  console.log('  ✓ Detects API contract changes automatically');
  console.log('  ✓ Provides detailed error paths for debugging');
  console.log('  ✓ Works seamlessly with existing verification');
  console.log('  ✓ Supports full JSON Schema draft-07 spec');
}

main().catch(console.error);
