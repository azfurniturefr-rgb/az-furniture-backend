const Order = require("./models/Order");
const mongoose = require("mongoose");
require('dotenv').config();
const express = require('express');
const app = express();

mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
 .then(()=>console.log("MongoDB connected"))
 .catch(err=>console.error("MongoDB connection error:",err));
const Stripe = require('stripe');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const crypto = require('crypto');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const ALMA_API_URL = process.env.ALMA_API_URL || 'https://api.getalma.eu/v1/public/payment'; // configurable
const ALMA_MERCHANT = process.env.ALMA_MERCHANT;
const ALMA_SECRET_KEY = process.env.ALMA_SECRET_KEY;

app.use(express.json({
  verify: function(req, res, buf) {
    req.rawBody = buf.toString();
  }
}));

// Helper: simple order store in memory for demo (replace with DB)
const ORDERS = {};

// Create payment (Stripe PaymentIntent or Alma session)
app.post('/payment', async (req, res) => {
  try {
    const { amount, currency = 'eur', payment_method, order } = req.body;

    // amount expected in euros or cents? We'll expect amount in euros (float) and convert to cents for Stripe
    const amountFloat = parseFloat(amount);
    if (isNaN(amountFloat) || amountFloat <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    // Save basic order (demo). In real app, create order in DB and attach payment intent id later.
    const orderId = order?.id || `ord_${Date.now()}`;
    ORDERS[orderId] = { id: orderId, order, amount: amountFloat, status: 'created' };

    if (payment_method === 'card' || payment_method === 'Stripe' || payment_method === 'stripe') {
      // Create Stripe PaymentIntent (amount in cents)
      const pi = await stripe.paymentIntents.create({
        amount: Math.round(amountFloat * 100),
        currency: currency,
        description: `Order ${orderId}`,
        metadata: { orderId },
      });
      // Save payment intent id
      ORDERS[orderId].stripe_payment_intent = pi.id;
      ORDERS[orderId].status = 'pending_payment';

      return res.json({ provider: 'stripe', client_secret: pi.client_secret, payment_intent_id: pi.id, orderId });
    } else if (payment_method === 'alma' || payment_method === 'Alma') {
      // Enforce Alma credit limit (max 2000 euros as requested)
      const maxCredit = 2000;
      if (amountFloat > maxCredit) {
        return res.status(400).json({ error: `Alma credit limit exceeded. Max allowed is ${maxCredit} EUR.` });
      }

      if (!ALMA_MERCHANT || !ALMA_SECRET_KEY) {
        // Return an informative error if Alma is not configured
        return res.status(500).json({ error: 'Alma is not configured on the server. Please set ALMA_MERCHANT and ALMA_SECRET_KEY.' });
      }

      // Call Alma public API to create a payment (this is an example; adjust per Alma API docs)
      // We will forward the orderId and amount. Alma may expect different parameters.
      const almaPayload = {
        merchant: ALMA_MERCHANT,
        amount: Math.round(amountFloat * 100), // cents
        currency: currency,
        order_reference: orderId,
        // additional fields may be required by Alma (customer, return_url...)
        return_url: `${process.env.CLIENT_URL || 'http://localhost:3000'}/alma/return?orderId=${orderId}`
      };

      // Note: adjust headers/auth according to Alma documentation. Using Authorization if required.
      const axios = require("axios");
      const almaRes = await axios.post(
        process.env.ALMA_API_URL,
        almaPayload,
        {
          headers: {
            'Authorization': `Bearer ${ALMA_SECRET_KEY}`,
            'Content-Type': 'application/json',
          }
        }
      );

      const almaJson = almaRes.data;

      // Alma might return a redirect URL or checkout token - pass it back to frontend
      // For demo, if Alma returns {redirect_url: ...} we use that. Otherwise we'll simulate.
      let redirectUrl = almaJson.redirect_url || almaJson.url || almaJson.checkout_url;
      if (!redirectUrl) {
        // Simulate a redirect URL to a local demo page that then triggers a webhook (for testing)
        const token = crypto.randomBytes(12).toString('hex');
        ORDERS[orderId].alma_token = token;
        // create a simple redirect endpoint below /alma/checkout/:token
        redirectUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}/alma/checkout/${token}`;
      }

      ORDERS[orderId].status = 'pending_alma';
      return res.json({ provider: 'alma', redirect_url: redirectUrl, alma_response: almaJson, orderId });
    } else if (payment_method === 'cod' || payment_method === 'CashonDelivery' || payment_method === 'COD') {
      // Cash on Delivery: mark order as placed but unpaid
      ORDERS[orderId].status = 'cod_placed';
      return res.json({ provider: 'cod', orderId, message: 'Order placed. Pay on delivery.' });
    } else {
      return res.status(400).json({ error: 'Unsupported payment method' });
    }
  } catch (err) {
    console.error('Error in /payment', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Endpoint to confirm payment (example: confirm Stripe PI status)
app.patch('/payment/confirm', express.json(), async (req, res) => {
  try {
    const { payment_intent_id, orderId } = req.body;
    if (!payment_intent_id) return res.status(400).json({ error: 'Missing payment_intent_id' });

    const pi = await stripe.paymentIntents.retrieve(payment_intent_id);
    if (!pi) return res.status(404).json({ error: 'PaymentIntent not found' });

    if (pi.status === 'succeeded' || pi.status === 'requires_capture') {
      ORDERS[orderId] = ORDERS[orderId] || {};
      ORDERS[orderId].status = 'paid';
      return res.json({ success: true, status: pi.status });
    }

    return res.json({ success: false, status: pi.status });
  } catch (err) {
    console.error('Error in /payment/confirm', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Stripe webhook handler (verifies signature)
app.post('/webhook/stripe', bodyParser.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.warn('No STRIPE_WEBHOOK_SECRET set - webhook raw body will be logged but not verified.');
    console.log('Payload:', req.body.toString());
    return res.json({ received: true });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed.', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle event types
  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object;
    const orderId = pi.metadata?.orderId;
    if (orderId && ORDERS[orderId]) {
      ORDERS[orderId].status = 'paid';
    }
  }

  res.json({ received: true });
});

// Alma webhook placeholder - Alma webhook route will depend on Alma implementation
app.post('/webhook/alma', express.json(), (req,res) => {
  // verify Alma webhook signature if Alma provides one - check docs
  console.log('Alma webhook received', req.body);
  // you should update the order state here based on the webhook payload
  // example: ORDERS[orderId].status = 'paid';
  res.json({received: true});
});

// Demo Alma checkout page - simulates a merchant page that redirects back to client after "payment"
app.get('/alma/checkout/:token', (req, res) => {
  const token = req.params.token;
  // Find order by token
  const orderEntry = Object.values(ORDERS).find(o => o.alma_token === token);
  if (!orderEntry) {
    return res.status(404).send('Invalid token');
  }
  const orderId = orderEntry.id;
  // Render a simple page that simulates Alma checkout and then "completes" by calling webhook
  res.send(`
    <html>
      <body>
        <h1>Alma Demo Checkout</h1>
        <p>Simulating Alma checkout for order ${orderId}. Click to complete payment (demo).</p>
        <form method="post" action="/alma/complete">
          <input type="hidden" name="orderId" value="${orderId}" />
          <button type="submit">Complete Payment (simulate)</button>
        </form>
      </body>
    </html>
  `);
});

// Endpoint that simulates Alma calling webhook / completing payment
app.post('/alma/complete', express.urlencoded({ extended: true }), (req, res) => {
  const { orderId } = req.body;
  if (ORDERS[orderId]) {
    ORDERS[orderId].status = 'paid_via_alma_demo';
    // In real flow Alma would call your webhook; for demo we just redirect back to client return_url
    const returnUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}/order/success?orderId=${orderId}`;
    return res.redirect(returnUrl);
  }
  res.status(400).send('Order not found');
});

const port = process.env.PORT || 8000;
app.listen(port, ()=>console.log('Server listening on', port));


// Alma integration
if (provider === "alma") {
  try {
    if (amount > 2000 * 100) {
      return res.status(400).json({ error: "Amount exceeds €2000 Alma limit" });
    }
    const axios = require("axios");
    const almaRes = await axios.post(
      process.env.ALMA_API_URL,
      {
        purchase_amount: amount,
        installments_count: 4,
        customer: {
          first_name: customerName,
          email: customerEmail,
          phone: customerPhone,
        },
        return_url: `${process.env.CLIENT_URL}/order/success`,
        merchant_reference: "order-" + Date.now()
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.ALMA_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );
    const payment = almaRes.data;
    const order = new Order({
      customerName, customerEmail, customerPhone, address,
      amount, provider: "alma", almaPaymentId: payment.id
    });
    await order.save();
    return res.json({ provider: "alma", redirectUrl: payment.url });
  } catch (err) {
    console.error("Alma error:", err.response?.data || err.message);
    return res.status(500).json({ error: "Alma payment failed" });
  }
}