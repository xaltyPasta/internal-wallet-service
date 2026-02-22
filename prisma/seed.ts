import { PrismaClient, Prisma, TransactionType } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {

  const gold = await prisma.asset.create({
    data: { name: "Gold Coins", symbol: "GC" }
  });

  const treasuryWallet = await prisma.wallet.create({
    data: { assetId: gold.id }
  });

  const alice = await prisma.user.create({
    data: { name: "Alice", email: "alice@test.com" }
  });

  const bob = await prisma.user.create({
    data: { name: "Bob", email: "bob@test.com" }
  });

  const aliceWallet = await prisma.wallet.create({
    data: { userId: alice.id, assetId: gold.id }
  });

  await prisma.wallet.create({
    data: { userId: bob.id, assetId: gold.id }
  });

  const initialTx = await prisma.transaction.create({
    data: {
      referenceId: "initial-funding",
      type: TransactionType.BONUS
    }
  });

  await prisma.ledgerEntry.create({
    data: {
      walletId: treasuryWallet.id,
      assetId: gold.id,
      transactionId: initialTx.id,
      amount: new Prisma.Decimal(1000000)
    }
  });
}

main().finally(() => prisma.$disconnect());