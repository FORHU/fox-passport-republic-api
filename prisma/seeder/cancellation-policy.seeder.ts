import { PrismaClient } from "@prisma/client";

const policies = [
  {
    name: "Flexible",
    description:
      "Full refund up to 24 hours before the event; 50% refund within 24 hours.",
    rules: [
      { hoursBeforeEvent: 24, refundPercent: 100 },
      { hoursBeforeEvent: 0, refundPercent: 50 },
    ],
  },
  {
    name: "Moderate",
    description:
      "Full refund up to 72 hours before; 50% refund 24–72 hours before; no refund within 24 hours.",
    rules: [
      { hoursBeforeEvent: 72, refundPercent: 100 },
      { hoursBeforeEvent: 24, refundPercent: 50 },
      { hoursBeforeEvent: 0, refundPercent: 0 },
    ],
  },
  {
    name: "Strict",
    description:
      "Full refund up to 7 days before; 50% refund 2–7 days before; no refund within 48 hours.",
    rules: [
      { hoursBeforeEvent: 168, refundPercent: 100 },
      { hoursBeforeEvent: 48, refundPercent: 50 },
      { hoursBeforeEvent: 0, refundPercent: 0 },
    ],
  },
  {
    name: "Non-Refundable",
    description: "No refunds under any circumstances.",
    rules: [{ hoursBeforeEvent: 0, refundPercent: 0 }],
  },
];

export async function seedCancellationPolicies(prisma: PrismaClient) {
  console.log("Seeding cancellation policies...");

  // Under simplified cancellation policies (api#436), deactivate Moderate and Strict
  await prisma.cancellationPolicy.updateMany({
    where: { name: { in: ["Moderate", "Strict"] } },
    data: { isActive: false },
  });

  const activePolicies = policies.filter(
    (p) => p.name === "Flexible" || p.name === "Non-Refundable",
  );

  for (const policy of activePolicies) {
    const existing = await prisma.cancellationPolicy.findFirst({
      where: { name: policy.name },
    });
    if (existing) continue;

    await prisma.cancellationPolicy.create({
      data: {
        name: policy.name,
        description: policy.description,
        isActive: true,
        rules: {
          create: policy.rules,
        },
      },
    });
  }

  console.log(`Seeded active cancellation policies.`);
}
