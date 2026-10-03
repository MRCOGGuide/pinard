/**
 * What a price looks like to someone outside the UK.
 *
 *   npx tsx scripts/test-currency.mts
 *
 * The figure shown in local money is an indication beside a GBP charge,
 * so the two things it must never do are invent a rate and print a
 * conversion where a price belongs.
 */
import {
  currencyForCountry,
  indicativeAmount,
  knownCurrencies,
  parseRates,
  GBP,
} from "../src/lib/currency";

let failed = 0;
function check(name: string, got: unknown, want: unknown) {
  if (JSON.stringify(got) === JSON.stringify(want)) {
    console.log(`pass  ${name}`);
  } else {
    console.log(`FAIL  ${name}\n      got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    failed += 1;
  }
}

check("a market we know", currencyForCountry("PK")?.code, "PKR");
check("lower case is the same country", currencyForCountry("ng")?.code, "NGN");
check("a country we do not list shows GBP", currencyForCountry("IS"), null);
check("no country at all is not an error", currencyForCountry(null), null);

const rates = parseRates('{"PKR": 355, "NGN": 2050, "USD": 1.27, "inr": "112"}');
check("rates parse, including a string and a lower-case code", rates, {
  PKR: 355,
  NGN: 2050,
  USD: 1.27,
  INR: 112,
});
check("nonsense is an empty table, not a throw", parseRates("not json"), {});
check("a negative rate is dropped", parseRates('{"USD": -2}'), {});

/* £99.99 a year. */
const annual = 9999;
check(
  "a currency with no decimals rounds to a price, not a conversion",
  indicativeAmount(annual, { code: "PKR", symbol: "₨", decimals: 0 }, rates),
  "₨35,500"
);
check(
  "a large figure rounds to the nearest hundred",
  indicativeAmount(annual, { code: "NGN", symbol: "₦", decimals: 0 }, rates),
  "₦205,000"
);
check(
  "a decimal currency keeps its pence",
  indicativeAmount(annual, { code: "USD", symbol: "$", decimals: 2 }, rates),
  "$126.99"
);
check(
  "no rate, no figure: nothing is invented",
  indicativeAmount(annual, { code: "ZAR", symbol: "R", decimals: 2 }, rates),
  null
);
check("a free tier has nothing to convert", indicativeAmount(0, GBP, rates), null);

check(
  "every listed currency is offered to the panel once",
  knownCurrencies().length,
  new Set(knownCurrencies().map((c) => c.code)).size
);

console.log(`\n${failed === 0 ? "all passed" : failed + " failed"}`);
if (failed) process.exit(1);
