const { Client } = require('pg');
const fs = require('fs');
require('dotenv').config();

async function runMigrations() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    await client.connect();
    console.log('✓ Connected to database');

    // Read and execute update-categories.sql
    const categoriesSql = fs.readFileSync('./update-categories.sql', 'utf8');
    console.log('\n→ Running update-categories.sql...');
    await client.query(categoriesSql);
    console.log('✓ Categories updated successfully!');

    // Read and execute update-category-icons.sql
    const iconsSql = fs.readFileSync('./update-category-icons.sql', 'utf8');
    console.log('\n→ Running update-category-icons.sql...');
    await client.query(iconsSql);
    console.log('✓ Category icons updated successfully!');

    // Verify the changes
    console.log('\n→ Verifying categories...');
    const result = await client.query('SELECT name, slug, icon FROM categories ORDER BY name');
    console.log('\nUpdated Categories:');
    result.rows.forEach((row, i) => {
      console.log(`${i + 1}. ${row.name} (${row.slug}) - Icon: ${row.icon}`);
    });

  } catch (error) {
    console.error('✗ Error running migrations:', error.message);
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n✓ Database connection closed');
  }
}

runMigrations();
