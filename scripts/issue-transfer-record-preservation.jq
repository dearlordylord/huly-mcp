# No normalization without a persisted destination-only transaction matching server metadata.
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
      (($new | del(.space,.modifiedOn,.snapshot)) == ($old | del(.space,.modifiedOn,.snapshot))) and
      (($new.snapshot | fromjson | del(.modifiedOn)) == ($old.snapshot | fromjson | del(.modifiedOn)))
    )
  );
