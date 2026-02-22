import express from "express";
import { WalletService } from "../services/wallet.service";
import { TransactionType } from "@prisma/client";

const router = express.Router();
const service = new WalletService();

router.get("/:walletId/balance", async (req, res, next) => {
  try {
    const balance = await service.getBalance(req.params.walletId);
    res.json({ success: true, balance });
  } catch (err) {
    next(err);
  }
});

router.post("/topup", async (req, res, next) => {
  try {
    const result = await service.executeTransactionWithRetry({
      fromWalletId: req.body.treasuryWalletId,
      toWalletId: req.body.walletId,
      amount: req.body.amount,
      referenceId: req.body.referenceId,
      type: TransactionType.TOPUP
    });

    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

router.post("/spend", async (req, res, next) => {
  try {
    const result = await service.executeTransactionWithRetry({
      fromWalletId: req.body.walletId,
      toWalletId: req.body.treasuryWalletId,
      amount: req.body.amount,
      referenceId: req.body.referenceId,
      type: TransactionType.SPEND
    });

    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

router.post("/bonus", async (req, res, next) => {
  try {
    const result = await service.executeTransactionWithRetry({
      fromWalletId: req.body.treasuryWalletId,
      toWalletId: req.body.walletId,
      amount: req.body.amount,
      referenceId: req.body.referenceId,
      type: TransactionType.BONUS
    });

    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

export default router;