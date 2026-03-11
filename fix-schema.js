const fs = require('fs');

let schema = fs.readFileSync('prisma/schema.prisma', 'utf8');

const map = {
    'asset_images': 'AssetImage',
    'assets': 'Asset',
    'booking_attendees': 'BookingAttendee',
    'bookings': 'Booking',
    'categories': 'Category',
    'event_assets': 'EventAsset',
    'event_services': 'EventService',
    'events': 'Event',
    'favorites': 'Favorite',
    'payments': 'Payment',
    'reviews': 'Review',
    'services': 'Service',
    'users': 'User',
    'venue_images': 'VenueImage',
    'venues': 'Venue',
};

// 1. Rename models and inject @@map
for (const [oldName, newName] of Object.entries(map)) {
    // Find "model oldName {" and replace it
    const regex = new RegExp(`^model ${oldName} \\{`, 'gm');
    schema = schema.replace(regex, `model ${newName} {`);
}

// Add @@map at the end of every renamed model block
for (const [oldName, newName] of Object.entries(map)) {
    // Find the end of the model block
    const endRegex = new RegExp(`(^model ${newName} \\{[\\s\\S]*?)(^\\})`, 'gm');
    schema = schema.replace(endRegex, `$1\n  @@map("${oldName}")\n$2`);
}

// 2. Replace type references inside models
// Example: "assets     assets[]" -> "assets     Asset[]"
// Example: "assets     assets   @relation(...)" -> "assets     Asset   @relation(...)"
for (const [oldName, newName] of Object.entries(map)) {
    // Be careful not to replace the field name (first column), only the type name (second column)
    const typeRegex = new RegExp(`(^[ \\t]+[a-zA-Z0-9_]+[ \\t]+)${oldName}(\\?|\\[\\])?([ \\t]*|$)`, 'gm');
    schema = schema.replace(typeRegex, `$1${newName}$2$3`);
}

fs.writeFileSync('prisma/schema.prisma', schema);
console.log('Schema updated.');
