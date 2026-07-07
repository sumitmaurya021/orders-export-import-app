import { rateLimiter } from "./shopify-rate-limiter.server";
import { findExistingOrder } from "./order-matcher.server";

/**
 * Processes a single grouped order based on its command.
 */
export async function processOrderRowGroup(group, admin, logger, options = {}) {
  const { command, identifier, orderFields, lineItems } = group;

  if (command === "IGNORE") {
    await logger.info(`Order skip kar diya gaya hai (IGNORE command).`);
    return;
  }

  try {
    const existingOrder = await findExistingOrder(identifier, admin);

    switch (command) {
      case "NEW":
      case "MERGE":
        if (existingOrder) {
          if (command === "NEW") {
            await logger.warning(`Order ${identifier} pehle se exist karta hai. NEW command skip kar di gayi hai. Update karne ke liye UPDATE ya MERGE use karein.`);
            return;
          }
          await logger.info(`Order ${identifier} mil gaya hai. MERGE command ab is order ko update karegi.`);
          await updateExistingOrder(existingOrder, orderFields, lineItems, admin, logger);
        } else {
          await createNewOrderViaDraft(orderFields, lineItems, admin, logger, identifier, options);
        }
        break;

      case "UPDATE":
        if (!existingOrder) {
          await logger.error(`Update failed: Order ${identifier} nahi mila.`);
          return;
        }
        await updateExistingOrder(existingOrder, orderFields, lineItems, admin, logger);
        break;

      case "REPLACE":
        if (existingOrder) {
          await logger.warning(`REPLACE process: Purana order ${identifier} cancel kiya ja raha hai. Naya Order ID generate hoga.`);
          await cancelOrder(existingOrder.id, admin, logger);
        }
        await createNewOrderViaDraft(orderFields, lineItems, admin, logger, identifier, options);
        break;

      case "DELETE":
        if (!existingOrder) {
          await logger.error(`Delete failed: Order ${identifier} nahi mila.`);
          return;
        }
        await logger.info(`DELETE: Shopify me orders ko completely delete nahi kiya ja sakta. Order ${identifier} ko cancel kiya ja raha hai.`);
        await cancelOrder(existingOrder.id, admin, logger);
        break;

      default:
        await logger.error(`Unknown command: ${command}. Kripya valid command use karein (NEW, UPDATE, MERGE, REPLACE, DELETE, IGNORE).`);
    }
  } catch (error) {
    // Make error user-friendly
    const friendlyError = error.message.includes("THROTTLED") 
      ? "Shopify API ki limit cross ho gayi thi (Throttled), aur max retries fail ho gaye."
      : error.message;
    await logger.error(`Error processing order: ${friendlyError}`);
  }
}

async function createNewOrderViaDraft(orderFields, lineItems, admin, logger, originalIdentifier, options) {
  const lineItemsInput = lineItems.map(item => ({
    title: item.title || "Custom Item",
    sku: item.sku || "",
    originalUnitPrice: item.price ? parseFloat(item.price) : 0.00,
    quantity: item.quantity || 1
  }));

  const input = {
    lineItems: lineItemsInput,
    note: orderFields["Note"] || "",
    tags: orderFields["Tags"] ? orderFields["Tags"].split(",").map(t => t.trim()) : [],
  };

  const email = orderFields["Email"] || orderFields["Customer: Email"];
  
  if (email && options.createCustomers) {
    input.email = email;
  } else if (email) {
    input.customAttributes = [{ key: "Guest Email", value: email }];
    await logger.info(`Customer creation disabled: Order ko as guest order banaya ja raha hai. Email custom attribute me save kar diya gaya hai.`);
  }

  const createDraftResponse = await rateLimiter.withRetry(async () => {
    return await admin.graphql(
      `#graphql
      mutation draftOrderCreate($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder {
            id
          }
          userErrors {
            field
            message
          }
        }
      }`,
      { variables: { input } }
    );
  });

  const userErrors = createDraftResponse.data?.draftOrderCreate?.userErrors;
  if (userErrors && userErrors.length > 0) {
    throw new Error(`Draft banane me error: ${userErrors.map(e => e.message).join(", ")}`);
  }

  const draftId = createDraftResponse.data?.draftOrderCreate?.draftOrder?.id;
  if (!draftId) {
    throw new Error("Draft order generate nahi ho paya, Shopify ne ID return nahi kiya.");
  }

  const completeResponse = await rateLimiter.withRetry(async () => {
    return await admin.graphql(
      `#graphql
      mutation draftOrderComplete($id: ID!) {
        draftOrderComplete(id: $id, paymentPending: false) {
          draftOrder {
            order {
              id
              name
            }
          }
          userErrors {
            field
            message
          }
        }
      }`,
      { variables: { id: draftId } }
    );
  });

  const completeErrors = completeResponse.data?.draftOrderComplete?.userErrors;
  if (completeErrors && completeErrors.length > 0) {
    throw new Error(`Draft complete karne me error: ${completeErrors.map(e => e.message).join(", ")}`);
  }

  const realOrderName = completeResponse.data?.draftOrderComplete?.draftOrder?.order?.name;
  await logger.info(`Successfully naya order ${realOrderName} generate ho gaya hai.`);
}

async function updateExistingOrder(existingOrder, orderFields, lineItems, admin, logger) {
  if (lineItems && lineItems.length > 0) {
    await logger.warning(`Order ${existingOrder.name}: Line items ya price edit karne ki koshish ki gayi. Shopify API order complete hone ke baad in fields ko update karna allow nahi karti. Inhe skip kar diya gaya hai.`);
  }
  
  if (orderFields["Financial Status"] || orderFields["Fulfillment Status"]) {
    await logger.warning(`Order ${existingOrder.name}: Financial ya Fulfillment status directly update nahi kiya ja sakta. Inhe skip kar diya gaya hai.`);
  }

  const input = {
    id: existingOrder.id,
  };

  if (orderFields["Note"]) input.note = orderFields["Note"];
  if (orderFields["Tags"]) input.tags = orderFields["Tags"].split(",").map(t => t.trim());
  if (orderFields["Email"]) input.email = orderFields["Email"];

  const response = await rateLimiter.withRetry(async () => {
    return await admin.graphql(
      `#graphql
      mutation orderUpdate($input: OrderInput!) {
        orderUpdate(input: $input) {
          order {
            id
            name
          }
          userErrors {
            field
            message
          }
        }
      }`,
      { variables: { input } }
    );
  });

  const userErrors = response.data?.orderUpdate?.userErrors;
  if (userErrors && userErrors.length > 0) {
    throw new Error(`Order update me error aayi: ${userErrors.map(e => e.message).join(", ")}`);
  }

  await logger.info(`Order ${existingOrder.name} ke allowed fields successfully update ho gaye hain.`);
}

async function cancelOrder(orderId, admin, logger) {
  const response = await rateLimiter.withRetry(async () => {
    return await admin.graphql(
      `#graphql
      mutation orderCancel($orderId: ID!) {
        orderCancel(orderId: $orderId) {
          job {
            id
          }
          orderCancelUserErrors {
            field
            message
          }
        }
      }`,
      { variables: { orderId } }
    );
  });

  const errors = response.data?.orderCancel?.orderCancelUserErrors;
  if (errors && errors.length > 0) {
    throw new Error(`Order cancel me error aayi: ${errors.map(e => e.message).join(", ")}`);
  }

  await logger.info(`Order ${orderId} successfully cancel kar diya gaya hai.`);
}
