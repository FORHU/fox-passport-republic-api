import { PrismaClient, UserRole } from "@prisma/client"
import crypto from "crypto"

type MockUser = {
  email: string
  name: string
  username: string
  phone: string
  profileImage: string
  role: UserRole
}

// 👇 Match AuthSvc.register hashing
function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex")

  const hash = crypto
    .pbkdf2Sync(password, salt, 1000, 64, "sha512")
    .toString("hex")

  return `${salt}:${hash}`
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
      email: "host2@app.com",
      name: "Venue Host 2",
      username: "host2",
      phone: "09123456789",
      profileImage: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1a",
      role: UserRole.mayor,
    },
  ]

  const createdUsers: Record<string, any> = {}

  for (const u of mockUsers) {
    const password = hashPassword("password123")

    const user = await prisma.user.upsert({
      where: { email: u.email },

      update: {
        password,
        role: u.role,
        name: u.name,
        username: u.username,
      },

      create: {
        email: u.email,
        password,
        name: u.name,
        username: u.username,
        phone: u.phone,
        profileImage: u.profileImage,
        role: u.role,
      },
    })

    console.log(`✅ Seeded/Updated user: ${u.email}`)
    createdUsers[u.email] = user
  }

  return createdUsers
}