import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import walletRoutes from "./routes/wallet.routes";
import { globalErrorHandler } from "./middleware/error.middleware";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

/*
  Health Check Endpoint
  Useful for Docker / Load Balancers
*/
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Wallet Service is healthy"
  });
});

/*
  Wallet Routes
*/
app.use("/wallet", walletRoutes);

/*
  404 Handler
*/
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found"
  });
});

/*
  Global Error Handler (Must be last)
*/
app.use(globalErrorHandler);

/*
  Start Server
*/
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

/*
  Graceful Shutdown
*/
process.on("SIGTERM", () => {
  console.log("SIGTERM received. Shutting down gracefully...");
  server.close(() => {
    console.log("Process terminated.");
  });
});