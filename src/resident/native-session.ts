import type { Socket } from "node:net"
import { Data, Effect, Stdio } from "effect"

import type { makeAttachmentOwner } from "./attachment-owner.js"
import type { ResidentAttachment } from "./attachment-file.js"
import type { makeResidentAdmissions } from "./admissions.js"
import type { makeCompatibilityAuthority } from "./compatibility-authority.js"
import { withNativeAdapterAttachment } from "./adapter-attachment.js"
import { runAdapterBridge } from "./manual-adapter.js"
import { NATIVE_ACK, parseNativeHello, nativeBridgeFailure } from "./native-contract.js"
import { readNativeControl, writeNativeControl } from "./native-control.js"
import { nativeSocketStdio } from "./native-stdio.js"

// Internal control flow: retirement is an expected channel closure.
export class NativeAttachmentRetired extends Data.TaggedError("NativeAttachmentRetired") {}

export const runNativeSession = Effect.fn("runNativeSession")(function* (
  socket: Socket,
  attachment: ResidentAttachment,
  admissions: Effect.Success<ReturnType<typeof makeResidentAdmissions>>,
  authority: Effect.Success<ReturnType<typeof makeCompatibilityAuthority>>,
  claimed: Set<Effect.Success<ReturnType<typeof makeAttachmentOwner>>>
) {
  const input = yield* readNativeControl(socket)
  const hello = yield* parseNativeHello(input, attachment.authorization)
  yield* authority.verify(hello.proof)
  const owner = yield* admissions.find(hello.attachmentToken)
  yield* Effect.acquireUseRelease(
    Effect.suspend(() => {
      if (claimed.has(owner)) return Effect.fail(nativeBridgeFailure())
      claimed.add(owner)
      return Effect.void
    }),
    () =>
      withNativeAdapterAttachment(attachment, admissions, hello.attachmentToken, (exchange) =>
        writeNativeControl(socket, new Uint8Array([NATIVE_ACK])).pipe(
          Effect.andThen(
            Effect.raceFirst(
              runAdapterBridge(exchange),
              owner.closed.pipe(Effect.andThen(Effect.fail(new NativeAttachmentRetired())))
            )
          ),
          Effect.provideService(Stdio.Stdio, nativeSocketStdio(socket, admissions.renew(hello.attachmentToken)))
        )
      ),
    () =>
      Effect.sync(() => {
        claimed.delete(owner)
      })
  )
})
