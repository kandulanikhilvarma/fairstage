ALTER TABLE users ADD COLUMN IF NOT EXISTS razorpay_account_id text UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS razorpay_ready boolean NOT NULL DEFAULT false;
ALTER TABLE rounds ADD COLUMN IF NOT EXISTS razorpay_order_id text UNIQUE;
ALTER TABLE rounds ADD COLUMN IF NOT EXISTS razorpay_payment_id text UNIQUE;
ALTER TABLE rounds ADD COLUMN IF NOT EXISTS razorpay_transfer_id text UNIQUE;
ALTER TABLE rounds ADD COLUMN IF NOT EXISTS razorpay_release_body jsonb;
CREATE TABLE IF NOT EXISTS razorpay_events (
  id text PRIMARY KEY,
  type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
