export const makeByteDisclosureDetector = (forbidden: ReadonlyArray<Uint8Array>) => {
  const needles = forbidden.map((bytes) => Buffer.from(bytes))
  const overlap = Math.max(1, ...needles.map((bytes) => bytes.length)) - 1
  let retained = Buffer.alloc(0)
  return (chunk: Uint8Array): boolean => {
    const combined = Buffer.concat([retained, chunk])
    const disclosed = needles.some((needle) => combined.includes(needle))
    retained = Buffer.from(combined.subarray(Math.max(0, combined.length - overlap)))
    return disclosed
  }
}
