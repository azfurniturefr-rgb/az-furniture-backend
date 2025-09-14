const mongoose = require("mongoose");

const OrderSchema = new mongoose.Schema({
  customerName: String,
  customerEmail: String,
  customerPhone: String,
  address: String,
  amount: Number,
  provider: String, // stripe, alma, cod
  status: { type: String, default: "pending" }, // pending, paid, failed
  paymentIntentId: String, // stripe
  almaPaymentId: String, // alma
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Order", OrderSchema);
