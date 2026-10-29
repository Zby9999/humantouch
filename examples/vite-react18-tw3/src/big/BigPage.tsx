import { Badge } from "acme-ui";
import { Vernier } from "vernierkit/react";
import { avatar, picture } from "./images";
import { ArticleCard, ProductCard, StatTile, Testimonial, UserRow } from "./parts";

/**
 * A large page, as a real store's dashboard would be: nested Flex and Grid
 * layouts, text, buttons and image placeholders, about 5000 elements in all.
 * The performance tests (e2e/perf) measure the editor layer on it, with the
 * desktop, tablet and phone views all showing it. The counts below set its size.
 */
export const PRODUCTS = 96;
export const USERS = 180;
export const ARTICLES = 40;
export const TESTIMONIALS = 16;

const NAV = ["Overview", "Orders", "Products", "Customers", "Reports", "Discounts", "Content", "Settings"];
const SIDEBAR = [
  { group: "Store", items: ["Dashboard", "Orders", "Drafts", "Returns", "Shipping", "Invoices"] },
  { group: "Catalog", items: ["Products", "Collections", "Inventory", "Gift cards", "Price lists", "Imports"] },
  { group: "People", items: ["Customers", "Segments", "Reviews", "Messages", "Support", "Staff"] },
  { group: "Growth", items: ["Campaigns", "Discounts", "Referrals", "Affiliates", "SEO", "Analytics"] },
  { group: "Settings", items: ["General", "Payments", "Checkout", "Taxes", "Domains", "Apps"] },
];
const STATS = ["Revenue", "Orders", "Visitors", "Conversion", "Average order", "Returns", "New customers", "Refunds"];
const FOOTER = [
  { title: "Product", links: ["Features", "Pricing", "Integrations", "Changelog", "Roadmap", "Status", "Security", "API"] },
  { title: "Company", links: ["About", "Careers", "Press", "Partners", "Blog", "Events", "Contact", "Brand"] },
  { title: "Resources", links: ["Docs", "Guides", "Templates", "Community", "Webinars", "Help center", "Forum", "Courses"] },
  { title: "Legal", links: ["Terms", "Privacy", "Cookies", "Licenses", "Imprint", "Accessibility", "DPA", "Sub-processors"] },
  { title: "Social", links: ["Twitter", "GitHub", "LinkedIn", "YouTube", "Dribbble", "Discord", "Mastodon", "RSS"] },
];

