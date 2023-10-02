<p align="center">
  <a href="https://fensak.io">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://github.com/fensak-io/assets/raw/main/imgs/logo_color_bgcolor_v_print_long.png?raw=true">
      <img
        alt="Fensak"
        src="https://github.com/fensak-io/assets/raw/main/imgs/logo_color_bgtransparent_v_print_long.png?raw=true"
      >
    <picture>
  </a>
</p>

<p align="center">
  <em>Secure your GitOps Workflows without any compromise</em>
</p>

---

<p align="center">
  <a href="https://fensak.io">
    <img alt="Home" src="https://img.shields.io/badge/Home-fensak.io-53bdbf?style=for-the-badge">
  </a>
  <a href="https://github.com/apps/fensak-app">
    <img alt="GitHub App" src="https://img.shields.io/badge/GitHub_App-Fensak_App-53bdbf?style=for-the-badge">
  </a>
  <a href="https://docs.fensak.io">
    <img alt="Documentation" src="https://img.shields.io/badge/docs-docs.fensak.io-blue?style=for-the-badge">
  </a>
  <br/>
  <a href="https://github.com/fensak-io/fensak/releases/latest">
    <img alt="latest release" src="https://img.shields.io/github/v/release/fensak-io/fensak?style=for-the-badge">
  </a>
  <a href="https://github.com/fensak-io/fensak/actions/workflows/lint-test.yml?query=branch%3Amain">
    <img alt="main branch CI" src="https://img.shields.io/github/actions/workflow/status/fensak-io/fensak/lint-test.yml?branch=main&logo=github&label=CI&style=for-the-badge">
  </a>
  <a href="https://github.com/fensak-io/fensak/blob/main/LICENSE">
    <img alt="LICENSE" src="https://img.shields.io/badge/LICENSE-AGPL_3.0_OR_BUSL_1.1-orange?style=for-the-badge">
  </a>
</p>

This is the source code for [Fensak](https://fensak.io), a service that allows users to apply security best practices to
GitOps workflows without any compromises.

GitOps best practices require that everything about the application infrastructure is managed as code. Naturally, this means that any form of deployment requires a commit to the source repository. But this can quickly conflict with Continuous Delivery where you want to automate deployments without humans in the loop.

Fensak allows you confidently configure GitOps with protected branches through:

- **Automatic approval**: Selectively auto-approves the changes that pertain to continuous delivery. Only allow through the trivial routine deployments.
- **Required reviews**: Anything that fails auto-approval will require manual review to proceed. You can specify how many manual approvals substantial changes should require.
- **Fully customizable**: Fensak's approval rules engine is extensible using custom JavaScript functions. Maintain full control over what changes should be approved automatically.

Learn more at [fensak.io](https://fensak.io) and [docs.fensak.io](https://docs.fensak.io).


## Getting started with Fensak

The easiest way to get started with Fensak is with [our official GitHub App, backed by our hosted managed
service](https://github.com/apps/fensak-app). Check out our [Getting started
guide](https://docs.fensak.io/docs/getting-started) for a quick overview of installing the app, configuring it, and
getting going with auto-approving your Continuous Delivery Pull Requests.


## Configuring Fensak as a User

If you are using Fensak as a user, refer to our [.fensak repository
reference](https://docs.fensak.io/docs/dotfensak-repo) for instructions on what you need to configure Fensak, including
writing custom rules.

For examples of user defined rules including ideas on specific rules to implement and how to test them, refer to the
[fensak-rules-examples](https://github.com/fensak-io/fensak-rules-examples) repo. Also check out our [Writing rules
scripts guide](https://docs.fensak.io/docs/writing-rules).


## Technology

Fensak is built in [TypeScript](https://www.typescriptlang.org) targeting [the Deno runtime](https://deno.com).

This repository has two top level sources:

- `main.ts`: This contains the entry point for the `fensak` service.
- `mod.ts`: This contains the entry point for the `fensak` library, which contains
  useful functions for testing user defined scripts.


## Reporting Bugs, Getting Help, Providing Feedback, etc

Please [create a GitHub discussion](https://github.com/orgs/fensak-io/discussions/new/choose) if you want to:
- report issues with **the hosted Fensak service**
- get any kind of help, like setting up Fensak, writing custom rules, or using Fensak in general
- provide product feedback and suggestions

Please [create a GitHub issue](https://github.com/fensak-io/fensak/issues/new/choose) to report bugs and issues with
**the source code**, including self-hosting and using the functions for testing.

**Do not open an issue to report security issues**. Instead, please review our [Security
Policy](https://github.com/fensak-io/fensak/security/policy).

If you are a paying customer of our GitHub App, and have questions about your account, or have any kind of billing
releated inquiry, please email [support@fensak.io](mailto:support@fensak.io).


## LICENSE

`SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1`

Fensak is dual-licensed under the [AGPL 3.0](https://www.gnu.org/licenses/agpl-3.0.en.html) (or any later version) and
[Business Source License 1.1](https://mariadb.com/bsl-faq-adopting/) (with no Additional Use Grant). Refer to the
corresponding LICENSE files for the full parameters of either license:

- [LICENSE.AGPL-3.0-or-later](/LICENSE.AGPL-3.0-or-later)
- [LICENSE.BUSL-1.1](/LICENSE.BUSL-1.1)

Dual licensing means that you can use the code under the terms of **either** license.

For example, if you are using this to test your rules functions and you do not want to be bound by the terms of the AGPL
license (and thus be forced to release the source code of your rules), you can license the Fensak testing code under the
BUSL 1.1 license.

On the other hand, if you wish to self host an instance of Fensak for internal use, then you can license Fensak under
the terms of the AGPL 3.0 (or later) license. You can not self host an instance of Fensak under the BUSL 1.1 license
since it does not allow any additional use grant for production usage.

Refer to the [License FAQ](https://docs.fensak.io/docs/license-faq/) for more information.
