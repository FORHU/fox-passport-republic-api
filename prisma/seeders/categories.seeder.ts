import { PrismaClient } from "@prisma/client"

export async function seedCategories(prisma: PrismaClient) {
  // 1. Create Main Category
  const main = await prisma.category.upsert({
    where: { slug: "main-categories" },
    update: {},
    create: {
      name: "Main Categories",
      slug: "main-categories",
      description: "Root parent category",
    },
  })

  // 2. Create Subcategories
  const subCategories = [
    {
      name: "Equipment",
      slug: "equipment",
      description: "Event equipment",
      parentCategoryId: main.id,
    },
    {
      name: "Venues",
      slug: "venues",
      description: "Event venues",
      parentCategoryId: main.id,
    },
    {
      name: "Services",
      slug: "services",
      description: "Event services",
      parentCategoryId: main.id,
    },
  ]

  for (const cat of subCategories) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: { parentCategoryId: main.id },
      create: cat,
    })
  }
}