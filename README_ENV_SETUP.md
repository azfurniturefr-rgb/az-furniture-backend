# Environment Variables Setup for AZ Furniture Backend

To configure the backend environment variables, create a `.env` file in the `az-furniture-backend` directory with the following content:

```
PORT=8000
STRIPE_SECRET_KEY=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
ALMA_MERCHANT=merchant_1215Zua42IL1hQsS6KRnsApHcQQEb3fizI
ALMA_SECRET_KEY=sk_live_2a7lvW9wZYNpR4s3OZMLzg5u
STRIPE_WEBHOOK_SECRET=whsec_... # set this from your Stripe dashboard for webhooks
CLIENT_URL=http://localhost:3000
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
BYCRYPT_SALT=8
EMAIL_SENDER_ADDRESS=your_email@example.com
ADMIN_EMAIL_ADDRESS=your_email@example.com
EMAIL_SENDER_APP_PASSWORD=your_email_app_password
```

Replace the placeholder values with your actual credentials and secrets.

This file should NOT be committed to version control for security reasons.

For deployment platforms like Render or Heroku, set these environment variables in the platform's dashboard instead of using a `.env` file.
