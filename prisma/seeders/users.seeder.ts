import { PrismaClient, UserRole } from "@prisma/client"
import crypto from "crypto"

type MockUser = {
  email: string
  name: string
  username: string
  phone: string
  role: UserRole
  isHost: boolean
}

// 👇 Match AuthSvc.register hashing
function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex")

  const hash = crypto
    .pbkdf2Sync(password, salt, 1000, 64, "sha512")
    .toString("hex")

  return `${salt}:${hash}`
}
//pasword: password123

export async function seedUsers(prisma: PrismaClient) {
  const mockUsers: MockUser[] = [
    {
      email: "admin@app.com",
      name: "Admin User",
      username: "admin",
      phone: "09123456789",
      role: UserRole.admin,
      isHost: false,
    },
    {
      email: "host@app.com",
      name: "Venue Host",
      username: "host",
      phone: "09123456789",
      role: UserRole.mayor,
      isHost: true,
    },
    {
      email: "user@app.com",
      name: "Regular User",
      username: "maria",
      phone: "09123456789",
      role: UserRole.user,
      isHost: false,
    },
    {
      email: "foxer@app.com",
      name: "Foxer User",
      username: "foxer",
      phone: "09123456789",
      role: UserRole.foxer,
      isHost: false,
    },
    {
      email: "host2@app.com",
      name: "Venue Host 2",
      username: "host2",
      phone: "09123456789",
      role: UserRole.mayor,
      isHost: true,
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
        isHost: u.isHost,
        isVerified: true,
      },

      create: {
        email: u.email,
        password,
        name: u.name,
        username: u.username,
        phone: u.phone,
        role: u.role,
        isHost: u.isHost,
        isVerified: true,
      },
    })
    createdUsers[u.email] = user
  }

  return createdUsers
}