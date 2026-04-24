import { PrismaClient, RoleType, SystemRole } from "@prisma/client";
import crypto from "crypto";

export async function seedUsers(prisma: PrismaClient) {
  console.log("Seeding Users...");

  const hashPassword = (password: string) => {
    const salt = "f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0";
    const hash = crypto
      .pbkdf2Sync(password, salt, 1000, 64, "sha512")
      .toString("hex");
    return `${salt}:${hash}`;
  };

  const password = hashPassword("password123");

  const users = [
    {
      email: "admin@foxpassport.com",
      name: "Super Admin",
      username: "admin",
      password,
      systemRole: SystemRole.admin,
      roleType: [RoleType.host],
      phone: "+639123456789",
    },
    {
      email: "mayor@foxpassport.com",
      name: "Hon. Mayor",
      username: "mayor_joe",
      password,
      systemRole: SystemRole.user,
      roleType: [RoleType.mayor],
      phone: "+639123456781",
    },
    {
      email: "host@foxpassport.com",
      name: "Event Host",
      username: "host_anna",
      password,
      systemRole: SystemRole.user,
      roleType: [RoleType.host],
      phone: "+639123456782",
    },
    {
      email: "asset@foxpassport.com",
      name: "Asset Provider",
      username: "foxer_asset",
      password,
      systemRole: SystemRole.user,
      roleType: [RoleType.foxerAsset],
      phone: "+639123456783",
    },
    {
      email: "service@foxpassport.com",
      name: "Service Provider",
      username: "foxer_service",
      password,
      systemRole: SystemRole.user,
      roleType: [RoleType.foxerService],
      phone: "+639123456784",
    },
    {
      email: "investor@foxpassport.com",
      name: "Investor User",
      username: "investor_mark",
      password,
      systemRole: SystemRole.user,
      roleType: [RoleType.investor],
      phone: "+639123456785",
    },
  ];

  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: user,
    });
  }

  return prisma.user.findMany();
}
