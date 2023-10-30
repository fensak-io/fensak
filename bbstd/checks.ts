// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { reng } from "../deps.ts";

const smartReviewCheckKey = "io.fensak.smartreview";
const smartReviewCheckName = "Fensak smart review";
const smartReviewCheckCommentMarker =
  "> <!-- FENSAK_APP_SMARTREVIEW_MARKER -->";

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
    // TODO
    // Make this point to something that can give more details
    url: "https://fensak.io",
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
  prNum: number,
  headSHA: string,
  conclusion: "SUCCESSFUL" | "FAILED",
  summary: string,
  details: string,
): Promise<void> {
  const updateCheck = {
    key: smartReviewCheckKey,
    state: conclusion,
    name: smartReviewCheckName,
    description: summary,
    // TODO
    // Make this point to something that can give more details
    url: "https://fensak.io",
  };
  await clt.apiCall(
    `/2.0/repositories/${wsName}/${repo}/commit/${headSHA}/statuses/build/${smartReviewCheckKey}`,
    "PUT",
    updateCheck,
  );

  // Report the details of the results as a comment on the PR.
  await createOrUpdateComment(clt, wsName, repo, prNum, details);
}

async function createOrUpdateComment(
  clt: reng.BitBucket,
  wsName: string,
  repo: string,
  prNum: number,
  details: string,
): Promise<void> {
  const comment = {
    content: {
      raw: `${details}\n\n${smartReviewCheckCommentMarker}`,
    },
  };

  const resp = await clt.apiCall(
    `/2.0/repositories/${wsName}/${repo}/pullrequests/${prNum}/comments`,
    "GET",
  );
  const data = await resp.json();

  // deno-lint-ignore no-explicit-any
  let commentFound: any = null;
  for (const c of data.values) {
    if (!c.deleted && c.content.raw.endsWith(smartReviewCheckCommentMarker)) {
      commentFound = c;
      break;
    }
  }
  if (!commentFound) {
    await clt.apiCall(
      `/2.0/repositories/${wsName}/${repo}/pullrequests/${prNum}/comments`,
      "POST",
      comment,
    );
    return;
  }
  await clt.apiCall(
    `/2.0/repositories/${wsName}/${repo}/pullrequests/${prNum}/comments/${commentFound.id}`,
    "PUT",
    comment,
  );
}
