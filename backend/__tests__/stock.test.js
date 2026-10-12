// Regression test for CC-07 (and CC-06 as a bonus).
//
// Reserve stock for an order, then release it when the order is
// cancelled. The stock on each dish must return to exactly what it
// started with.
//
// Also exercises CC-06: reserving more than available must fail
// without touching the stock.
//
// Run with:   node backend/__tests__/stock.test.js

const { reserveStock, releaseStock } = require('../logic/validation');

function assertEqual(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    console.error(`FAIL  ${label}\n  expected ${e}\n  got      ${a}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS  ${label}`);
  }
}

// --- fixtures ----------------------------------------------------------
const menu = [
  { id: 1, name: 'Samosa', stock: 10 },
  { id: 2, name: 'Chai',   stock: 20 },
];
const items = [
  { dishId: 1, qty: 3 },
  { dishId: 2, qty: 2 },
];

// --- CC-07: reserve then release returns stock to the start -----------
{
  const r = reserveStock(items, menu);
  assertEqual(r.ok, true, 'reserveStock succeeds for a valid order');
  assertEqual(
    r.menu.map((d) => d.stock),
    [7, 18],
    'reserveStock decrements stock by the ordered qty'
  );

  const released = releaseStock(items, r.menu);
  assertEqual(
    released.map((d) => d.stock),
    [10, 20],
    'releaseStock returns stock to its starting value'
  );
}

// --- CC-06: can't reserve more than available -------------------------
{
  const r = reserveStock([{ dishId: 1, qty: 999 }], menu);
  assertEqual(r.ok, false, 'reserveStock fails when qty > stock');
  assertEqual(
    menu.map((d) => d.stock),
    [10, 20],
    'the source menu is untouched when reserve fails'
  );
}

if (process.exitCode) {
  console.log('\nSome tests failed.');
} else {
  console.log('\nAll tests passed.');
}
