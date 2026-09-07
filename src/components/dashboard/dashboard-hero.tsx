import Image from "next/image";

/*
 * The photographic band at the top of the citizen dashboard.
 *
 * A DIFFERENT photograph from the landing page's hero, on purpose: an
 * earlier version pointed both at the same file, and swapping one for the
 * dashboard would have silently changed the other. This is its own asset
 * (`pakistan-dashboard-banner.webp`), used nowhere else.
 *
 * The container's aspect ratio is set to the photo's OWN — 2172:724 — rather
 * than a fixed height the image then gets cropped to fit. That was the
 * earlier mistake here: a box shaped for a different, taller photograph
 * forced this wide panorama through an aggressive crop it was never
 * composed for. Matching the box to the photo means `object-cover` has
 * almost nothing to crop, at any viewport width, without a per-breakpoint
 * height to keep re-tuning by hand.
 *
 * It carries the citizen's own real greeting — passed in, never invented
 * here — because a banner that says "Good morning" to everyone at every
 * hour would be exactly the kind of decorative-but-false premiumness this
 * project has spent this whole session arguing against.
 */
export function DashboardHero({
  greeting,
  subtitle,
}: {
  /** e.g. "Good morning, Sami" — composed by the caller, from the real session. */
  greeting: string;
  subtitle: string;
}) {
  return (
    <section className="relative aspect-[2172/724] overflow-hidden rounded-[var(--radius-panel)] border border-line">
      <Image
        src="/pakistan-dashboard-banner.webp"
        alt=""
        fill
        priority
        sizes="(min-width: 1024px) 900px, 100vw"
        className="object-cover"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-r from-white/90 via-white/55 to-white/10"
      />

      {/*
        A soft white text-shadow, not just the gradient above.
        The gradient alone was tuned against ONE crop of the photo and broke
        the moment the box got shorter — at a narrow phone width this same
        aspect-ratio box is proportionally shallower, so the text sits closer
        to the flag's dark green field than it did on desktop, and "How can
        we help..." became barely readable against it. A wash tuned for one
        composition is fragile; a text-shadow is not — it guarantees contrast
        against WHATEVER ends up behind these words, at any crop, at any
        width, without needing to be re-tuned every time the photo changes.
      */}
      <div
        className="absolute inset-0 flex flex-col justify-center px-5 sm:px-8 [text-shadow:0_1px_3px_rgba(255,255,255,0.8),0_1px_10px_rgba(255,255,255,0.6)]"
      >
        <span className="text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-civic-700">
          Cleaner cities · Brighter Pakistan
        </span>
        <h1 className="mt-2 max-w-sm text-[1.5rem] font-bold leading-tight tracking-tight text-ink sm:text-[1.875rem]">
          {greeting}
        </h1>
        <p className="mt-1.5 max-w-sm text-[0.9375rem] leading-relaxed text-ink/70">
          {subtitle}
        </p>
      </div>
    </section>
  );
}
