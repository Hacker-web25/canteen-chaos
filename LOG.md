# Debug log

All 10 bugs reproduced and fixed. Notes below.



## CC-01 — "The search suggestions are behind everything"

**Reproduced:** Opened the menu, typed "pan" in the search box, suggestions
appeared but only the first row was clickable. The rest sat visually in
front of the dish cards but clicks landed on the cards behind. Easier to
see with the devtools picker: hovering over the second suggestion
highlighted the dish card beneath it.

**Cause:** A stacking context problem, not a straightforward z-index one.
`.search-wrap` had `position: relative; z-index: 1`, which creates a
stacking context — every z-index inside it (including `.suggest-box`'s
z: 100) is now scoped to that context. `#menu` had `position: relative;
z-index: 2`, higher than the search wrap's 1. So the whole menu stacking
context sat above the whole search wrap, and the suggest box's z-index 100
was powerless against it.

**Fix:** Raised `.search-wrap` to `z-index: 50` so it beats `#menu`'s 2 and
sits just below `.site-header` (50) in the ordering. Kept the suggest-box
z-index as-is since it only needs to beat siblings inside the wrap now.

**Checked:** Suggestions sit above dish cards. Clicking any row of
suggestions picks that dish. Site header still sits above suggestions on
scroll (its z-index is also 50 but it appears later in document order; if
we wanted a strict rule, header would be 60).

**Time:** ~25 min, most of it going down the stacking-context rabbit hole.



## CC-02 — "Can't read anything in dark mode"

**Reproduced:** Clicked "Dark" in the header. Dish names and prices turned
nearly invisible against the dark card. The meta line (grey) and veg dot
were still readable, confirming it was specifically the elements inside
`.dish-body`.

**Cause:** `.dish-body` had `color: #2b2118` hardcoded. That is the exact
value of `--ink` in light mode — someone had expanded the variable by
hand. In dark mode `--ink` becomes `#f2e8df`, but the hardcoded color never
changed with it, so the children (dish name, price) rendered dark on dark.

**Fix:** Replaced the hex with `color: var(--ink)` so it reacts to the
theme like every other coloured surface. One line.

**Checked:** Toggled light/dark a dozen times. Names and prices are now
readable in both. Nothing else moved, because this was only ever the
default colour; children that specify their own colour (price-row, prep,
muted) still use theirs.

**Time:** ~10 min.



## CC-03 — "The menu is wider than my phone"

**Reproduced:** Narrowed devtools to 375px wide. The grid went to 2
columns as expected but the right column's image spilled past the viewport
and the Add-to-Cart button was clipped off the right edge. The page had a
horizontal scrollbar.

**Cause:** In the `@media (max-width: 760px)` block, the dish-card image
was set to `width: auto; min-width: 100%; height: 170px; aspect-ratio: 3 / 2`.
With an explicit height AND an aspect-ratio, the browser computes a
preferred width of 170 × 1.5 = 255px, and `min-width: 100%` just says "at
least as wide as the parent" — it doesn't cap. On a phone where each
card is ~175px, the 255px-wide image pushed its card over, and because
images don't shrink past their intrinsic/computed width without being told
to, the whole grid became wider than the screen.

**Fix:** Dropped `aspect-ratio` and the `min-width/width: auto` dance.
Replaced with the plain `width: 100%; height: 170px; object-fit: cover`
that the base rule uses — predictable behaviour, no overflow.

**Checked:** No horizontal scrollbar at 320px, 360px, 375px, 414px.
Images still fill the card and don't distort. Load-more and
category-tab rows still fit.

**Time:** ~20 min, including about 10 confused minutes blaming the grid
template before I noticed the image's computed width in devtools.



## CC-04 — "The buttons don't work on my tablet"

**Reproduced:** Set devtools to iPad Mini (768×1024). Add-to-Cart and the
star did nothing on click. Firing devtools' pointer-event picker on the
button highlighted a transparent `::after` sitting on top of it. On
mobile (<480) and laptop (>900) the overlay vanished and clicks worked
again.

**Cause:** The media query `@media (min-width: 761px) and (max-width: 900px)`
added two decorative pseudo-elements — a 58px strip across the bottom of
`.dish-card` (z-index: 3) and a 52×52 square at the top-right of
`.img-wrap`. Both had `background: transparent`, so you couldn't see
them, but by default a pseudo-element with no `pointer-events` still
intercepts pointer events. The bottom strip covered the Add-to-Cart;
the top-right square covered the fav star. The tablet range was the
only one that hit this media query.

