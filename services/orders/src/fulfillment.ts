/**
 * Tell the fulfillment service (coderabbit-demo/mmani-demo-prs-consumer) that
 * an order was placed. Fulfillment fetches the order itself, so the event only
 * carries the id. Delivery is best effort; fulfillment also reconciles nightly.
 */
export async function notifyOrderPlaced(fulfillmentUrl: string | undefined, orderId: string) {
  if (!fulfillmentUrl) return;
  try {
    await fetch(`${fulfillmentUrl.replace(/\/+$/, "")}/events/order-placed`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "order.placed", orderId }),
      signal: AbortSignal.timeout(2000),
    });
  } catch (err) {
    console.warn(`order.placed delivery failed for ${orderId}`, err);
  }
}
