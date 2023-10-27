// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { http } from "../deps.ts";

export type BitBucketAPIOptions = {
  baseUrl?: string;
};

export class BitBucket {
  #token?: string;
  #baseURL: string;

  constructor(token?: string, options: BitBucketAPIOptions = {}) {
    this.#token = token;
    this.#baseURL = options.baseUrl || "https://api.bitbucket.org";
  }

  /**
   * Sets an override url endpoint for BitBucket API calls.
   * @param apiURL url endpoint for the BitBucket API used for api calls. It should include the protocol, the domain and the path.
   * @example: "https://api.bitbucket.org"
   * @returns BitBucket
   */
  setBitBucketApiUrl(apiURL: string) {
    this.#baseURL = apiURL;

    return this;
  }

  async directAPICall(url: string): Promise<Response> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.#token) {
      headers.Authorization = `JWT ${this.#token}`;
    }

    const response = await fetch(url, {
      method: "GET",
      headers: headers,
    });
    if (!response.ok) {
      const text = await response.text();
      throw http.createHttpError(
        response.status,
        `${response.status}: ${text}`,
        { headers: response.headers },
      );
    }
    return response;
  }

  async apiCall(
    path: string,
    method: "GET" | "POST" | "DELETE" = "GET",
    // deno-lint-ignore no-explicit-any
    data: any = {},
  ): Promise<Response> {
    // ensure there's a slash prior to path
    const url = `${this.#baseURL.replace(/\/$/, "")}/${path}`;
    // deno-lint-ignore no-explicit-any
    let body: any = undefined;
    if (method === "POST") {
      body = JSON.stringify(data);
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.#token) {
      headers.Authorization = `JWT ${this.#token}`;
    }

    const response = await fetch(url, {
      method: method,
      headers: headers,
      body,
    });
    if (!response.ok) {
      const text = await response.text();
      throw http.createHttpError(
        response.status,
        `${response.status}: ${text}`,
        { headers: response.headers },
      );
    }
    return response;
  }
}
