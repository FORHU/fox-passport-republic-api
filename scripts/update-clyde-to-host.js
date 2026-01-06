const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function updateClydeToHost() {
  try {
    // Update Clyde (username: 'Clyde') to host
    const updatedUser = await prisma.user.update({
      where: { username: 'Clyde' },
      data: {
        role: 'host',
        isHost: true,
      },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        isHost: true,
      },
    });

    console.log('✅ Clyde updated to host successfully:');
    console.log(updatedUser);
  } catch (error) {
    console.error('❌ Error updating Clyde:', error);
  } finally {
    await prisma.$disconnect();
  }
}

updateClydeToHost();