**Fix:** Added `pointer-events: none` to both pseudo-elements. They
remain for their visual purpose (the `.blocked` tint still works) but no
longer swallow clicks.

**Checked:** On tablet widths Add-to-Cart and the fav star respond. On
blocked dishes the overlay still tints the card. Laptop and phone widths
untouched.

**Time:** ~30 min. The decoy here was that it worked on laptop AND phone
but not tablet — the media-query range was the clue.



## CC-05 — "The category bar scrolls away on my phone"

**Reproduced:** At 375px wide, scrolled down the menu. The filter+category
bar at the top disappeared instead of sticking under the header. At laptop
width the same bar stayed stuck as expected.

**Cause:** `.filters` has `position: sticky; top: 0`, which should work.
But inside the 480px media query, `.view { overflow-x: hidden }` was set
on the ancestor container. `position: sticky` dies silently when any
ancestor has `overflow: hidden/scroll/auto` — the sticky element now
sticks relative to that overflow container, which is only as tall as the
viewport, so it never has anywhere to stick within. Classic sticky gotcha.

**Fix:** Removed `.view { overflow-x: hidden }` from the 480px block. The
horizontal-overflow problem that rule was trying to mask is actually CC-03
(the oversized dish image), and that is fixed properly now, so this
workaround isn't needed either.

**Checked:** On 320px, 375px, 414px the filter bar sticks under the
header while scrolling the menu. No horizontal scroll returned (verified
with the CC-03 fix in place). Category tabs scroll horizontally within
the sticky bar as intended.

**Time:** ~25 min. Satisfying find — it also made CC-03 and CC-05 fit
into one story instead of two.



## CC-06 — "I ordered more than they had"

**Reproduced:** Edited `backend/data/menu.json` so a dish's stock was 2.
Placed an order with qty 5 for it. Got a 201 Created back. Checked the
menu after — stock was now -3.

**Cause:** `reserveStock` in `backend/logic/validation.js` subtracted
blindly:

```js
dish.stock -= item.qty;
```

The function's whole purpose is to be the atomic "take or fail" step, so
the earlier `validateLine` check (`dish.stock <= 0`) wasn't enough —
`validateLine` only rejects when stock is already ≤ 0, not when qty > stock.

**Fix:** Added the capacity check inside `reserveStock` so the function
owns the invariant:

```js
if (dish.stock < item.qty) {
  return errors.push(`Only ${dish.stock} ${dish.name} left`);
}
dish.stock -= item.qty;
```

This is the right place because `reserveStock` already runs on a cloned
`next` menu that gets written back only if `ok` is true — fixing it here
means the all-or-nothing property holds for multi-item carts too (if the
3rd line fails, the 1st and 2nd aren't persisted).

**Checked:** Order with qty > stock now returns 409 with a message like
"Only 2 Samosas left". Stock never goes negative. Order with qty ≤ stock
still goes through and decrements correctly.

**Time:** ~15 min.



## CC-07 — "Cancelling makes it worse"

**Reproduced:** Placed an order for 3 samosas (stock went 10 → 7). Hit
cancel. Stock went to 4 instead of back to 10. Three cancellations in a
row and the stock bottomed out at zero while the kitchen had plenty.

**Cause:** Sign flip in `releaseStock`:

```js
return { ...dish, stock: dish.stock - line.qty };   // subtracts, should add
```

The reserve path takes stock down; release is the mirror and should put
it back.

**Fix:** `dish.stock + line.qty`. Single-character change but worth a
careful explanation at the review — it's the kind of bug that only shows
up when you follow a thing through its full lifecycle rather than testing
each endpoint on its own.

**Checked:** Placed and cancelled orders repeatedly, stock returns to the
original number every time. Also confirmed the status-route cancel path
(`PATCH /api/orders/:token/status` with `status: cancelled`) now does the
right thing — same function.

**Time:** ~10 min.



## CC-08 — "An old coupon still works"

**Reproduced:** Added items worth over Rs. 100 to the cart, typed
`FRESHERS24` into the coupon field. The server returned a valid discount.
Checked `backend/data/coupons.json` — the entry has
`expiresAt: "2024-09-30T23:59:59.000Z"`, over a year old.

**Cause:** `applyCoupon` in `backend/logic/pricing.js` checked `usesLeft`,
`minOrder`, `vegOnly` and `slots`, but never `expiresAt`. The field is
present on every coupon in the data file, just unread.

**Fix:** Added an expiry check right after the `usesLeft` check, before
any further validation:

```js
if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < now.getTime()) {
  return { valid: false, discount: 0, reason: `${coupon.code} has expired` };
}
```

Placed before the subtotal check so an expired coupon doesn't say "add
Rs. X more" — it says it has expired. Uses `now` (which `applyCoupon`
already accepts in its options), so tests can pass a frozen time.

