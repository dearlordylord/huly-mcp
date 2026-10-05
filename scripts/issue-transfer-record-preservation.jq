# Independent fixture oracle: match actual movement fields, not private application batch IDs.
def issue_history_anchor($before; $after):
  {attachedTo:"tracker:class:Issue",space:"tracker:class:Project",number:"core:class:TypeNumber",identifier:"core:class:TypeString"} as $classes |
  [$classes|keys[]|select($before.issue[.]!=$after.issue[.])] as $changed |
  [$before.owned.records[]|select(.kind=="history")|._id] as $oldIds |
  [$before.owned.records[]|select(.kind=="history")|.history.txId] as $oldTransactions |
  [$after.owned.records[] |
    select(.kind=="history" and ._class=="activity:class:DocUpdateMessage" and .space==$after.issue.space and .attachedTo==$after.issue._id and .attachedToClass=="tracker:class:Issue" and .collection=="docUpdateMessages") |
    select(.history.action=="update" and .history.objectId==$after.issue._id and .history.objectClass=="tracker:class:Issue" and (.history|has("updateCollection")|not)) |
    select((.history.txId|type)=="string" and (.history.txId|length)>0) |
    select((._id as $id|$oldIds|index($id))==null and (.history.txId as $tx|$oldTransactions|index($tx))==null) |
    . as $record | (.history.attributeUpdates|fromjson) as $updates |
    select($classes[$updates.attrKey]!=null and ($changed|index($updates.attrKey))!=null) |
    select($updates.isMixin==false and $updates.attrClass==$classes[$updates.attrKey] and $updates.set==[$after.issue[$updates.attrKey]] and $updates.added==[] and $updates.removed==[]) |
    select(($updates|has("prevValue")|not) or $updates.prevValue==$before.issue[$updates.attrKey]) |
    select(.modifiedOn==.history.createdOn and .modifiedBy==.history.createdBy) |
    {key:$updates.attrKey,txId:.history.txId,stamp:.history.createdOn,author:.history.createdBy}
  ] as $messages |
  # Cross-project fixtures establish project and identifier changes; number may coincide.
  if ($changed|index("space"))!=null and ($changed|index("identifier"))!=null and
     ($messages|map(.key)|sort)==($changed|sort) and
     ($messages|map({txId,stamp,author})|unique|length)==1
  then $messages[0]|{stamp,author}
  else null end;

def preserved_record($old; $new; $transactions; $anchor):
  ($new._id==$old._id) and
  (
    (($new|del(.space))==($old|del(.space))) or
    (
      ([$transactions[]|select(.objectId==$new._id)] as $receipts |
        if ($receipts|length)>0 then
          all($receipts[]; .objectClass==$new._class and .objectSpace==$old.space and .operations=={space:$new.space} and .modifiedOn==$new.modifiedOn and .modifiedBy==$new.modifiedBy)
        else $anchor!=null and $anchor.stamp==$new.modifiedOn and $anchor.author==$new.modifiedBy end
      ) and
      ($new.snapshot|fromjson|.modifiedOn==$new.modifiedOn and .modifiedBy==$new.modifiedBy) and
      (($new|del(.space,.modifiedOn,.modifiedBy,.snapshot))==($old|del(.space,.modifiedOn,.modifiedBy,.snapshot))) and
      (($new.snapshot|fromjson|del(.modifiedOn,.modifiedBy))==($old.snapshot|fromjson|del(.modifiedOn,.modifiedBy)))
    )
  );
