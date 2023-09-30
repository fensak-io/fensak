#!/bin/bash
#
# Copyright (c) Fensak, LLC.
# SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

function add_copyright {
  local -r pattern="$1"

  for i in $(find . -name "$pattern")
  do
    if ! grep -q Copyright $i
    then
      cat copyright.txt $i >$i.new && mv $i.new $i
    fi
  done

  deno fmt .
}

add_copyright '*.ts'
add_copyright '*.json5'
