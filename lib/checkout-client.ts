import type { CheckoutDetails } from "@/components/provider";
type Payment = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};
type Instance = {
  open: () => void;
  on: (event: string, cb: () => void) => void;
};
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => Instance;
  }
}
let loader: Promise<void> | undefined;
export async function openCheckout(
  details: CheckoutDetails,
  verify: (payment: Payment) => Promise<void>,
) {
  if (!window.Razorpay)
    await (loader ??= new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      const timer = setTimeout(() => {
        loader = undefined;
        script.remove();
        reject(
          new Error(
            "The payment window did not load in time. Please try again.",
          ),
        );
      }, 15000);
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = () => {
        clearTimeout(timer);
        resolve();
      };
      script.onerror = () => {
        clearTimeout(timer);
        loader = undefined;
        script.remove();
        reject(
          new Error("The payment window could not load. Please try again."),
        );
      };
      document.head.appendChild(script);
    }));
  if (!window.Razorpay)
    throw new Error("The payment window is unavailable. Please try again.");
  return new Promise<void>((resolve, reject) => {
    const checkout = new window.Razorpay!({
      key: details.key,
      order_id: details.orderId,
      amount: details.amount,
      currency: details.currency,
      name: details.name,
      description: details.description,
      theme: { color: "#273bd7" },
      handler: (payment: Payment) => {
        void verify(payment)
          .then(resolve)
          .catch(() =>
            reject(
              new Error(
                "The payment is awaiting confirmation. Refresh the round before you try another payment.",
              ),
            ),
          );
      },
      modal: {
        ondismiss: () =>
          reject(
            new Error(
              "The payment window was closed. Refresh the round to check its payment status.",
            ),
          ),
      },
    });
    checkout.on("payment.failed", () =>
      reject(
        new Error(
          "The payment did not complete. Refresh the round before you try again.",
        ),
      ),
    );
    checkout.open();
  });
}
