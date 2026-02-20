import { PrismaClient, UserRole } from "@prisma/client"

type MockUser = {
  email: string
  name: string
  username: string
  phone: string
  profileImage: string
  role: UserRole
}

export async function seedUsers(prisma: PrismaClient) {
  const mockUsers: MockUser[] = [
    {
      email: "admin@app.com",
      name: "Admin User",
      username: "admin",
      phone: "09123456789",
      profileImage: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1a",
      role: UserRole.admin,
    },
    {
      email: "host@app.com",
      name: "Venue Host",
      username: "host",
      phone: "09123456789",
      profileImage: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1a",
      role: UserRole.mayor,
    },
    {
      email: "user@app.com",
      name: "Regular User",
      username: "maria",
      phone: "09123456789",
      profileImage: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1a",
      role: UserRole.user,
    },
    {
      email: "foxer@app.com",
      name: "Foxer User",
      username: "foxer",
      phone: "09123456789",
      profileImage: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1a",
      role: UserRole.foxer,
    },
    {
      email: "investor@app.com",
      name: "Investor User",
      username: "investor",
      phone: "09123456789",
      profileImage: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1a",
      role: UserRole.investor,
    },
  ]

  const createdUsers: Record<string, any> = {}

  for (const u of mockUsers) {
    // Check if user already exists
    const existing = await prisma.user.findUnique({
      where: { email: u.email },
    })

    if (existing) {
      // Already exists → skip creation
      createdUsers[u.email] = existing
      continue
    }

    // Create new user → auto-increment id will be generated
    const user = await prisma.user.create({
      data: {
        email: u.email,
        password: "hashed_password", // ideally hash this before seeding
        name: u.name,
        username: u.username,
        phone: u.phone,
        profileImage: u.profileImage,
        role: u.role,
      },
    })

    createdUsers[u.email] = user
  }

  return createdUsers
}
