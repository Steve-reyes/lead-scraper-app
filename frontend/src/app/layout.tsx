import type { Metadata } from 'next';
import './globals.css';
import AuthGuard from '@/components/AuthGuard';

export const metadata: Metadata = {
  title: 'LeadScraper Pro — Find & Enrich Business Leads',
  description: 'Modern lead scraping tool with waterfall enrichment. Find local businesses and their contact information in real-time.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-panel-bg">
        <AuthGuard>{children}</AuthGuard>
      </body>
    </html>
  );
}
