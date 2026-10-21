export function Footer() {
  return (
    <footer className="bg-parchment border-t border-hairline mt-auto">
      <div className="max-w-[1440px] mx-auto pad-safe-x pt-12 pad-safe-bottom">
        <p className="type-fine-print text-ink-muted-80 max-w-[70ch] text-pretty">
          MDD (maximum drawdown) is the largest decline from a prior peak during the analysis period.
          These results are reference statistics only and can&apos;t be used as the basis for an
          investment decision or a product description.
        </p>
        <p className="type-micro-legal text-ink-muted-48 mt-6">
          Price data via Yahoo Finance, may be delayed. Not investment advice.
        </p>
      </div>
    </footer>
  );
}
