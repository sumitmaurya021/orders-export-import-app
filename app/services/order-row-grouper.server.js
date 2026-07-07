/**
 * Groups raw rows from the spreadsheet into structured objects.
 */
export function groupOrderRows(rows) {
  const groups = new Map();

  for (const row of rows) {
    const id = row["ID"] ? String(row["ID"]).trim() : null;
    const name = row["Name"] ? String(row["Name"]).trim() : null;
    const identifier = id || name;

    if (!identifier) {
      // Skip rows with no identifying column
      continue;
    }

    if (!groups.has(identifier)) {
      // First row defines the base order fields
      const orderFields = { ...row };
      
      // Clean up line item fields from the base object to keep it tidy
      delete orderFields["Line: SKU"];
      delete orderFields["Line: Quantity"];
      delete orderFields["Line: Price"];
      delete orderFields["Line: Title"];
      delete orderFields["Line: Command"];
      
      groups.set(identifier, {
        identifier,
        command: String(row["Command"] || "MERGE").trim().toUpperCase(),
        orderFields,
        lineItems: [],
      });
    }

    // Add line item from the current row if it exists
    const group = groups.get(identifier);
    const sku = row["Line: SKU"];
    const title = row["Line: Title"];
    
    // We consider it a valid line item if it at least has a Title or SKU
    if (sku || title) {
      group.lineItems.push({
        sku: sku ? String(sku) : "",
        title: title ? String(title) : "Custom Item",
        quantity: parseInt(row["Line: Quantity"] || "1", 10),
        price: row["Line: Price"] ? String(row["Line: Price"]) : "0.00",
        command: row["Line: Command"] ? String(row["Line: Command"]).trim().toUpperCase() : "",
      });
    }
  }

  return Array.from(groups.values());
}
