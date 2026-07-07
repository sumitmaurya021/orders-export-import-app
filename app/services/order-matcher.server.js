import { rateLimiter } from "./shopify-rate-limiter.server";

/**
 * Tries to find an existing order by ID or Name in Shopify using GraphQL.
 * @param {string} identifier - The ID or Name from the row.
 * @param {Object} admin - The Shopify admin object from authenticate.admin
 */
export async function findExistingOrder(identifier, admin) {
  // If identifier looks like a global ID (gid://), use it directly
  if (identifier.startsWith("gid://shopify/Order/")) {
    const response = await rateLimiter.withRetry(async () => {
      return await admin.graphql(
        `#graphql
        query getOrderById($id: ID!) {
          order(id: $id) {
            id
            name
            displayFulfillmentStatus
            displayFinancialStatus
          }
        }`,
        { variables: { id: identifier } }
      );
    });

    if (response.data?.order) {
      return response.data.order;
    }
  }

  // If it's just a number, it might be the un-prefixed ID or the name/order number.
  // We will search using the `orders` query by name.
  // Often Names are like "#1001" or just "1001".
  const queryStr = `name:${identifier}`;
  
  const response = await rateLimiter.withRetry(async () => {
    return await admin.graphql(
      `#graphql
      query getOrderByName($query: String!) {
        orders(first: 1, query: $query) {
          edges {
            node {
              id
              name
              displayFulfillmentStatus
              displayFinancialStatus
            }
          }
        }
      }`,
      { variables: { query: queryStr } }
    );
  });

  if (response.data?.orders?.edges?.length > 0) {
    return response.data.orders.edges[0].node;
  }

  return null;
}
