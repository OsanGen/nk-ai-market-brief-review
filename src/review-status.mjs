export const DEFAULT_MIN_REVIEW_ITEMS = 5;
export const LIMITED_REVIEW_ITEM_COUNT = 6;

export function reviewStatus(itemCount, minReviewItems = DEFAULT_MIN_REVIEW_ITEMS) {
  const count = Number(itemCount ?? 0);
  const ready = count >= minReviewItems;
  const reasons = [];

  if (count < 3) {
    reasons.push("Fewer than 3 qualifying stories in the current review window.");
  } else if (!ready) {
    reasons.push(`Only ${count} qualifying stories; tune sources before sharing.`);
  }

  return {
    reviewReady: ready,
    reviewLabel: ready ? "Ready for review" : "Needs source tuning",
    limitedNote: count >= 3 && count < LIMITED_REVIEW_ITEM_COUNT ? "Limited qualifying stories in current review window." : "",
    reasons
  };
}
