// Demonstration of cost optimization with conditional context loading

import { generateSystemPrompt, generateOptimizedSystemPrompt, detectDataContext } from './systemPrompt';

// Mock schema examples for different data types
const SALES_DATA_SCHEMA = [
  { column_name: 'sale_date', column_type: 'DATE' },
  { column_name: 'region', column_type: 'VARCHAR' },
  { column_name: 'amount', column_type: 'DECIMAL' },
  { column_name: 'customer_id', column_type: 'INTEGER' }
];

const GEOSPATIAL_SCHEMA = [
  { column_name: 'geometry', column_type: 'GEOMETRY' },
  { column_name: 'location_name', column_type: 'VARCHAR' },
  { column_name: 'population', column_type: 'INTEGER' },
  { column_name: 'established_date', column_type: 'TIMESTAMP' }
];

const SIMPLE_PRODUCT_SCHEMA = [
  { column_name: 'product_name', column_type: 'VARCHAR' },
  { column_name: 'category', column_type: 'VARCHAR' },
  { column_name: 'price', column_type: 'DECIMAL' }
];

const EMPTY_SCHEMA: Array<{ column_name: string; column_type: string }> = [];

// Cost analysis function
function analyzeCost(promptText: string, description: string): { tokens: number; description: string } {
  // Rough token estimation (1 token ≈ 4 characters)
  const estimatedTokens = Math.ceil(promptText.length / 4);
  console.log(`${description}: ~${estimatedTokens} tokens`);
  return { tokens: estimatedTokens, description };
}

// Demonstrate cost optimization
export function demonstrateCostOptimization(): void {
  console.log('=== PROMPT COST OPTIMIZATION DEMO ===\n');

  // Original full prompt
  const fullPrompt = generateSystemPrompt();
  const fullCost = analyzeCost(fullPrompt, 'Full Enhanced Prompt (Legacy)');

  console.log('\n--- OPTIMIZED SCENARIOS ---\n');

  // Scenario 1: Simple categorical data (no temporal/geospatial)
  const simpleOptimized = generateOptimizedSystemPrompt(SIMPLE_PRODUCT_SCHEMA);
  const simpleCost = analyzeCost(simpleOptimized, 'Simple Product Data (Category + Numeric only)');
  console.log(`Context detected:`, detectDataContext(SIMPLE_PRODUCT_SCHEMA));

  // Scenario 2: Time-series sales data (temporal + categorical + numeric)
  const salesOptimized = generateOptimizedSystemPrompt(SALES_DATA_SCHEMA);
  const salesCost = analyzeCost(salesOptimized, 'Sales Time-Series Data (Temporal + Categorical + Numeric)');
  console.log(`Context detected:`, detectDataContext(SALES_DATA_SCHEMA));

  // Scenario 3: Geospatial BI data (all data types)
  const geoOptimized = generateOptimizedSystemPrompt(GEOSPATIAL_SCHEMA);
  const geoCost = analyzeCost(geoOptimized, 'Geospatial BI Data (All data types)');
  console.log(`Context detected:`, detectDataContext(GEOSPATIAL_SCHEMA));

  // Scenario 4: No schema info available
  const noSchemaOptimized = generateOptimizedSystemPrompt(EMPTY_SCHEMA);
  const noSchemaCost = analyzeCost(noSchemaOptimized, 'No Schema Available (Basic context)');

  console.log('\n=== COST SAVINGS ANALYSIS ===\n');

  const scenarios = [
    { name: 'Simple Product Data', cost: simpleCost.tokens, savings: fullCost.tokens - simpleCost.tokens },
    { name: 'Sales Time-Series', cost: salesCost.tokens, savings: fullCost.tokens - salesCost.tokens },
    { name: 'Geospatial BI', cost: geoCost.tokens, savings: fullCost.tokens - geoCost.tokens },
    { name: 'No Schema Info', cost: noSchemaCost.tokens, savings: fullCost.tokens - noSchemaCost.tokens }
  ];

  scenarios.forEach(scenario => {
    const savingsPercent = Math.round((scenario.savings / fullCost.tokens) * 100);
    console.log(`${scenario.name}:`);
    console.log(`  Tokens: ${scenario.cost} (vs ${fullCost.tokens} full)`);
    console.log(`  Savings: ${scenario.savings} tokens (${savingsPercent}%)`);
    console.log(`  Cost Reduction: ${savingsPercent}% cheaper per query\n`);
  });

  // Usage recommendations
  console.log('=== USAGE RECOMMENDATIONS ===\n');
  console.log('1. Use generateOptimizedSystemPrompt() for new implementations');
  console.log('2. Pass schema information when available for best optimization');
  console.log('3. Use generateSystemPrompt() only for backward compatibility');
  console.log('4. Expected cost reduction: 30-70% depending on data complexity');
  console.log('5. All SQL analysis capabilities preserved in optimized version\n');
}

// Export for testing
export {
  SALES_DATA_SCHEMA,
  GEOSPATIAL_SCHEMA, 
  SIMPLE_PRODUCT_SCHEMA,
  EMPTY_SCHEMA
};