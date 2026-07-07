import * as xlsx from "xlsx";

const dummyData = [
  // 1. NEW command with multiple line items
  { "ID": "TEST-NEW-01", "Name": "TEST-NEW-01", "Email": "new@example.com", "Command": "NEW", "Line: SKU": "SKU-A", "Line: Quantity": 1, "Line: Title": "Test Item A", "Line: Price": "10.00" },
  { "ID": "TEST-NEW-01", "Name": "TEST-NEW-01", "Email": "new@example.com", "Command": "NEW", "Line: SKU": "SKU-B", "Line: Quantity": 2, "Line: Title": "Test Item B", "Line: Price": "15.00" },
  
  // 2. UPDATE command testing tags update (Assuming an order named '#1001' exists, user should change this ID/Name to a real existing dummy order)
  { "ID": "#1001", "Name": "#1001", "Tags": "vip, imported", "Command": "UPDATE" },

  // 3. UPDATE command attempting to change price (Should log warning and skip line items, but update Note)
  { "ID": "#1002", "Name": "#1002", "Note": "Updated note", "Command": "UPDATE", "Line: Price": "99.99" },
];

const ws = xlsx.utils.json_to_sheet(dummyData);
const wb = xlsx.utils.book_new();
xlsx.utils.book_append_sheet(wb, ws, "Orders");
xlsx.writeFile(wb, "prompt4-test.xlsx");

console.log("File created: prompt4-test.xlsx. Please update rows #1001 and #1002 with actual IDs from your dev store before importing.");
