include "issue-transfer-record-preservation";

# Immutable state proof remains independent of unavailable last-modification evidence.
def record_payload_preserved($old; $new):
  ($new._id==$old._id) and
  ($new.snapshot|fromjson|.modifiedOn==$new.modifiedOn and .modifiedBy==$new.modifiedBy) and
  (($new|del(.space,.modifiedOn,.modifiedBy,.snapshot))==($old|del(.space,.modifiedOn,.modifiedBy,.snapshot))) and
  (($new.snapshot|fromjson|del(.modifiedOn,.modifiedBy))==($old.snapshot|fromjson|del(.modifiedOn,.modifiedBy)));

def record_preservation($old; $new; $transactions; $anchor; $destination):
  if (record_payload_preserved($old; $new)|not) or $new.space!=$destination then {status:"invalid"}
  elif $new.space==$old.space then
    if $new.snapshot==$old.snapshot and $new.modifiedOn==$old.modifiedOn and $new.modifiedBy==$old.modifiedBy then {status:"unchanged"} else {status:"invalid"} end
  elif preserved_record($old; $new; $transactions; $anchor) then {status:"authenticated"}
  elif any($transactions[]; .objectId==$new._id) or $anchor!=null then {status:"invalid"}
  else {status:"metadata-unavailable",immutablePayload:"preserved"} end;

. as $after |
[ $before.issues[] | . as $old |
  ($after.issues[]|select(.issue._id==$old.issue._id)) as $current |
  # A later independent root reparent is checked separately; the original movement targets NoParent.
  ($current|if .issue._id==$root then .issue.attachedTo="tracker:ids:NoParent" else . end) as $movement |
  issue_history_anchor($old; $movement) as $anchor |
  if $current.incomingReferences!=$old.incomingReferences then {status:"invalid",ownerId:$old.issue._id,category:"incoming-reference"}
  else $old.owned.records[] | . as $record |
    [$current.owned.records[]|select(._id==$record._id)] as $matches |
    if ($matches|length)!=1 then {status:"invalid",ownerId:$old.issue._id,recordId:$record._id,category:"missing-or-duplicate"}
    else record_preservation($record; $matches[0]; ($after.migrationTransactions // []); $anchor; $current.issue.space) + {ownerId:$old.issue._id,recordId:$record._id} end
  end
] as $evidence |
{records:$evidence,valid:all($evidence[];.status!="invalid"),lastModificationEvidence:(if any($evidence[];.status=="metadata-unavailable") then "unavailable" else "observed" end)}
