export function Footer() {
  return (
    <footer className="bg-parchment border-t border-hairline mt-auto">
      <div className="max-w-[1440px] mx-auto px-6 py-12">
        <p className="type-fine-print text-ink-muted-80 max-w-[70ch] text-pretty">
          Maximum drawdown is the largest peak-to-trough decline in closing price within the
          selected range. Recovery is the first close at or above the prior peak. Historical
          recovery statistics describe this stock&apos;s own past episodes and carry no
          predictive claim.
        </p>
        <p className="type-micro-legal text-ink-muted-48 mt-6">
          Price data via Yahoo Finance, may be delayed. Not investment advice.
        </p>
      </div>
    </footer>
  );
}
