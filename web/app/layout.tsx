import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'KPV KPI Tracker',
  description: 'Sales performance reporting for KPV branches',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
