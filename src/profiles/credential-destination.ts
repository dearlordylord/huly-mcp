import type { CredentialDestination, ResolvedCliConfiguration } from "./model.js"

export const matchesCredentialDestination = (
  saved: CredentialDestination,
  selected: Pick<ResolvedCliConfiguration, "url" | "workspace">
): boolean => saved.url === selected.url && saved.workspace === selected.workspace
