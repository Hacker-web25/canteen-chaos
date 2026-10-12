# Debug log

All 10 reported bugs are fixed. For each one: what the symptom was, the cause
in the code, the fix, and how it was checked. Time is not tracked per bug; the
whole task took about an hour from clone to push.

How things were checked, so the "Checked" lines are not overstated:
- UI bugs (CC-01 to CC-05, CC-09, CC-10): I ran the original code and the
  fixed code side by side (ports 3001 and 3000) and compared the behaviour.
  I did not test every viewport width, only the ones named in each entry.
- Stock bugs (CC-06, CC-07): covered by `backend/__tests__/stock.test.js`,
  run with `node backend/__tests__/stock.test.js`.
- CC-08 and the coupon extra: confirmed by reading the code paths and the
  data in `backend/data/coupons.json`, not by an automated test.



## CC-01 — "The search suggestions are behind everything"

**Reproduced:** Typing in the search box shows suggestions, but they sit
behind the dish cards, so clicks land on the cards instead of the suggestion.

**Cause:** A stacking context problem, not a plain z-index one.
`.search-wrap` has `position: relative; z-index: 1`, which creates a stacking
context. Every z-index inside it, including `.suggest-box` at 100, only counts
inside that context. `#menu` has `position: relative; z-index: 2`, which is
higher than the search wrap's 1, so the whole menu sits above the whole search
wrap and the suggest box's 100 cannot help.

**Fix:** Raised `.search-wrap` to `z-index: 50` so it beats `#menu`'s 2.

**Checked:** In the fixed build the suggestions appear above the dish cards
and can be clicked. Open question: `.site-header` is also `z-index: 50`, so
when they overlap the one later in the document wins. I did not test this
while scrolling; if it matters, the header should get a higher value.



## CC-02 — "Can't read anything in dark mode"

**Reproduced:** In dark mode the dish names and prices are almost invisible
against the dark card, while the grey meta line is still readable.

**Cause:** `.dish-body` had `color: #2b2118` hardcoded. That is the value of
`--ink` in light mode. In dark mode `--ink` changes to `#f2e8df`, but the
hardcoded colour never changed, so dark text sat on a dark card.

**Fix:** Replaced the hex with `color: var(--ink)` so it follows the theme.

**Checked:** Dish names and prices are readable in both light and dark mode in
the fixed build. Children that set their own colour are unaffected because
they override the inherited one.



## CC-03 — "The menu is wider than my phone"

**Reproduced:** On a narrow screen the right-hand dish image sticks out past
the viewport and the page scrolls sideways.

**Cause:** In the `@media (max-width: 760px)` block the dish image had
`width: auto; min-width: 100%; height: 170px; aspect-ratio: 3 / 2`. With a
fixed height and an aspect-ratio, the browser works out a preferred width of
170 × 1.5 = 255px. `min-width: 100%` only sets a minimum, it does not cap the
width, so the image was wider than its card and pushed the grid out.

**Fix:** Removed `aspect-ratio` and the `width: auto` / `min-width` pair and
used `width: 100%; height: 170px; object-fit: cover`, as in the base rule.

**Checked:** No sideways scroll on a phone-width viewport in the fixed build,
and the images still fill the card without distortion.



## CC-04 — "The buttons don't work on my tablet"

**Reproduced:** At tablet widths (roughly 761px to 900px) Add-to-Cart and the
favourite star do nothing when clicked. At phone and laptop widths they work.

**Cause:** The media query `@media (min-width: 761px) and (max-width: 900px)`
adds two decorative pseudo-elements: a strip across the bottom of `.dish-card`
(z-index 3) and a square at the top-right of `.img-wrap`. Both have a
transparent background, so they are invisible, but a pseudo-element still
catches pointer events unless told otherwise. The strip covered Add-to-Cart
and the square covered the star. Only this width range uses that query, which
is why other widths worked.

**Fix:** Added `pointer-events: none` to both pseudo-elements. They still
render (the `.blocked` tint still works) but clicks pass through.

**Checked:** In the fixed build, Add-to-Cart and the star respond at a tablet
width. Phone and laptop widths are unchanged.



## CC-05 — "The category bar scrolls away on my phone"

**Reproduced:** On a phone-width screen the filter and category bar scrolls
off the top instead of staying stuck. On a laptop it stays stuck.

**Cause:** `.filters` uses `position: sticky; top: 0`. Inside the
`@media (max-width: 480px)` block, `.view { overflow-x: hidden; }` was set on
an ancestor. `position: sticky` stops working when an ancestor has
`overflow: hidden`, `scroll` or `auto`, because the element then sticks
relative to that container rather than the page.

**Fix:** Removed `.view { overflow-x: hidden; }` from the 480px block. It was
only hiding the sideways overflow from CC-03, which is now fixed at its
source.

**Checked:** In the fixed build the bar stays stuck while scrolling at a
phone-width viewport and there is no sideways scroll.



## CC-06 — "I ordered more than they had"

**Reproduced:** An order with a quantity larger than the available stock is
accepted and the stock goes negative.

