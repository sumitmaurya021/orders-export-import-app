/**
 * Shopify Rate Limiter
 * Helper to manage Shopify GraphQL API rate limits (cost/throttling)
 */

export class ShopifyRateLimiter {
  constructor() {
    this.remainingCost = 1000;
    this.restoreRate = 50;
    this.currentlyAvailable = 1000;
  }

  /**
   * Updates internal state based on the GraphQL response extensions.cost
   * @param {Object} cost - The extensions.cost object from Shopify response
   */
  updateFromResponse(cost) {
    if (!cost || !cost.throttleStatus) return;
    this.currentlyAvailable = cost.throttleStatus.currentlyAvailable;
    this.restoreRate = cost.throttleStatus.restoreRate;
  }

  /**
   * Waits if the required cost exceeds currently available capacity
   * Uses exponential backoff mechanism natively or simple wait
   * @param {number} requiredCost - The estimated cost of the next query
   */
  async waitForCapacity(requiredCost = 50) {
    while (this.currentlyAvailable < requiredCost) {
      // Calculate how long to wait based on restore rate
      const deficit = requiredCost - this.currentlyAvailable;
      const waitTimeMs = Math.ceil((deficit / this.restoreRate) * 1000) + 100; // Add 100ms buffer
      
      console.log(`Rate limiter: Waiting ${waitTimeMs}ms for capacity. Available: ${this.currentlyAvailable}, Required: ${requiredCost}`);
      await new Promise(resolve => setTimeout(resolve, waitTimeMs));
      
      // Optimistically update availability (it will be corrected on next response)
      this.currentlyAvailable += deficit;
    }
  }

  /**
   * Wraps a Shopify GraphQL call with automatic retry on 429 / Throttled errors
   * @param {Function} graphqlCall - A function that returns a Promise of the GraphQL call
   * @param {number} maxRetries - Maximum number of retries
   */
  async withRetry(graphqlCall, maxRetries = 5) {
    let retries = 0;
    let backoff = 1000;

    while (retries < maxRetries) {
      try {
        const response = await graphqlCall();
        const responseJson = typeof response.json === 'function' ? await response.json() : response;

        if (responseJson.extensions?.cost) {
          this.updateFromResponse(responseJson.extensions.cost);
        }

        // Check if there are user errors indicating throttling (sometimes returned inside data or errors array)
        if (responseJson.errors && responseJson.errors.some(e => e.extensions?.code === 'THROTTLED')) {
          throw new Error('THROTTLED');
        }

        return responseJson;

      } catch (error) {
        if (error.message === 'THROTTLED' || error.status === 429) {
          console.warn(`[Rate Limiter] Throttled by Shopify. Retrying in ${backoff}ms (Attempt ${retries + 1}/${maxRetries})...`);
          await new Promise(resolve => setTimeout(resolve, backoff));
          retries++;
          backoff *= 2; // Exponential backoff
        } else {
          throw error; // Re-throw non-throttling errors
        }
      }
    }
    
    throw new Error(`Shopify API Throttled: Max retries (${maxRetries}) exceeded.`);
  }
}

// Singleton instance for global use
export const rateLimiter = new ShopifyRateLimiter();
