const fs = require('fs');

// 1. Fix schema.prisma
let schema = fs.readFileSync('prisma/schema.prisma', 'utf8');

// Booking Attendees
schema = schema.replace(/(^[ \t]+)bookingAttendees([ \t]+BookingAttendee\[\].*)/gm, '$1attendees$2');

// Categories
schema = schema.replace(/(^[ \t]+)categories([ \t]+Category\?.+@relation."categoriesTocategories", fields: \[parentCategoryId\].*)/gm, '$1parentCategory$2');
schema = schema.replace(/(^[ \t]+)otherCategories([ \t]+Category\[\].+@relation."categoriesTocategories".*)/gm, '$1subCategories$2');

fs.writeFileSync('prisma/schema.prisma', schema);

// 2. Fix prisma.config.ts
let config = fs.readFileSync('prisma.config.ts', 'utf8');
if (config.includes('process.env.DATABASE_URL') && !config.includes('process.env.DATABASE_URL!')) {
    config = config.replace(/process\.env\.DATABASE_URL([ \t\n,])/gm, 'process.env.DATABASE_URL!$1');
    fs.writeFileSync('prisma.config.ts', config);
}

console.log('Final fixes applied.');
