// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { reng } from "../deps.ts";

const smartReviewCheckKey = "io.fensak.smartreview";
const smartReviewCheckName = "Fensak smart review";

/**
 * Initializes the check for the smart review procedure.
 */
export async function initializeSmartReviewCheck(
  clt: reng.BitBucket,
  wsName: string,
  repo: string,
  headSHA: string,
): Promise<void> {
  const newCheck = {
    key: smartReviewCheckKey,
    state: "INPROGRESS",
    name: smartReviewCheckName,
  };
  await clt.apiCall(
    `/2.0/repositories/${wsName}/${repo}/commit/${headSHA}/statuses/build`,
    "POST",
    newCheck,
  );
}

/**
 * Marks the smart review check as completed with the given status.
 */
export async function completeSmartReviewCheck(
  clt: reng.BitBucket,
  wsName: string,
  repo: string,
  headSHA: string,
  conclusion: "SUCCESSFUL" | "FAILED",
  summary: string,
): Promise<void> {
  const updateCheck = {
    key: smartReviewCheckKey,
    state: conclusion,
    name: smartReviewCheckName,
    description: summary,
  };
  await clt.apiCall(
    `/2.0/repositories/${wsName}/${repo}/commit/${headSHA}/statuses/build/${smartReviewCheckKey}`,
    "PUT",
    updateCheck,
  );
}
