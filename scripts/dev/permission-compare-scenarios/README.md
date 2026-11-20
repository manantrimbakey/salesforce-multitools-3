# Permission compare scenario checks (org 4rst only)

Real-org checks for the permission compare. They only ever use the owner's test org `4rst` (hard-coded).

1. Metadata the scenarios rely on (custom objects `Cx_Obj1..5__c` with 15 fields each, `Cxs_F1..12__c` on Account and Contact)
   must exist in 4rst; it is not generated here.
2. `python3 gen.py <projectDir>` writes the `Cx_*` permission sets (random ones are seeded, so the same every time) and
   `specs.json`; deploy them with `sf project deploy start -o 4rst`. The group fixtures (`Cx_M1..3`, `Cx_Mute`, `Cx_Grp1..3`)
   are described in `group-check.js`.
3. `pnpm run compile-tests`, then `node fuzz-check.js <projectDir>` and `node group-check.js <projectDir>`
   (`projectDir` must be a git repo holding the seeded XML, committed).

## Profiles and the remaining sections

`fixtures/` holds the hand-written profiles `Cx_Prof_A/B` and permission sets `Cx_G01_*` (tab `None` vs absent) and `Cx_G02_*`
(custom metadata type only); deploy them to 4rst, then `node profile-check.js <projectDir>`. Expected: org A vs B reports the
tab, default app, record type, layout and object / field / class differences that were seeded (plus platform-derived extras
such as `EntitlementContact`), tab `None` vs absent and self-compare report nothing, and profile XML vs org reports no
`removed` / `changed` entries (the org side only adds platform defaults the XML does not list).
