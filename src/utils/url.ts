export const concatLink = (host: string, path: string): string => {
  const trimmedHost = host.endsWith("/") ? host.slice(0, -1) : host
  const trimmedPath = path.startsWith("/") ? path : `/${path}`
  return `${trimmedHost}${trimmedPath}`
}
