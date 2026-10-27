import { describeIntegration, integrationClient } from "./harness.js";
import { expectFields, expectNonEmpty } from "./validation.js";

describeIntegration("assistance awards (recorded)", () => {
  it("lists grants with the API's default shape", async () => {
    const client = integrationClient("assistance-grants-list");
    const res = await client.listAssistanceGrants({ limit: 2 });
    const first = expectNonEmpty(res);
    expectFields(first, [
      "key",
      "fain",
      "award_date",
      "assistance_type",
      "cfda_number",
      "obligated",
      "pragmatic_obligations",
      "awarding_office",
      "recipient",
    ]);
    expect(first.award_date).toBeInstanceOf(Date);
    expect(typeof first.obligated).toBe("string");
  });

  it("paginates loans with a cursor", async () => {
    const client = integrationClient("assistance-loans-cursor");
    const page1 = await client.listAssistanceLoans({ limit: 2, shape: "key,award_date" });
    expectNonEmpty(page1);
    expect(page1.cursor).toBeTruthy();

    const page2 = await client.listAssistanceLoans({ limit: 2, shape: "key,award_date", cursor: page1.cursor });
    const first2 = expectNonEmpty(page2);
    expect(first2.key).not.toBe(page1.results[0].key);
  });

  it("filters other assistance by place of performance", async () => {
    const client = integrationClient("assistance-other-filter");
    const res = await client.listAssistanceOther({ limit: 2, pop_state: "VA", shape: "key,place_of_performance(state_code)" });
    const first = expectNonEmpty(res);
    expect((first.place_of_performance as Record<string, unknown>).state_code).toBe("VA");
  });

  it("gets a direct payment with its transactions and listings", async () => {
    const client = integrationClient("assistance-direct-payments-detail");
    const list = await client.listAssistanceDirectPayments({ limit: 1, shape: "key" });
    const key = String(expectNonEmpty(list).key);

    const award = await client.getAssistanceDirectPayment(key, { shape: "key,transactions_count,listings_count,listings(*)" });
    expect(award.key).toBe(key);

    const transactions = await client.listAssistanceDirectPaymentTransactions(key);
    expect(transactions.count).toBe(award.transactions_count);
    expectFields(transactions.results[0] as unknown as Record<string, unknown>, ["key", "transaction_date", "action_type", "obligated"]);

    const listings = await client.listAssistanceDirectPaymentListings(key);
    expect(listings.count).toBe(award.listings_count);
    expect(listings.results[0].is_primary).toBe(true);
  });
});
