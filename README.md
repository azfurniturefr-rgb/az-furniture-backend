Backend for AZ Furniture - updated payment endpoints
Endpoints:
POST /payment
  body: { amount, currency, payment_method, order }
  - payment_method: 'card' or 'stripe' -> creates Stripe PaymentIntent and returns client_secret
  - 'alma' -> creates Alma payment (example) and returns Alma response
  - 'cod' -> cash on delivery
PATCH /payment/confirm
  body: { paymentIntentId, provider, order }
POST /webhook/stripe
POST /webhook/alma

.env (create from .env.updated.backend)
- STRIPE_SECRET_KEY=sk_live_...
- ALMA_MERCHANT=...
- ALMA_SECRET_KEY=...
- STRIPE_WEBHOOK_SECRET=...
- CLIENT_URL=frontend url (e.g. http://localhost:3000)
