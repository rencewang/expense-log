const FIXTURES = [
  { daysAgo: 0, amountCents: 1842, category: "food", merchant: "Corner Market", note: "Groceries" },
  { daysAgo: 1, amountCents: 475, category: "transport", merchant: "Metro", note: "" },
  { daysAgo: 2, amountCents: 6890, category: "bills", merchant: "City Electric", note: "Monthly bill" },
  { daysAgo: 3, amountCents: 1299, category: "food", merchant: "Noodle House", note: "Dinner" },
  { daysAgo: 4, type: "credit", amountCents: 2350, category: "shopping", merchant: "Bookshop", note: "Return" },
  { daysAgo: 5, amountCents: 3400, category: "shopping", merchant: "Bookshop", note: "Reference book" },
  { daysAgo: 7, amountCents: 825, category: "food", merchant: "Cafe", note: "" },
  { daysAgo: 9, amountCents: 9600, category: "travel", merchant: "Railway", note: "Weekend ticket" },
  { daysAgo: 12, amountCents: 2480, category: "other", merchant: "Pharmacy", note: "" },
  { daysAgo: 16, amountCents: 5234, category: "food", merchant: "Grocery Cooperative", note: "" },
  { daysAgo: 22, amountCents: 1599, category: "bills", merchant: "Mobile Service", note: "" },
  { daysAgo: 31, amountCents: 2200, category: "transport", merchant: "Fuel Station", note: "" },
  { daysAgo: 38, amountCents: 7950, category: "shopping", merchant: "Hardware Store", note: "Desk lamp" },
  { daysAgo: 45, amountCents: 1425, category: "food", merchant: "Bakery", note: "" },
  { daysAgo: 63, amountCents: 11200, category: "travel", merchant: "Hotel Example", note: "One night" },
];

function localDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function createDevelopmentExpenses(now = new Date()) {
  return FIXTURES.map((fixture, index) => {
    const date = new Date(now);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - fixture.daysAgo);

    return {
      id: `development-transaction-${index + 1}`,
      type: fixture.type ?? "expense",
      date: localDate(date),
      amountCents: fixture.amountCents,
      category: fixture.category,
      merchant: fixture.merchant,
      note: fixture.note,
      updatedAt: date.toISOString(),
    };
  });
}
