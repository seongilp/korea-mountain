import type { Metadata } from 'next';
import { Geist_Mono, Noto_Sans_KR } from 'next/font/google';

import './globals.css';

const notoSansKr = Noto_Sans_KR({
  variable: '--font-sans',
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  display: 'swap',
});

const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  title: '산행나우 — 100대명산 등산로 지도',
  applicationName: '산행나우',
  description:
    '산림청 100대명산 607개 코스와 국립공원 탐방로 1,890개 구간을 지도에 얹고, 산악기상 실측값을 함께 봅니다.',
  openGraph: {
    siteName: '산행나우',
    title: '산행나우 — 100대명산 등산로 지도',
    description:
      '산림청 100대명산 607개 코스와 국립공원 탐방로 1,890개 구간을 지도에 얹고, 산악기상 실측값을 함께 봅니다.',
    locale: 'ko_KR',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: '산행나우 — 100대명산 등산로 지도',
    description:
      '산림청 100대명산 607개 코스와 국립공원 탐방로 1,890개 구간을 지도에 얹고, 산악기상 실측값을 함께 봅니다.',
  },
  appleWebApp: { title: '산행나우' },
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="ko"
      className={`dark ${notoSansKr.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="bg-background text-foreground min-h-full">{children}</body>
    </html>
  );
}
