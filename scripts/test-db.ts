
import { config } from "dotenv";

config({ path: ".env.local" });

async function testDatabase() {
  try {
    const { Pool } = await import("pg");

    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 1,
    });

    const result = await pool.query("SELECT 1 AS connection_test");

    console.log("==================================");
    console.log("FANTASY ARENA DATABASE TEST");
    console.log("==================================");
    console.log("Database connection successful!");
    console.log("Test result:", result.rows[0].connection_test);

    await pool.end();
  } catch (error) {
    console.error("Database connection failed:");
    console.error(error);
    process.exitCode = 1;
  }
}

testDatabase();
