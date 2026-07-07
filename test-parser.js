import * as xlsx from "xlsx";
import { parseOrderFile } from "./app/services/order-file-parser.server.js";

const dummyData = [
  { "ID": "1001", "Name": "#1001", "Email": "a@example.com", "Financial Status": "paid", "Command": "NEW", "Line: SKU": "SKU-1", "Line: Quantity": 1, "Random Column": "Oops" },
  { "ID": "1001", "Name": "#1001", "Email": "a@example.com", "Financial Status": "paid", "Command": "NEW", "Line: SKU": "SKU-2", "Line: Quantity": 2, "Random Column": "Oops" },
  { "ID": "1002", "Name": "#1002", "Email": "b@example.com", "Financial Status": "pending", "Command": "NEW", "Line: SKU": "SKU-3", "Line: Quantity": 1, "Random Column": "Oops" },
  { "Name": "#1003", "Email": "c@example.com", "Command": "UPDATE", "Line: SKU": "SKU-4", "Line: Quantity": 5, "Random Column": "Oops" },
];

const ws = xlsx.utils.json_to_sheet(dummyData);
const wb = xlsx.utils.book_new();
xlsx.utils.book_append_sheet(wb, ws, "Orders");
xlsx.writeFile(wb, "test-orders.xlsx");

console.log("File created: test-orders.xlsx");

// Test parser
parseOrderFile("test-orders.xlsx").then(res => {
  console.log("Parser Analysis:", JSON.stringify(res, null, 2));
}).catch(console.error);
