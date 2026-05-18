#!/usr/bin/env bash
# Helpers for BLOCK-09 publishing. Source after block-07-helpers.sh.
# Fixtures captured at first run; ids hardcoded for stable reference.

# Primary publish test store (clean, owned by admin)
STORE_PUB="021acd90-f270-4e64-b23c-5edb330adb2d"
CAT_PUB="62404a97-f25d-4b48-8b67-f6f184ff2445"

# Operator's assigned store (existing)
STORE_OP="e73ba6bd-abb9-4596-9289-cca474fb2ec1"
CAT_OP="ab84f2e4-644d-41cf-a30f-7b29bb6be807"

# Admin/operator user ids
ADMIN_UID="4df893ce-eceb-4f49-be99-fc09590bee43"
OP_UID="c46be3c5-6fd3-4ab1-88d0-8c8f0a4df204"

# A foreign (non-op) store for G.2 — STORE_P from block-08
STORE_FOREIGN="5d8373ec-da96-443a-8cba-6c09d0e3dc4f"

# Convenience: pretty status, body
admin_status() { echo "$(admin_req "$1" "$2" "$3")" | head -1 | awk '{print $2}'; }
admin_body()   { body_of "$(admin_req "$1" "$2" "$3")"; }
op_status()    { echo "$(op_req "$1" "$2" "$3")"    | head -1 | awk '{print $2}'; }
op_body()      { body_of "$(op_req "$1" "$2" "$3")"; }
