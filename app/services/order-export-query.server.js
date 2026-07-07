/**
 * Builds the Shopify GraphQL query for exporting orders based on selected columns.
 * @param {Array<string>} columns - Selected column names.
 */
export function buildExportQuery(columns) {
  // Base fields we always want to fetch for tracking/pagination
  let orderFields = `
    id
    name
    createdAt
  `;

  // Dynamically add fields based on selected columns to avoid over-fetching
  if (columns.includes("Email")) orderFields += `\n    email`;
  if (columns.includes("Payment status")) orderFields += `\n    displayFinancialStatus`;
  if (columns.includes("Fulfillment status") || columns.includes("Delivery status")) orderFields += `\n    displayFulfillmentStatus`;
  if (columns.includes("Currency")) orderFields += `\n    currencyCode`;
  if (columns.includes("Tags")) orderFields += `\n    tags`;
  if (columns.includes("Note")) orderFields += `\n    note`;
  
  if (columns.includes("Customer") || columns.includes("Customer: Email")) {
    orderFields += `
      customer {
        firstName
        lastName
        email
      }
    `;
  }

  if (columns.includes("Channel")) {
    orderFields += `
      channel {
        name
      }
      sourceName
    `;
  }

  if (columns.includes("Total")) {
    orderFields += `
      totalPriceSet {
        presentmentMoney {
          amount
        }
      }
    `;
  }

  if (columns.includes("Subtotal")) {
    orderFields += `
      subtotalPriceSet {
        presentmentMoney {
          amount
        }
      }
    `;
  }

  if (columns.includes("Taxes")) {
    orderFields += `
      totalTaxSet {
        presentmentMoney {
          amount
        }
      }
    `;
  }

  if (columns.includes("Discounts")) {
    orderFields += `
      totalDiscountsSet {
        presentmentMoney {
          amount
        }
      }
    `;
  }

  if (columns.includes("Discount Code")) {
    orderFields += `\n    discountCodes`;
  }

  const hasBillingAddress = columns.some(c => c.startsWith("Billing "));
  if (hasBillingAddress) {
    orderFields += `
      billingAddress {
        name
        address1
        address2
        city
        province
        zip
        country
        phone
      }
    `;
  }

  const hasShippingAddress = columns.includes("Destination") || columns.some(c => c.startsWith("Shipping "));
  if (hasShippingAddress) {
    orderFields += `
      shippingAddress {
        name
        address1
        address2
        company
        city
        province
        zip
        country
        phone
      }
    `;
  }

  if (columns.includes("Delivery status")) {
    orderFields += `
      fulfillments {
        displayStatus
      }
    `;
  }

  const hasShippingLines = columns.includes("Delivery method") || columns.includes("Shipping Cost");
  if (hasShippingLines) {
    orderFields += `
      shippingLines(first: 5) {
        edges {
          node {
            title
            originalPriceSet {
              presentmentMoney {
                amount
              }
            }
          }
        }
      }
    `;
  }

  if (columns.includes("Cancelled At")) orderFields += `\n    cancelledAt`;
  if (columns.includes("Cancel Reason")) orderFields += `\n    cancelReason`;
  if (columns.includes("Return status")) orderFields += `\n    returnStatus`;
  if (columns.includes("PO number")) orderFields += `\n    poNumber`;

  // Check if we need line items
  const needsLineItems = columns.some(c => c.startsWith("Line:"));

  let lineItemsQuery = "";
  if (needsLineItems) {
    let lineItemFields = `id`;
    if (columns.includes("Line: SKU")) lineItemFields += `\n        sku`;
    if (columns.includes("Line: Title")) lineItemFields += `\n        title`;
    if (columns.includes("Line: Quantity")) lineItemFields += `\n        quantity`;
    if (columns.includes("Line: Price")) lineItemFields += `\n        originalUnitPriceSet { presentmentMoney { amount } }`;
    if (columns.includes("Line: Vendor")) lineItemFields += `\n        vendor`;
    if (columns.includes("Line: Taxable")) lineItemFields += `\n        taxable`;

    lineItemsQuery = `
      lineItems(first: 100) {
        edges {
          node {
            ${lineItemFields}
          }
        }
      }
    `;
  }

  return `#graphql
    query getOrdersForExport($query: String, $cursor: String, $first: Int!) {
      orders(first: $first, after: $cursor, query: $query) {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            ${orderFields}
            ${lineItemsQuery}
          }
        }
      }
    }
  `;
}

/**
 * Builds the Shopify search query string from filters
 */
export function buildSearchQuery(filters) {
  const parts = [];

  if (filters.financialStatus) {
    parts.push(`financial_status:${filters.financialStatus}`);
  }
  
  if (filters.fulfillmentStatus) {
    parts.push(`fulfillment_status:${filters.fulfillmentStatus}`);
  }

  if (filters.tags) {
    parts.push(`tag:${filters.tags}`);
  }

  if (filters.dateMin && filters.dateMax) {
    parts.push(`created_at:>=${filters.dateMin} AND created_at:<=${filters.dateMax}`);
  } else if (filters.dateMin) {
    parts.push(`created_at:>=${filters.dateMin}`);
  } else if (filters.dateMax) {
    parts.push(`created_at:<=${filters.dateMax}`);
  }

  return parts.join(" AND ") || undefined;
}
