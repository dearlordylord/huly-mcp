# Derived aggregates may reorder; membership and values remain exact.
def tree_descendants($issues; $id; $visited):
  if ($visited | index($id)) != null then error("cycle in fixture hierarchy")
  else [$issues[] | select(.attachedTo == $id) | . as $child |
    $child, tree_descendants($issues; $child._id; $visited + [$id])[]]
  end;
def tree_aggregates_valid($state):
  [$state.issues[].issue] as $issues |
  ($issues | map(._id) | length) == ($issues | map(._id) | unique | length) and
  all($issues[]; . as $issue |
    [$issues[] | select(.attachedTo == $issue._id)] as $children |
    tree_descendants($issues; $issue._id; []) as $descendants |
    ($issue.subIssues == ($children | length)) and
    ($issue.childInfo | type == "array") and
    (($issue.childInfo | map(.childId) | length) == ($issue.childInfo | map(.childId) | unique | length)) and
    (($issue.childInfo | sort_by(.childId)) ==
      ($descendants | map({childId:._id, estimation, reportedTime}) | sort_by(.childId))));
