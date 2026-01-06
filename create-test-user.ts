import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function createTestUser() {
    try {
        // Hash the password
        const hashedPassword = await bcrypt.hash('Test123!', 10);

        // Create the user
        const user = await prisma.user.create({
            data: {
                email: 'testhost@example.com',
                password: hashedPassword,
                name: 'Test Host User',
                username: 'testhost',
                role: 'host',
                isHost: true,
                isVerified: true
            }
        });

        console.log('\n✅ User created successfully!');
        console.log('=====================================');
        console.log('User ID (hostId):', user.id);
        console.log('Email:', user.email);
        console.log('Username:', user.username);
        console.log('Role:', user.role);
        console.log('=====================================\n');
        console.log('📋 Copy this UUID for Postman testing:');
        console.log(user.id);
        console.log('\n');

    } catch (error: any) {
        console.error('Error creating user:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

createTestUser();
