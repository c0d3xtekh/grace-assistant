import fs from "fs";

// Read the JSON file (replace 'contacts.json' with your filename)
const data = JSON.parse(fs.readFileSync("contacts/bc1.json", "utf8"));

// Count total contacts
const total = data.length;

console.log(`✅ Total contacts: ${total}`);
