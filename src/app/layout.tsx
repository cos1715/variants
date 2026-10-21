import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Варіанти",
  description: "Party game, де найкраща брехня може перемогти правду.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="uk"><body>{children}</body></html>;
}
