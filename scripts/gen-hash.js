import bcrypt from "bcryptjs";

const password = process.argv[2];

if (!password) {
  console.error("❌ Error: Harap masukkan password yang ingin di-hash.");
  console.log("Penggunaan: npm run gen:hash -- \"passwordAnda\"");
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 10);
console.log("\n========================================================");
console.log("🌸 LilyBot Password Hash Generator");
console.log("========================================================");
console.log("Password :", password);
console.log("Hash     :", hash);
console.log("--------------------------------------------------------");
console.log("Tambahkan baris berikut ke file .env Anda:");
console.log(`DASHBOARD_PASS_HASH=${hash}`);
console.log("========================================================\n");
