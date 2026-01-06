const { Client } = require('pg');
require('dotenv').config();

async function checkCategories() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    await client.connect();
    console.log('✓ Connected to database\n');

    const result = await client.query('SELECT id, name, slug, icon FROM categories ORDER BY name');

    console.log(`Found ${result.rows.length} categories:\n`);
    result.rows.forEach((row, i) => {
      console.log(`${i + 1}. ${row.name}`);
      console.log(`   Slug: ${row.slug}`);
      console.log(`   Icon: ${row.icon || 'NULL'}`);
      console.log(`   ID: ${row.id}\n`);
    });

  } catch (error) {
    console.error('✗ Error:', error.message);
  } finally {
    await client.end();
  }
}

checkCategories();