**Checked:** `FRESHERS24` now returns `{ valid: false, reason:
"FRESHERS24 has expired" }`. The other four coupons (expiry in 2027) still
apply correctly. Removing `expiresAt` from the coupon file leaves the
coupon valid (the `coupon.expiresAt &&` guard handles that).

**Time:** ~15 min.



## CC-09 — "The menu shows more dishes than it should"

**Reproduced:** Loaded `/api/menu?limit=12`. Response had 12 in `limit`
and `pages` but `items` was the full menu, so the frontend's infinite
scroll never actually paginated — it just dumped all dishes at once.

**Cause:** In `backend/logic/search.js`, the `paginate` function slices
the list into `items` on line 98 but then returns `items: list` instead
of the local `items`:

```js
const items = list.slice(start, start + perPage);
return { items: list, ... };   // bug — hands back the whole list
```

**Fix:** `items,` (shorthand for `items: items`). Keeps everything else
about the paginate contract — `hasMore`, `total`, `pages` — identical.

**Checked:** `GET /api/menu?limit=6&page=1` returns 6 items with
`hasMore: true`. `page=2` returns the next 6. The frontend's load-more
button now shows up and loads the next page as it should.

**Time:** ~15 min including re-reading the response fields to make sure
I understood the contract before changing anything.



## CC-10 — "Sorting by price is backwards"

**Reproduced:** Picked "Price: low to high" in the sort dropdown. Got
dishes from most expensive to least. Switched to "Price: high to low" —
got the opposite (ascending). Confirmed the HTML option values are
`price-asc` and `price-desc` as expected.

**Cause:** The two comparator bodies in `SORTERS` are swapped:

```js
'price-asc': (a, b) => b.price - a.price,   // this is DESCENDING
'price-desc': (a, b) => a.price - b.price,  // this is ASCENDING
```

A `sort((a,b) => a - b)` is low → high, `b - a` is high → low. Someone
pasted them under the wrong keys.

**Fix:** Swapped the function bodies to match the key names.

**Checked:** "Low to high" starts with the cheapest dish; "High to low"
starts with the most expensive. Other sort options (rating, name, prep,
popular, default) were already correct and are untouched.

**Time:** ~5 min.



## Extra credit

### Unreported — "A used coupon's remaining uses never go down"

**How I noticed it:** While working on CC-08, I grepped for `usesLeft` to
see where coupons are decremented on use. Found this in
`backend/routes/orders.routes.js`:

```js
if (bill.couponCode) {
  store.update('coupons', (list) =>
    list.map((c) => (c.code === bill.couponCode
                     ? { ...c, usesLeft: c.usesLeft }  // ← no change
                     : c))
  );
}
```

It copies `usesLeft` to itself, so every order could use the same
limited-use coupon forever.

**Reproduced:** Set `BYTE10`'s `usesLeft` to 2. Placed four orders using
it. All four got the discount. `usesLeft` remained 2.

**Fix:** `usesLeft: Math.max(0, c.usesLeft - 1)`. Also noticed the
mirror on cancel does `c.usesLeft + 1`, which is correct and should stay.

**Checked:** `BYTE10` at `usesLeft: 2`, placed two orders — both got the
discount. Third order got "This coupon is fully used". Cancelled one of
the first two — `usesLeft` went back to 1. Fourth order succeeds. The
accounting lines up.

### Unreported — "Staff queue filter by memberId is bugged"

**How I noticed it:** Reading `orders.routes.js` while writing up the
coupon fix, I spotted:

```js
if (req.query.memberId) orders = orders.filter((o) => o.memberId === req.query.userId);
```

Reads `req.query.userId` instead of `req.query.memberId`. The filter
either matches nothing (userId is undefined) or returns everything (if a
different userId query is also set). Flagging but **not fixing** —
unsure whether this endpoint is used from the frontend yet; want to
confirm before changing behaviour.

### Test — regression test for CC-07

Added `backend/__tests__/stock.test.js` (plain Node, no framework). It
drives `reserveStock` then `releaseStock` and asserts stock returns to its
original value. It fails on the old code (ends at 4 instead of 10) and
passes with the fix.



## Could not fix

Nothing in the given list — all 10 are fixed. Flagged the staff-queue
filter under extra credit above as an issue I didn't want to touch
without confirming its intent first.
