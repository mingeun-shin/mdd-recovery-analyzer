import { GlobalNav } from "@/components/GlobalNav";
import { Footer } from "@/components/Footer";
import { SearchForm } from "@/components/SearchForm";
import { InstallPrompt } from "@/components/InstallPrompt";

export default function Home() {
  return (
    <>
      <GlobalNav />
      <main className="flex-1 bg-parchment">
        <div className="max-w-[760px] mx-auto px-6 py-24">
          <h1 className="type-hero-display">Every fall, measured.</h1>
          <p className="type-lead text-ink-muted-80 mt-5 text-pretty">
            Enter a ticker. See the deepest decline, how long it lasted, and how often this stock
            has come back — then narrow the range once you see the full history.
          </p>

          <div className="mt-10">
            <SearchForm />
          </div>

          <p className="type-caption text-ink-muted-48 mt-8">
            Analysis runs on daily closing prices, adjusted for splits and dividends.
          </p>

          <InstallPrompt />
        </div>
      </main>
      <Footer />
    </>
  );
}
