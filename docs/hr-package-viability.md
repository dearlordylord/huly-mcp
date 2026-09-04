# HR package viability

Issue #253 evaluated `@hcengineering/hr` before adding HR administration.

- Checked package: project-cohort `@hcengineering/hr@0.7.0`
- Registry integrity: `sha512-ExNzKl4L+hQly7DhLy0qw7tlf2Ezl1OnZzgzf5TAeNTLaeON18uj1cA3J7a1uK8GVpAAV5ld8VnzbArTNwVDRQ==`
- Packed size: 5,600 bytes; unpacked size: 22,300 bytes
- Tarball contents: 14 files, including `types/index.d.ts`, its maps, and the
  declared runtime files.

The project-cohort package is viable and is added as a direct dependency at the
same `0.7.0` version as the other Huly model/plugin packages. For comparison,
latest `0.7.423` was also inspected and currently omits its declared `types/`
directory; upgrading the Huly cohort must repeat this check.

Behavior was checked against Huly platform commit
`52442c56840aeb528889fefd5be0f21a6151643a`:

- `plugins/hr/src/index.ts` owns the stable class/mixin identifiers and public
  `Department` / `Staff` shapes.
- `models/hr/src/index.ts` owns the modeled fields.
- `server-plugins/hr-resources/src/index.ts` owns the hierarchy trigger: clients
  write `Staff.department`; the server derives `Department.members` for the
  selected department and its ancestors.

The implemented surface is intentionally limited to departments and staff
assignment. Package viability and behavioral contracts must be rechecked before
upgrading or adding further HR surfaces.
