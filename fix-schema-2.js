const fs = require('fs');

let schema = fs.readFileSync('prisma/schema.prisma', 'utf8');

// 1. Add @updatedAt to updatedAt DateTime
schema = schema.replace(/([ \t]+updatedAt[ \t]+DateTime)([ \t]*)$/gm, '$1 @updatedAt$2');

// 2. Simple singular relation renames
const renames = {
    'users': 'user',
    'events': 'event',
    'venues': 'venue',
    'bookings': 'booking',
    'categories': 'category',
    'assets': 'asset',
    'services': 'service',
    'payments': 'payment',
    'reviews': 'review',
};

for (const [oldName, newName] of Object.entries(renames)) {
    // e.g. "users User" or "users User?"
    // But be careful not to match array relations like "users User[]" (these usually stay plural)
    const regex = new RegExp(`(^[ \\t]+)${oldName}([ \\t]+[A-Z][a-zA-Z0-9_]*\\??[ \\t]+@relation)`, 'gm');
    schema = schema.replace(regex, `$1${newName}$2`);
}

// 3. Specific relation name overrides based on TS errors
// Asset
schema = schema.replace(/(^[ \t]+)usersAssetsOwnerIdTousers([ \t]+User.+@relation."assets_ownerIdTousers".*)/gm, '$1owner$2');
schema = schema.replace(/(^[ \t]+)usersAssetsHostIdTousers([ \t]+User.+@relation."assets_hostIdTousers".*)/gm, '$1host$2');

// Venue
// "users User @relation(fields: [hostId]...)" -> "host User"
schema = schema.replace(/(^[ \t]+)user([ \t]+User.+@relation.fields: \[hostId\].*)/gm, '$1host$2');

// Service
// "user User @relation(fields: [ownerId]...)" -> "owner User"
schema = schema.replace(/(^[ \t]+)user([ \t]+User.+@relation.fields: \[ownerId\].*)/gm, '$1owner$2');

// Category
// "Category Category? @relation("categoriesTocategories", fields: [parentCategoryId]...)" -> "parentCategory Category?"
schema = schema.replace(/(^[ \t]+)Category([ \t]+Category\?.+@relation."categoriesTocategories", fields: \[parentCategoryId\].*)/gm, '$1parentCategory$2');
// "Category_other Category[] @relation("categoriesTocategories")" (or whatever the array relation was named) -> "subCategories Category[]"
// Actually my first script might have generated "Category Category[] @relation("categoriesTocategories")"
schema = schema.replace(/(^[ \t]+)Category(_other)?([ \t]+Category\[\].+@relation."categoriesTocategories".*)/gm, '$1subCategories$3');

fs.writeFileSync('prisma/schema.prisma', schema);
console.log('Schema relationships and updatedAt fixed.');
