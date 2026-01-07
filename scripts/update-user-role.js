const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function updateUserRole() {
  try {
    const email = 'clyde@gmail.com';

    // Update user role to host
    const updatedUser = await prisma.user.update({
      where: { email },
      data: {
        role: 'host',
        isHost: true,
      },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        isHost: true,
      },
    });

    console.log('✅ User updated successfully:');
    console.log(updatedUser);
  } catch (error) {
    console.error('❌ Error updating user:', error);
  } finally {
    await prisma.$disconnect();
  }
}

updateUserRole();