export function BigPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-ink">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-gutter px-gutter py-3">
          <a href="#top" className="flex items-center gap-2 font-bold">
            <span className="h-7 w-7 rounded-card bg-brand-500" aria-hidden="true" />
            <span>Northwind</span>
          </a>
          <nav className="hidden flex-1 md:block" aria-label="Main">
            <ul className="flex items-center gap-4">
              {NAV.map((item) => (
                <li key={item}>
                  <a href={`#${item.toLowerCase()}`} className="text-caption text-muted hover:text-ink">
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <input type="search" placeholder="Search" className="hidden w-48 rounded-pill border border-slate-200 px-3 py-1 text-caption sm:block" />
            <button type="button" className="rounded-pill border border-slate-200 px-3 py-1 text-caption">
              Help
            </button>
            <button type="button" className="rounded-pill bg-brand-500 px-3 py-1 text-caption text-white">
              New order
            </button>
            <img src={avatar(0)} alt="" width={32} height={32} className="h-8 w-8 rounded-pill" />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-gutter px-gutter">
        <aside className="hidden w-56 shrink-0 py-section lg:block">
          <nav className="flex flex-col gap-6" aria-label="Sections">
            {SIDEBAR.map(({ group, items }) => (
              <div key={group} className="flex flex-col gap-2">
                <h4 className="text-caption font-semibold uppercase tracking-wide text-muted">{group}</h4>
                <ul className="flex flex-col gap-1">
                  {items.map((item, i) => (
                    <li key={item}>
                      <a href={`#${item.toLowerCase()}`} className="flex items-center gap-2 rounded-card px-2 py-1 text-caption hover:bg-brand-50">
                        <span className="h-3 w-3 rounded-sm bg-brand-100" aria-hidden="true" />
                        <span className="flex-1">{item}</span>
                        <span className="text-muted">{(i * 7 + group.length) % 40}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col gap-section py-section">
          <section className="flex flex-col items-start gap-gutter rounded-card bg-white p-gutter shadow-card md:flex-row md:items-center" data-testid="big-hero">
            <div className="flex flex-1 flex-col gap-3">
              <div className="flex items-center gap-3">
                <h1 className="text-display font-bold">Good morning, Ada</h1>
                <Badge>Pro</Badge>
              </div>
              <p className="text-lead text-muted">Here is how the store did this week, and what needs you today.</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="rounded-pill bg-brand-500 px-gutter py-2 text-caption text-white hover:bg-brand-700">
                  Review orders
                </button>
                <button type="button" className="rounded-pill border border-brand-100 px-gutter py-2 text-caption text-brand-700">
                  Export report
                </button>
              </div>
            </div>
            <img src={picture(0, 320, 180)} alt="" width={320} height={180} className="w-full rounded-card md:w-80" />
          </section>

          <section className="flex flex-col gap-gutter" aria-labelledby="stats-title">
            <h2 id="stats-title" className="text-lead font-semibold">
              This week
            </h2>
            <div className="grid grid-cols-2 gap-gutter md:grid-cols-4">
              {STATS.map((label, i) => (
                <StatTile key={label} label={label} index={i} />
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-gutter" aria-labelledby="products-title" data-testid="big-products">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="products-title" className="text-lead font-semibold">
                Products
              </h2>
              <div className="flex gap-2">
                {["All", "Active", "Drafts"].map((filter) => (
                  <button key={filter} type="button" className="rounded-pill border border-slate-200 px-3 py-1 text-caption">
                    {filter}
                  </button>
                ))}
              </div>
            </header>
            <div className="grid grid-cols-1 gap-gutter sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: PRODUCTS }, (_, i) => (
                <ProductCard key={i} index={i} />
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-gutter" aria-labelledby="customers-title">
            <h2 id="customers-title" className="text-lead font-semibold">
              Customers
            </h2>
            <div className="overflow-hidden rounded-card bg-white shadow-card">
              <table className="w-full text-left text-caption">
                <thead className="bg-slate-100 text-muted">
                  <tr>
                    {["Customer", "Orders", "Spent", "Status", "Since", ""].map((heading) => (
                      <th key={heading} className="px-3 py-2 font-semibold">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: USERS }, (_, i) => (
                    <UserRow key={i} index={i} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="flex flex-col gap-gutter" aria-labelledby="articles-title">
            <h2 id="articles-title" className="text-lead font-semibold">
              From the blog
            </h2>
            <div className="grid grid-cols-1 gap-gutter md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: ARTICLES }, (_, i) => (
                <ArticleCard key={i} index={i} />
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-gutter" aria-labelledby="testimonials-title">
            <h2 id="testimonials-title" className="text-lead font-semibold">
              What customers say
            </h2>
            <div className="flex flex-wrap gap-gutter">
              {Array.from({ length: TESTIMONIALS }, (_, i) => (
                <Testimonial key={i} index={i} />
              ))}
            </div>
          </section>
        </main>
      </div>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-gutter px-gutter py-section md:grid-cols-5">
          {FOOTER.map(({ title, links }) => (
            <div key={title} className="flex flex-col gap-2">
              <h4 className="text-caption font-semibold">{title}</h4>
              <ul className="flex flex-col gap-1">
                {links.map((link) => (
                  <li key={link}>
                    <a href={`#${link.toLowerCase()}`} className="text-caption text-muted hover:text-ink">
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-gutter pb-gutter text-caption text-muted">
          <span>© 2026 Northwind</span>
          <span>Made with care</span>
        </div>
      </footer>
      <Vernier />
    </div>
  );
}
