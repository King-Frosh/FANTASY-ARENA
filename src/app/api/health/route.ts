import { NextResponse } from "next/server";
export async function GET() { return NextResponse.json({ app: "Fantasy Arena", status: "ok", databaseConfigured: Boolean(process.env.DATABASE_URL), footballApiConfigured: Boolean(process.env.API_FOOTBALL_KEY), timestamp: new Date().toISOString() }); }
