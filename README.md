# Fensak


This is the source code for [Fensak](https://fensak.io), a service that allows users to apply security best practices to
GitOps workflows without any compromises.

This repository has two top level sources:

- `main.ts`: This contains the entry point for the `fensak` service.
- `mod.ts`: This contains the entry point for the `fensak` library, which contains
  useful functions for testing user defined scripts.

For examples of user defined rules including how to test them using functions in this repository, refer to the
[fensak-rules-examples](https://github.com/fensak-io/fensak-rules-examples) repo.


## LICENSE

`SPDX-License-Identifier: BUSL-1.1 OR AGPL-3.0-or-later`

Fensak is dual-licensed under the
[Business Source License 1.1](https://mariadb.com/bsl-faq-adopting/) (with no
Additional Use Grant) and [AGPL 3.0](https://www.gnu.org/licenses/agpl-3.0.en.html) (or any later version). Refer to the
corresponding LICENSE files for the full parameters of either license:

- [LICENSE.BUSL-1.1](/LICENSE.BUSL-1.1)
- [LICENSE.AGPL-3.0-or-later](/LICENSE.AGPL-3.0-or-later)

Dual licensing means that you can use the code under the terms of **either** license.

For example, if you are using this to test your rules functions and you do not want to be bound by the terms of the AGPL
license (and thus be forced to release the source code of your rules), you can license the Fensak testing code under the
BUSL 1.1 license.

On the other hand, if you wish to self host an instance of Fensak for internal use, then you can license Fensak under
the terms of the AGPL 3.0 (or later) license. You can not self host an instance of Fensak under the BUSL 1.1 license
since it does not allow any additional use grant for production usage.

Refer to the [License FAQ](https://docs.fensak.io/docs/license-faq/) for more information.
