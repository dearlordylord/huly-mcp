export const HULY_NATIVE_REFERENCE_MARKDOWN_INPUT =
  "Markdown links to current-workspace Huly browse URLs with _class, _id, and label become native Huly references; external URLs and other-workspace browse URLs stay normal links."

export const DOCUMENT_NATIVE_REFERENCE_LINK_USAGE =
  "Use markdown links to current-workspace Huly browse URLs for native references; Huly browse links returned in get_document content round-trip as native references. The URL identifies the object; link text is display text; plain issue keys stay text."

export const DOCUMENT_NATIVE_REFERENCE_TOOL_USAGE =
  `${DOCUMENT_NATIVE_REFERENCE_LINK_USAGE} External URLs stay normal markdown links.`
