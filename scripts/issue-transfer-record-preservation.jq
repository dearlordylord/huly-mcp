# Only last-modification metadata can normalize, with a persisted destination-only transaction.
# Created metadata, payload and ownership remain exact even when another author last edited the record.
def preserved_record($old; $new; $transactions):
  ($new._id == $old._id) and
  (
    (($new | del(.space)) == ($old | del(.space))) or
    (
      any($transactions[];
        .objectId == $new._id and .objectClass == $new._class and
        .objectSpace == $old.space and .operations == {space:$new.space} and
        .modifiedOn == $new.modifiedOn and .modifiedBy == $new.modifiedBy
      ) and
      ($new.snapshot | fromjson | .modifiedOn == $new.modifiedOn and .modifiedBy == $new.modifiedBy) and
      (($new | del(.space,.modifiedOn,.modifiedBy,.snapshot)) == ($old | del(.space,.modifiedOn,.modifiedBy,.snapshot))) and
      (($new.snapshot | fromjson | del(.modifiedOn,.modifiedBy)) == ($old.snapshot | fromjson | del(.modifiedOn,.modifiedBy)))
    )
  );
