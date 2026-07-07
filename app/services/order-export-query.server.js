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
  if (columns.includes("Financial Status")) orderFields += `\n    displayFinancialStatus`;
  if (columns.includes("Fulfillment Status")) orderFields += `\n    displayFulfillmentStatus`;
  if (columns.includes("Currency")) orderFields += `\n    currencyCode`;
  if (columns.includes("Tags")) orderFields += `\n    tags`;
  if (columns.includes("Note")) orderFields += `\n    note`;

  // Check if we need line items
  const needsLineItems = columns.some(c => c.startsWith("Line Item:") || c.startsWith("SKU") || c.startsWith("Title") || c.startsWith("Quantity") || c.startsWith("Price"));

  let lineItemsQuery = "";
  if (needsLineItems) {
    let lineItemFields = `id`;
    if (columns.includes("Line Item: SKU")) lineItemFields += `\n        sku`;
    if (columns.includes("Line Item: Title")) lineItemFields += `\n        title`;
    if (columns.includes("Line Item: Quantity")) lineItemFields += `\n        quantity`;
    if (columns.includes("Line Item: Price")) lineItemFields += `\n        originalUnitPriceSet { presentmentMoney { amount } }`;

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
