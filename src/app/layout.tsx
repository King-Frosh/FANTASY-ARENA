import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Fantasy Arena", description: "Build your EPL and LaLiga fantasy teams." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
