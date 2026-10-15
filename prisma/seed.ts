import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.SEED_OWNER_EMAIL || "").toLowerCase().trim();
  const password = process.env.SEED_OWNER_PASSWORD || "";
  const businessName = process.env.SEED_BUSINESS_NAME || "Canopy Tree Service";
  const ownerName = process.env.SEED_OWNER_NAME || "Owner";

  if (!email || !password || password.length < 8) {
    throw new Error(
      "Set SEED_OWNER_EMAIL and SEED_OWNER_PASSWORD (min 8 chars) before seeding",
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Owner already exists: ${email}`);
    return;
  }

  const business = await prisma.business.create({
    data: {
      name: businessName,
      timezone: "America/Detroit",
      users: {
        create: {
          email,
          passwordHash,
          name: ownerName,
          role: "owner",
        },
      },
    },
    include: { users: true },
  });

  console.log(`Seeded business "${business.name}" with owner ${email}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
