import type { LeasePolicy } from "./admission-contract.js"

// Internal monotonic clock readings, never persisted or compared across processes.
export type MonotonicNanos = bigint
export type AttachmentLease =
  | { readonly _tag: "Eligible"; readonly expiresAt: MonotonicNanos }
  | { readonly _tag: "Retired" }
const NANOS_PER_MILLISECOND = 1_000_000n

export const makeAttachmentLease = (now: MonotonicNanos, duration: LeasePolicy["durationMillis"]): AttachmentLease => ({
  _tag: "Eligible",
  expiresAt: now + BigInt(duration) * NANOS_PER_MILLISECOND
})
export const leaseIsEligible = (lease: AttachmentLease, now: MonotonicNanos): boolean =>
  lease._tag === "Eligible" && now < lease.expiresAt
export const leaseWaitNanos = (lease: AttachmentLease, now: MonotonicNanos): MonotonicNanos =>
  lease._tag === "Eligible" && now < lease.expiresAt ? lease.expiresAt - now : 0n
