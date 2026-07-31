import { MarketingHeader } from './header';
import { MarketingFooter } from './footer';

export function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mk-root flex min-h-screen flex-col">
      <MarketingHeader />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}
