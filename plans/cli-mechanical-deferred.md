# CLI Mechanical Expansion Deferred Items

These tools were intentionally left out of the mechanical CLI expansion because they need behavior or UX beyond existing catalog metadata.

## Approval workflow actor actions need approval-specific UX and confirmation semantics.

- `add_approval_request`
- `approve_approval_request`
- `reject_approval_request`

## Binary upload or lower-level storage transport needs dedicated file/path UX beyond existing catalog metadata.

- `add_attachment`
- `add_chat_message_attachment`
- `add_inventory_product_attachment`
- `add_inventory_product_photo`
- `add_recruiting_attachment`
- `upload_drive_file`
- `upload_drive_file_version`
- `upload_file`

## Membership, ownership, and role commands need a shared member/permission CLI vocabulary.

- `add_drive_members`
- `add_space_members`
- `add_space_role_members`
- `remove_drive_members`
- `remove_space_members`
- `remove_space_role_members`
- `set_drive_owners`
- `set_space_owners`
- `set_space_role_members`
- `update_space`

## Generic object-targeting commands need a shared CLI object locator convention before exposure.

- `add_object_collaborator`
- `attach_tag`
- `create_association`
- `create_relation`
- `delete_association`
- `delete_relation`
- `detach_tag`
- `remove_object_collaborator`
- `set_custom_field`
- `subscribe_to_object_notifications`
- `unsubscribe_from_object_notifications`

## Conversation send/edit/delete commands need conversation-safe rendering and confirmation policy.

- `add_thread_reply`
- `delete_channel_message`
- `delete_dm_message`
- `delete_thread_reply`
- `send_channel_message`
- `send_dm_message`
- `update_channel_message`
- `update_dm_message`
- `update_thread_reply`

## Bulk notification actions need explicit bulk-action confirmation wording before CLI exposure.

- `archive_all_notifications`
- `mark_all_notifications_read`

## Configuration, template rendering, or process lifecycle commands need domain-specific UX beyond catalog metadata.

- `cancel_execution`
- `render_message_template`
- `start_process`
- `upsert_project_target_preference`

## Workspace/account administration needs account and role safeguards before CLI exposure.

- `create_access_link`
- `create_workspace`
- `delete_workspace`
- `update_guest_settings`
- `update_member_role`
- `update_user_profile`

## Drawing content authoring needs a structured drawing payload UX rather than generic text options.

- `create_drawing`
- `update_drawing`

## Calendar creation/update needs date, timezone, availability, or recurrence ergonomics beyond mechanical options.

- `create_event`
- `create_recurring_event`
- `create_schedule`
- `update_event`
- `update_schedule`

## SDK discovery is primarily an LLM/MCP exploration surface and needs a human CLI taxonomy decision.

- `describe_huly_space_type_capabilities`
- `get_huly_class`
- `list_huly_attributes`
- `list_huly_classes`
- `list_huly_domain_index_configurations`
- `list_huly_enums`
- `list_huly_plugin_configurations`
- `list_huly_sequences`

## Time logging and timer lifecycle commands need duration and active-timer ergonomics.

- `log_time`
- `start_timer`
- `stop_timer`
