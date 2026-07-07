const { PrismaClient } = require("@prisma/client");

async function main() {
  const prisma = new PrismaClient();
  const session = await prisma.session.findFirst({
    where: { shop: "app-development-sumit.myshopify.com", isOnline: false }
  });

  if (!session) {
    console.error("No offline session found!");
    process.exit(1);
  }

  console.log("Access Token found. Querying order...");

  const response = await fetch("https://app-development-sumit.myshopify.com/admin/api/2025-10/graphql.json", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": session.accessToken
    },
    body: JSON.stringify({
      query: `{
        order(id: "gid://shopify/Order/6857527853277") {
          id
          name
          totalPriceSet { presentmentMoney { amount } }
          subtotalPriceSet { presentmentMoney { amount } }
          totalTaxSet { presentmentMoney { amount } }
          totalDiscountsSet { presentmentMoney { amount } }
          shippingLines(first: 5) {
            edges {
              node {
                title
                originalPriceSet { presentmentMoney { amount } }
              }
            }
          }
          lineItems(first: 5) {
            edges {
              node {
                title
                sku
                quantity
                originalUnitPriceSet { presentmentMoney { amount } }
              }
            }
          }
        }
      }`
    })
  });

  const data = await response.json();
  console.log(JSON.stringify(data, null, 2));
  process.exit(0);
}

main().catch(console.error);
