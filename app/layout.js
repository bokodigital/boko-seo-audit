import { Poppins } from "next/font/google";
import "./globals.css";

const poppins = Poppins({ subsets: ["latin"], weight: ["400","500","600","700","800","900"], variable: "--font-poppins", display: "swap" });

export const metadata = {
  title: "Boko - Technical SEO Audit",
  description: "Crawl any URL and get a technical SEO report with prioritized improvements.",
};

export default function RootLayout({ children }) {
  return (<html lang="en" className={poppins.variable}><body>{children}</body></html>);
}
