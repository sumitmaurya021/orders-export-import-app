import * as xlsx from "xlsx";
import fs from "fs";
import { ORDER_COLUMNS as EXPECTED_COLUMNS, EXPORT_ONLY_COLUMNS } from "../constants/order-columns";

/**
 * Parses the uploaded file and returns analysis of columns and order count.
 */
export async function parseOrderFile(filePath) {
  // Read the file using fs and xlsx.read.
  const fileBuffer = fs.readFileSync(filePath);
  const workbook = xlsx.read(fileBuffer, { type: "buffer" });
  
  // We expect only one "Orders" sheet, or we just pick the first sheet
  const sheetName = workbook.SheetNames.find(n => n.toLowerCase() === "orders") || workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  
  // Convert sheet to JSON array (array of arrays to get headers, then array of objects)
  // header: 1 gives us array of arrays
  const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  
  if (rawData.length === 0) {
    throw new Error("File is empty");
  }

  const headers = rawData[0].map(h => String(h).trim());
  const rows = xlsx.utils.sheet_to_json(sheet, { raw: false, defval: "" });

  const columnsAnalysis = headers.map(header => {
    let status = "Unknown";
    if (EXPECTED_COLUMNS.includes(header)) {
      status = EXPORT_ONLY_COLUMNS.includes(header) ? "Export Only" : "Recognized";
    }
    return { name: header, status };
  });

  // Calculate distinct orders
  // Group by 'ID' or 'Name'. If ID exists and is not empty, use ID. Else use Name.
  const orderIdentifiers = new Set();
  for (const row of rows) {
    const id = row["ID"] ? String(row["ID"]).trim() : null;
    const name = row["Name"] ? String(row["Name"]).trim() : null;
    
    // Fallback logic for identifier
    const identifier = id || name;
    if (identifier) {
      orderIdentifiers.add(identifier);
    }
  }

  return {
    headers: columnsAnalysis,
    totalRows: rows.length,
    distinctOrders: orderIdentifiers.size,
    rows: rows,
  };
}
