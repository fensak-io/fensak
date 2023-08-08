# Fensak GitOps

This is the source code for [Fensak GitOps](https://go.fensak.io), a service
that allows users to apply security best practices to GitOps workflows without
any compromises.

This repository has two top level sources:

- `app.ts`: This contains the entry point for the `fgo` service.
- `mod.ts`: This contains the entry point for the `fgo` library, which contains
  useful functions for testing user defined scripts.

For examples of user defined rules including how to test them using functions in this repository, refer to the
[fgo-rules-examples](https://github.com/fensak-io/fgo-rules-examples) repo.


## LICENSE

This library is distributed under the
[Business Source License 1.1](https://mariadb.com/bsl-faq-adopting/) with no
Additional Use Grant. Refer to the [LICENSE](./LICENSE) file for the full
parameters of the license.

This means that you are free to use this for development, testing, or any other
non-production usage, until the specified change date at which point you can use
it under the terms of the Apache 2.0 License.
