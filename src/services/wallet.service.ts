import { prisma } from "../prisma";
import { TransactionType, Prisma } from "@prisma/client";
import { AppError } from "../utils/appError";

export class WalletService {

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async getBalance(walletId: string) {
    const wallet = await prisma.wallet.findUnique({
      where: { id: walletId }
    });

    if (!wallet) {
      throw new AppError("Wallet not found", 404);
    }

    const result = await prisma.ledgerEntry.aggregate({
      where: { walletId },
      _sum: { amount: true }
    });

    return Number(result._sum.amount || 0);
  }

  async executeTransactionWithRetry(params: {
    fromWalletId?: string;
    toWalletId?: string;
    amount: number;
    referenceId: string;
    type: TransactionType;
  }) {

    const MAX_RETRIES = 3;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this.executeTransaction(params);
      } catch (error: any) {

        const pgCode = error?.code;

        if (
          (pgCode === "40P01" || pgCode === "40001") &&
          attempt < MAX_RETRIES
        ) {
          console.warn(`Retrying transaction (attempt ${attempt})`);
          await this.sleep(100 * attempt);
          continue;
        }

        throw error;
      }
    }

    throw new AppError("Transaction failed after retries", 500);
  }

  private async executeTransaction({
    fromWalletId,
    toWalletId,
    amount,
    referenceId,
    type
  }: {
    fromWalletId?: string;
    toWalletId?: string;
    amount: number;
    referenceId: string;
    type: TransactionType;
  }) {

    if (amount <= 0) {
      throw new AppError("Amount must be greater than zero", 400);
    }

    return prisma.$transaction(async (tx) => {

      const existingTx = await tx.transaction.findUnique({
        where: { referenceId }
      });

      if (existingTx) {
        return { message: "Duplicate request ignored" };
      }

      const transaction = await tx.transaction.create({
        data: {
          referenceId,
          type,
          status: "PENDING"
        }
      });

      try {

        const walletIds = [fromWalletId, toWalletId]
          .filter(Boolean)
          .sort();

        for (const id of walletIds) {
          await tx.$executeRaw`
            SELECT 1 FROM wallet.wallets
            WHERE id = ${id}
            FOR UPDATE
          `;
        }

        if (fromWalletId) {

          const fromWallet = await tx.wallet.findUnique({
            where: { id: fromWalletId }
          });

          if (!fromWallet) {
            throw new AppError("From wallet not found", 404);
          }

          const balance = await tx.ledgerEntry.aggregate({
            where: { walletId: fromWalletId },
            _sum: { amount: true }
          });

          const currentBalance = Number(balance._sum.amount || 0);

          if (currentBalance < amount) {
            throw new AppError("Insufficient balance", 400);
          }

          await tx.ledgerEntry.create({
            data: {
              walletId: fromWalletId,
              assetId: fromWallet.assetId,
              transactionId: transaction.id,
              amount: new Prisma.Decimal(-amount)
            }
          });
        }

        if (toWalletId) {

          const toWallet = await tx.wallet.findUnique({
            where: { id: toWalletId }
          });

          if (!toWallet) {
            throw new AppError("To wallet not found", 404);
          }

          await tx.ledgerEntry.create({
            data: {
              walletId: toWalletId,
              assetId: toWallet.assetId,
              transactionId: transaction.id,
              amount: new Prisma.Decimal(amount)
            }
          });
        }

        await tx.transaction.update({
          where: { id: transaction.id },
          data: { status: "COMPLETED" }
        });

        return { message: "Transaction successful" };

      } catch (error) {

        await tx.transaction.update({
          where: { id: transaction.id },
          data: { status: "FAILED" }
        });

        throw error;
      }
    });
  }
}