**Cause:** `reserveStock` in `backend/logic/validation.js` subtracted without
checking: `dish.stock -= item.qty;`. The earlier `validateLine` check only
rejects a dish whose stock is already 0 or less. It does not compare the
ordered quantity with the stock.

**Fix:** Check inside `reserveStock` before subtracting:

```js
if (dish.stock < item.qty) {
  return errors.push(`Only ${dish.stock} ${dish.name} left`);
}
dish.stock -= item.qty;
```

`reserveStock` works on a copy of the menu and only returns it as `ok` when
there are no errors, so a multi-item order is all-or-nothing: if one line
fails, nothing is saved. The route turns the failure into a conflict error.

**Checked:** `backend/__tests__/stock.test.js` asserts that reserving more
than the stock fails and leaves the source menu untouched, and that a valid
reservation decrements correctly. The test passes on the fixed code and fails
without the fix.



## CC-07 — "Cancelling makes it worse"

**Reproduced:** Cancelling an order lowers the stock again instead of putting
it back.

**Cause:** Sign error in `releaseStock`:

```js
return { ...dish, stock: dish.stock - line.qty };   // subtracts, should add
```

Reserving takes stock down, so releasing must put it back.

**Fix:** `dish.stock + line.qty`. The status route
(`PATCH /api/orders/:token/status` with `status: cancelled`) calls the same
function, so it is fixed too.

**Checked:** The regression test reserves 3 of 10 (stock 7), releases, and
asserts the stock is back to 10. It fails with the old sign and passes with
the fix.



## CC-08 — "An old coupon still works"

**Reproduced:** `FRESHERS24` is still accepted. In
`backend/data/coupons.json` it has `expiresAt: "2024-09-30T23:59:59.000Z"`,
which is long past.

**Cause:** `applyCoupon` in `backend/logic/pricing.js` checks `usesLeft`,
`minOrder`, `vegOnly` and `slots`, but never reads `expiresAt`.

**Fix:** Added an expiry check right after the `usesLeft` check:

```js
if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < now.getTime()) {
  return { valid: false, discount: 0, reason: `${coupon.code} has expired` };
}
```

It sits before the minimum-order check so an expired coupon reports "expired"
and not "add Rs. X more". It uses the `now` that `applyCoupon` already takes,
so a test can pass a fixed time.

**Checked:** By reading the code path and the coupon data: `FRESHERS24` is the
expired one, the other coupons expire later, and the `coupon.expiresAt &&`
guard keeps coupons without an expiry valid. No automated test for this one.



## CC-09 — "The menu shows more dishes than it should"

**Reproduced:** The menu returns every dish even when a page size is set, so
paging does nothing.

**Cause:** In `backend/logic/search.js`, `paginate` builds the page with
`list.slice(...)` but then returns `items: list`, the whole list, instead of
the sliced page.

**Fix:** Return the sliced `items`. The rest of the result (`hasMore`,
`total`, `pages`) is unchanged.

**Checked:** In the fixed build the menu shows 5 of 37 dishes with the
page-size-5 request, and the load-more button fetches the next page.



## CC-10 — "Sorting by price is backwards"

**Reproduced:** "Price: low to high" lists the most expensive dish first, and
"Price: high to low" lists the cheapest first.

**Cause:** The two comparators in `SORTERS` are under each other's keys:

```js
'price-asc': (a, b) => b.price - a.price,   // this is descending
'price-desc': (a, b) => a.price - b.price,  // this is ascending
```

`a.price - b.price` sorts low to high and `b.price - a.price` sorts high to
low.

**Fix:** Swapped the bodies so each key does what its name says.

**Checked:** In the fixed build "low to high" starts with the cheapest dish
and "high to low" with the most expensive. The other sorts were not touched.



## Extra credit

### Unreported: a used coupon's remaining uses never go down

**How it was found:** While fixing CC-08, I searched for `usesLeft` to see
where coupons are used up. In `backend/routes/orders.routes.js` the order
route did:

```js
{ ...c, usesLeft: c.usesLeft }   // no change
```

so a limited-use coupon could be used forever.

**Fix:** `usesLeft: Math.max(0, c.usesLeft - 1)`. The cancel path already adds
1 back, which is correct and unchanged.

**Checked:** By reading the code. The order route now decrements and the
cancel route restores, so the accounting matches. No automated test for this.

### Unreported, not fixed: staff queue filter by memberId

In the same file, `GET /api/orders` has:

```js
if (req.query.memberId) orders = orders.filter((o) => o.memberId === req.query.userId);
```

It filters on `req.query.userId` while checking `req.query.memberId`. When
`memberId` is sent, `userId` is normally undefined, so this probably returns
nothing. I did not fix it because I am not sure how this endpoint is meant to
be used, and I would want to confirm that before changing behaviour.

### Test: regression test for CC-06 and CC-07

`backend/__tests__/stock.test.js` (plain Node, no framework) runs
`reserveStock` then `releaseStock` and asserts the stock returns to its start,
and that an over-sized reservation is rejected without touching the stock.



## Could not fix

Nothing from the given list. The memberId filter above is flagged, not fixed.
