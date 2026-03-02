const fs = require('fs');
const path = require('path');

// 1. Fix schema.prisma
let schema = fs.readFileSync('prisma/schema.prisma', 'utf8');

// In Booking: "booking_attendees BookingAttendee[]" -> "attendees BookingAttendee[]"
schema = schema.replace(/(^[ \t]+)booking_attendees([ \t]+BookingAttendee\[\].*)/gm, '$1attendees$2');

// In Event: "user User @relation(fields: [organizerId])" -> "organizer User @relation(fields: [organizerId])"
schema = schema.replace(/(^[ \t]+)user([ \t]+User.+@relation.fields: \[organizerId\].*)/gm, '$1organizer$2');

fs.writeFileSync('prisma/schema.prisma', schema);

// 2. Fix TS files
function replaceInDir(dir, search, replacement) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            replaceInDir(fullPath, search, replacement);
        } else if (fullPath.endsWith('.ts')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            if (content.includes(search)) {
                content = content.split(search).join(replacement);
                fs.writeFileSync(fullPath, content);
            }
        }
    }
}

replaceInDir('src', 'prisma.users.', 'prisma.user.');
replaceInDir('src/controllers', 'prisma.users.', 'prisma.user.');

console.log('Schema and TS files updated.');
