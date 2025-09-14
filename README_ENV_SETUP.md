# Environment Setup for AZ Furniture Backend

This file contains instructions for setting up environment variables for the backend, including Alma payment variables.

## Existing .env file

The `.env` file contains most environment variables such as:

- PORT
- MONGODB_URI
- JWT_SECRET
- BYCRYPT_SALT
- EMAIL_SENDER_ADDRESS
- ADMIN_EMAIL_ADDRESS
- EMAIL_SENDER_APP_PASSWORD
- CLIENT_URL
- STRIPE_SECRET_KEY

## Alma Payment Environment Variables

Due to restrictions on editing the `.env` file directly, Alma payment environment variables are stored in a separate file `alma.env`.

You need to load these variables when running the backend locally or configure them in your deployment platform.

### Alma Variables

```
ALMA_MERCHANT=merchant_1215Zua42IL1hQsS6KRnsApHcQQEb3fizI
ALMA_SECRET_KEY=sk_live_2a7lvW9wZYNpR4s3OZMLzg5u
```

## How to use

- When running locally, load both `.env` and `alma.env` files.
- When deploying, add these Alma variables to your deployment environment variables configuration.

## Deployment

Follow the deployment instructions in `DEPLOYMENT_INSTRUCTIONS.md` for Render and Vercel.
