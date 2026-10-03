# Unify issue movement around a destination

Use one `move_issue` operation for changing a tracker's project and/or parent, rather than separate reparenting and cross-project transfer tools. Both actions express the final location of the same task tree; a shared operation keeps destination rules and conflict resolution coherent and reduces tool-selection ambiguity for LLM callers. Backward compatibility is not a constraint for this redesign; the schema and descriptions must explain all supported destination forms.
